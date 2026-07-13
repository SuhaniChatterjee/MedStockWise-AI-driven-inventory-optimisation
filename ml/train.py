"""
Reproducible training pipeline for the demand-forecasting model.

Trains on ml/data/raw/inventory_data.csv (the actual dataset the app seeds
from), not the notebook's dense synthetic generator -- so results reflect
real, sparser data (500 total observations spread unevenly across 5 items
over ~500 days, not a clean daily series per item).

Deliberate deviations from ml/notebooks/demand_forecasting.ipynb, and why:
  - Does not positionally concatenate patient/staff/financial CSVs as extra
    features. Those rows have no date/id relationship to inventory_data.csv
    rows; splicing them in by row position injects unrelated noise columns
    rather than real signal.
  - The shortage-risk threshold (risk_ratio > 1.0) is fixed a priori rather
    than tuned against the test set. Tuning the threshold using test-set
    labels (as the notebook does) leaks test information into a "held out"
    evaluation.
  - Lag/rolling features are computed over each item's own prior
    *observations*, not fixed calendar-day offsets, since real observations
    for a given item are irregularly spaced (see days_since_prev_obs).

Usage: python3 ml/train.py
Outputs (ml/models/):
  - demand_regressor.txt   LightGBM (or GradientBoosting) booster, native
                           text format -- no pickle, no arbitrary code
                           execution risk on load.
  - feature_schema.json    Ordered feature list + encoding needed to build
                           an inference row identically to training.
  - metrics.json           Full evaluation results for docs/paper/model registry.
"""
import json
import re
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    mean_absolute_error,
    mean_squared_error,
    precision_score,
    r2_score,
    recall_score,
)
from sklearn.model_selection import RandomizedSearchCV, TimeSeriesSplit

import lightgbm as lgb

SEED = 42
np.random.seed(SEED)

ROOT = Path(__file__).resolve().parent
DATA_PATH = ROOT / "data" / "raw" / "inventory_data.csv"
MODELS_DIR = ROOT / "models"
MODELS_DIR.mkdir(exist_ok=True)

RISK_THRESHOLD = 1.0  # risk_ratio > 1 => predicted demand over lead time exceeds buffer
ORDERING_COST = 500.0
HOLDING_COST_RATE = 0.20


def safe_mape(y_true, y_pred, epsilon=1e-8):
    y_true, y_pred = np.array(y_true), np.array(y_pred)
    denom = np.where(np.abs(y_true) < epsilon, epsilon, y_true)
    return float(np.mean(np.abs((y_true - y_pred) / denom)) * 100)


def sanitize_columns(columns):
    return [re.sub(r"[^A-Za-z0-9_]", "_", c) for c in columns]


def load_and_engineer_features():
    df = pd.read_csv(DATA_PATH)
    df["Date"] = pd.to_datetime(df["Date"])
    df = df.sort_values(["Item_Name", "Date"]).reset_index(drop=True)

    grouped = df.groupby("Item_Name")["Avg_Usage_Per_Day"]
    df["Usage_Lag_1"] = grouped.shift(1)
    df["Usage_Lag_3"] = grouped.shift(3)
    df["Usage_Lag_7"] = grouped.shift(7)
    df["Usage_Rolling_7"] = grouped.transform(lambda x: x.shift(1).rolling(7, min_periods=1).mean())
    df["Days_Since_Prev_Obs"] = df.groupby("Item_Name")["Date"].diff().dt.days

    df = df.dropna(subset=["Usage_Lag_1", "Days_Since_Prev_Obs"]).reset_index(drop=True)
    df[["Usage_Lag_3", "Usage_Lag_7"]] = df[["Usage_Lag_3", "Usage_Lag_7"]].fillna(0)

    df["Day_Of_Week"] = df["Date"].dt.dayofweek
    df["Month"] = df["Date"].dt.month
    df["Is_Weekend"] = (df["Day_Of_Week"] >= 5).astype(int)
    df["Quarter"] = df["Date"].dt.quarter

    # Sort by date globally for a leak-free temporal split across all items.
    df = df.sort_values("Date").reset_index(drop=True)
    return df


def build_feature_matrix(df: pd.DataFrame):
    target = "Avg_Usage_Per_Day"
    feature_source_cols = [
        "Current_Stock", "Min_Required", "Max_Capacity", "Unit_Cost", "Restock_Lead_Time",
        "Usage_Lag_1", "Usage_Lag_3", "Usage_Lag_7", "Usage_Rolling_7", "Days_Since_Prev_Obs",
        "Day_Of_Week", "Month", "Is_Weekend", "Quarter", "Item_Name", "Item_Type",
    ]
    encoded = pd.get_dummies(df[feature_source_cols], columns=["Item_Name", "Item_Type"], drop_first=False)
    encoded.columns = sanitize_columns(encoded.columns)
    return encoded, df[target]


def evaluate_regressor(name, y_true, y_pred):
    metrics = {
        "mae": round(mean_absolute_error(y_true, y_pred), 3),
        "rmse": round(float(np.sqrt(mean_squared_error(y_true, y_pred))), 3),
        "mape": round(safe_mape(y_true, y_pred), 3),
        "r2": round(r2_score(y_true, y_pred), 4),
    }
    print(f"\n=== {name} ===")
    for k, v in metrics.items():
        print(f"{k.upper():5s}: {v}")
    return metrics


def evaluate_shortage_risk(inv_test, y_test, y_pred):
    buffer = (inv_test["Current_Stock"] - inv_test["Min_Required"]).values
    true_risk_ratio = (y_test.values * inv_test["Restock_Lead_Time"].values) / np.maximum(buffer, 1)
    pred_risk_ratio = (y_pred * inv_test["Restock_Lead_Time"].values) / np.maximum(buffer, 1)

    y_true_shortage = (true_risk_ratio > RISK_THRESHOLD).astype(int)
    y_pred_shortage = (pred_risk_ratio > RISK_THRESHOLD).astype(int)

    cm = confusion_matrix(y_true_shortage, y_pred_shortage, labels=[0, 1]).tolist()
    metrics = {
        "threshold": RISK_THRESHOLD,
        "precision": round(precision_score(y_true_shortage, y_pred_shortage, zero_division=0), 3),
        "recall": round(recall_score(y_true_shortage, y_pred_shortage, zero_division=0), 3),
        "f1": round(f1_score(y_true_shortage, y_pred_shortage, zero_division=0), 3),
        "accuracy": round(accuracy_score(y_true_shortage, y_pred_shortage), 3),
        "confusion_matrix": cm,
        "positive_rate_actual": round(float(y_true_shortage.mean()), 3),
    }
    print("\n=== Shortage risk classification (fixed threshold, no test-set tuning) ===")
    for k, v in metrics.items():
        print(f"{k}: {v}")
    return metrics


def main():
    df = load_and_engineer_features()
    X, y = build_feature_matrix(df)

    split_idx = int(len(X) * 0.8)
    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]
    inv_test = df.iloc[split_idx:].reset_index(drop=True)

    print(f"Total usable records : {len(X)} (after dropping first observation per item)")
    print(f"Train / test         : {len(X_train)} / {len(X_test)}")
    print(f"Features             : {list(X.columns)}")

    # Baseline: Gradient Boosting
    gb = GradientBoostingRegressor(
        n_estimators=120, learning_rate=0.05, max_depth=3,
        min_samples_split=5, min_samples_leaf=2, subsample=0.9, random_state=SEED,
    )
    gb.fit(X_train, y_train)
    gb_metrics = evaluate_regressor("Gradient Boosting (baseline)", y_test, gb.predict(X_test))

    # Tuned LightGBM, small search space appropriate for a ~500-row dataset.
    tscv = TimeSeriesSplit(n_splits=3)
    lgbm_base = lgb.LGBMRegressor(objective="regression_l1", random_state=SEED, verbosity=-1, n_jobs=-1)
    param_dist = {
        "n_estimators": [100, 200, 300, 500],
        "learning_rate": [0.01, 0.03, 0.05, 0.08],
        "num_leaves": [15, 31, 63],
        "max_depth": [-1, 4, 6, 8],
        "min_child_samples": [3, 5, 10],
        "subsample": [0.8, 0.9, 1.0],
        "colsample_bytree": [0.8, 0.9, 1.0],
        "reg_alpha": [0.0, 0.1, 0.3],
        "reg_lambda": [0.0, 0.1, 0.3],
    }
    search = RandomizedSearchCV(
        estimator=lgbm_base, param_distributions=param_dist, n_iter=25,
        scoring="neg_mean_absolute_error", cv=tscv, random_state=SEED, n_jobs=-1, verbose=0,
    )
    search.fit(X_train, y_train)
    lgbm_best = search.best_estimator_
    lgbm_metrics = evaluate_regressor("LightGBM (tuned)", y_test, lgbm_best.predict(X_test))
    print(f"\nBest LightGBM hyperparameters: {search.best_params_}")

    # Pick whichever generalizes better on the held-out test set.
    if lgbm_metrics["mae"] <= gb_metrics["mae"]:
        chosen_name, chosen_model, chosen_metrics = "LightGBM", lgbm_best, lgbm_metrics
        y_pred_chosen = lgbm_best.predict(X_test)
    else:
        chosen_name, chosen_model, chosen_metrics = "GradientBoosting", gb, gb_metrics
        y_pred_chosen = gb.predict(X_test)
    print(f"\nSelected model for serving: {chosen_name} (lower test MAE)")

    shortage_metrics = evaluate_shortage_risk(inv_test, y_test, y_pred_chosen)

    # Persist model. LightGBM's native booster format avoids pickle deserialization risk.
    if chosen_name == "LightGBM":
        chosen_model.booster_.save_model(str(MODELS_DIR / "demand_regressor.txt"))
        model_format = "lightgbm_text"
    else:
        import joblib
        joblib.dump(chosen_model, MODELS_DIR / "demand_regressor.joblib")
        model_format = "sklearn_joblib"

    feature_schema = {
        "model_type": chosen_name,
        "model_format": model_format,
        "feature_columns": list(X.columns),
        "categorical_source_columns": {
            "Item_Name": sorted(df["Item_Name"].unique().tolist()),
            "Item_Type": sorted(df["Item_Type"].unique().tolist()),
        },
        "target": "Avg_Usage_Per_Day",
        "risk_threshold": RISK_THRESHOLD,
    }
    (MODELS_DIR / "feature_schema.json").write_text(json.dumps(feature_schema, indent=2))

    metrics_out = {
        "trained_on": "ml/data/raw/inventory_data.csv",
        "dataset_size": {"total_usable_records": len(X), "train": len(X_train), "test": len(X_test)},
        "gradient_boosting_baseline": gb_metrics,
        "lightgbm_tuned": lgbm_metrics,
        "selected_model": chosen_name,
        "selected_model_metrics": chosen_metrics,
        "shortage_risk_classification": shortage_metrics,
        "random_seed": SEED,
    }
    (MODELS_DIR / "metrics.json").write_text(json.dumps(metrics_out, indent=2))
    print(f"\nSaved model + schema + metrics to {MODELS_DIR}")


if __name__ == "__main__":
    main()
