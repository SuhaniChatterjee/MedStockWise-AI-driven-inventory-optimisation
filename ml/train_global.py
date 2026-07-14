"""
Global, weather-informed demand model -- trained once, generalizes zero-shot
to any new hospital/item WITHOUT per-hospital retraining.

Why this exists (see ml/README.md for the full story):
  The original inventory_data.csv had a noise target (~0.01 autocorrelation),
  so no model could generalize from it. This trains instead on REAL demand
  with real seasonality (Pharma Sales dataset, ml/data/raw/pharma_salesdaily.csv)
  joined with REAL weather (Open-Meteo, ml/data/raw/weather_temperate.csv --
  the climate the pharmacy data actually came from).

Key design choice for zero-shot generalization: the feature set describes the
ITEM AND ITS CONTEXT (demand category, calendar, weather, its own recent-usage
lags) -- and deliberately contains NO hospital/location identity. So a brand-
new hospital's item is just a new feature vector the model already knows how to
score; nothing about the model needs to change when a hospital onboards.

Run: python3 ml/train_global.py
Outputs to ml/models/: global_demand_model.txt, global_feature_schema.json,
global_metrics.json
"""
import json
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import RandomizedSearchCV, TimeSeriesSplit

SEED = 42
np.random.seed(SEED)

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data" / "raw"
MODELS_DIR = ROOT / "models"
MODELS_DIR.mkdir(exist_ok=True)

# Map the 8 ATC drug-sales columns to generic demand categories the app can
# also tag inventory items with. R03 (airway) and R06 (allergy) are kept
# SEPARATE on purpose -- they have opposite seasonality (winter vs spring), so
# grouping them would cancel the signal. The pharmacologically-similar pairs
# are summed.
ATC_TO_CATEGORY = {
    "M01AB": "anti_inflammatory",
    "M01AE": "anti_inflammatory",
    "N02BA": "analgesic",
    "N02BE": "analgesic",
    "N05B": "sedative",
    "N05C": "sedative",
    "R03": "respiratory_airway",
    "R06": "allergy",
}
DEMAND_CATEGORIES = sorted(set(ATC_TO_CATEGORY.values()))

WEATHER_COLS = ["temp_mean", "temp_min", "precip", "temp_roll7"]


def wape(y_true, y_pred):
    """Weighted Absolute Percentage Error = sum|err| / sum|actual|.
    Used instead of MAPE because this is intermittent count demand with many
    zero-sales days -- MAPE divides by per-row actuals and explodes on zeros,
    whereas WAPE is the standard, robust metric for intermittent demand."""
    y_true, y_pred = np.array(y_true), np.array(y_pred)
    denom = np.sum(np.abs(y_true))
    return float(np.sum(np.abs(y_true - y_pred)) / denom * 100) if denom > 0 else float("nan")


def load_long_demand() -> pd.DataFrame:
    """Reshape the wide pharma CSV to long: one row per (demand_category, date)."""
    df = pd.read_csv(DATA_DIR / "pharma_salesdaily.csv")
    df["date"] = pd.to_datetime(df["datum"], format="%m/%d/%Y")

    atc_cols = list(ATC_TO_CATEGORY.keys())
    long = df.melt(id_vars=["date"], value_vars=atc_cols, var_name="atc", value_name="demand")
    long["demand_category"] = long["atc"].map(ATC_TO_CATEGORY)
    # Sum the pharmacologically-similar ATC pairs into their category.
    grouped = (
        long.groupby(["demand_category", "date"], as_index=False)["demand"].sum()
        .sort_values(["demand_category", "date"])
        .reset_index(drop=True)
    )
    return grouped


def add_weather(df: pd.DataFrame, region: str = "temperate") -> pd.DataFrame:
    """Join the climate region's daily weather. Training uses 'temperate' --
    the climate the real pharma demand actually co-occurred with."""
    w = pd.read_csv(DATA_DIR / f"weather_{region}.csv")
    w["date"] = pd.to_datetime(w["date"])
    w["temp_roll7"] = w["temp_mean"].rolling(7, min_periods=1).mean()
    return df.merge(w[["date", "temp_mean", "temp_min", "precip", "temp_roll7"]], on="date", how="left")


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.sort_values(["demand_category", "date"]).copy()

    grp = df.groupby("demand_category")["demand"]
    df["lag_1"] = grp.shift(1)
    df["lag_7"] = grp.shift(7)
    df["lag_14"] = grp.shift(14)
    df["roll_7"] = grp.transform(lambda s: s.shift(1).rolling(7, min_periods=1).mean())

    df["month"] = df["date"].dt.month
    df["dayofweek"] = df["date"].dt.dayofweek
    df["weekofyear"] = df["date"].dt.isocalendar().week.astype(int)
    df["is_weekend"] = (df["dayofweek"] >= 5).astype(int)

    # Drop the initial per-category rows with no lag_1, then sort globally by
    # date so a single temporal split is leak-free across all categories.
    df = df.dropna(subset=["lag_1"]).copy()
    df[["lag_7", "lag_14"]] = df[["lag_7", "lag_14"]].fillna(0)
    return df.sort_values("date").reset_index(drop=True)


def build_matrix(df: pd.DataFrame, use_weather: bool = True):
    cat_cols = [f"cat_{c}" for c in DEMAND_CATEGORIES]
    for c in DEMAND_CATEGORIES:
        df[f"cat_{c}"] = (df["demand_category"] == c).astype(int)

    feature_cols = (
        ["month", "dayofweek", "weekofyear", "is_weekend", "lag_1", "lag_7", "lag_14", "roll_7"]
        + cat_cols
        + (WEATHER_COLS if use_weather else [])
    )
    return df[feature_cols].copy(), df["demand"].astype(float), feature_cols


def temporal_split(X, y, frac=0.8):
    idx = int(len(X) * frac)
    return X.iloc[:idx], X.iloc[idx:], y.iloc[:idx], y.iloc[idx:]


def train_lgbm(X_train, y_train, n_iter=25):
    tscv = TimeSeriesSplit(n_splits=3)
    base = lgb.LGBMRegressor(objective="regression_l1", random_state=SEED, verbosity=-1, n_jobs=-1)
    param_dist = {
        "n_estimators": [200, 400, 600, 900],
        "learning_rate": [0.01, 0.03, 0.05, 0.08],
        "num_leaves": [15, 31, 63, 127],
        "max_depth": [-1, 6, 10, 16],
        "min_child_samples": [5, 10, 20],
        "subsample": [0.8, 0.9, 1.0],
        "colsample_bytree": [0.8, 0.9, 1.0],
        "reg_alpha": [0.0, 0.1, 0.3],
        "reg_lambda": [0.0, 0.1, 0.3],
    }
    search = RandomizedSearchCV(
        base, param_dist, n_iter=n_iter, scoring="neg_mean_absolute_error",
        cv=tscv, random_state=SEED, n_jobs=-1, verbose=0,
    )
    search.fit(X_train, y_train)
    return search.best_estimator_, search.best_params_


def evaluate(y_true, y_pred, label):
    m = {
        "mae": round(mean_absolute_error(y_true, y_pred), 3),
        "rmse": round(float(np.sqrt(mean_squared_error(y_true, y_pred))), 3),
        "wape": round(wape(y_true, y_pred), 2),
        "r2": round(r2_score(y_true, y_pred), 4),
    }
    print(f"\n=== {label} ===")
    for k, v in m.items():
        print(f"  {k.upper():5s}: {v}")
    return m


def main():
    base = add_features(add_weather(load_long_demand()))
    print(f"Total (category, date) rows: {len(base)} across {base['demand_category'].nunique()} categories")
    print(f"Date range: {base['date'].min().date()} .. {base['date'].max().date()}")

    # --- Evaluation 1: temporal holdout (the core "does the new data work" test)
    X, y, feature_cols = build_matrix(base, use_weather=True)
    X_train, X_test, y_train, y_test = temporal_split(X, y)
    model, best_params = train_lgbm(X_train, y_train)
    holdout = evaluate(y_test, model.predict(X_test), "Temporal holdout (with weather)")
    print(f"\nBest hyperparameters: {best_params}")

    # --- Evaluation 2: weather ablation (what do the weather features add?)
    Xnw, ynw, _ = build_matrix(base, use_weather=False)
    Xnw_tr, Xnw_te, ynw_tr, ynw_te = temporal_split(Xnw, ynw)
    model_nw, _ = train_lgbm(Xnw_tr, ynw_tr)
    ablation = evaluate(ynw_te, model_nw.predict(Xnw_te), "Temporal holdout (NO weather)")

    # --- Evaluation 3: leave-one-demand-category-out (zero-shot to unseen item type)
    print("\n=== Leave-one-demand-category-out (zero-shot generalization) ===")
    loco = {}
    for held in DEMAND_CATEGORIES:
        train_mask = base["demand_category"] != held
        test_mask = base["demand_category"] == held
        Xh, yh, _ = build_matrix(base, use_weather=True)
        # Temporal test window on the held-out category only.
        held_idx = base.index[test_mask]
        cut = int(len(held_idx) * 0.8)
        test_idx = held_idx[cut:]

        m, _ = train_lgbm(Xh.loc[base.index[train_mask]], yh.loc[base.index[train_mask]], n_iter=15)
        pred = m.predict(Xh.loc[test_idx])
        actual = yh.loc[test_idx]
        mae = mean_absolute_error(actual, pred)
        mae_baseline = mean_absolute_error(actual, np.full(len(actual), yh.loc[base.index[train_mask]].mean()))
        loco[held] = {
            "mae": round(mae, 3),
            "mae_mean_baseline": round(mae_baseline, 3),
            "beats_baseline": bool(mae < mae_baseline),
        }
        print(f"  {held:20s} MAE={mae:8.2f}  (mean-baseline {mae_baseline:8.2f})  "
              f"{'BEATS baseline' if mae < mae_baseline else 'no better than mean'}")

    # --- Persist the with-weather model (native text format -> no pickle risk)
    model.booster_.save_model(str(MODELS_DIR / "global_demand_model.txt"))

    schema = {
        "model_type": "LightGBM",
        "feature_columns": feature_cols,
        "demand_categories": DEMAND_CATEGORIES,
        "atc_to_category": ATC_TO_CATEGORY,
        "weather_columns": WEATHER_COLS,
        "target": "daily_demand",
        "trained_on": "ml/data/raw/pharma_salesdaily.csv + weather_temperate.csv",
        "notes": "No location/hospital identity in features -> zero-shot across hospitals & regions.",
    }
    (MODELS_DIR / "global_feature_schema.json").write_text(json.dumps(schema, indent=2))

    metrics = {
        "temporal_holdout_with_weather": holdout,
        "temporal_holdout_no_weather": ablation,
        "weather_improvement_mae": round(ablation["mae"] - holdout["mae"], 3),
        "leave_one_category_out": loco,
        "dataset_rows": len(base),
        "random_seed": SEED,
        "best_params": best_params,
    }
    (MODELS_DIR / "global_metrics.json").write_text(json.dumps(metrics, indent=2))

    print(f"\nWeather features reduced MAE by {ablation['mae'] - holdout['mae']:.3f} "
          f"({100*(ablation['mae']-holdout['mae'])/max(ablation['mae'],1e-9):.1f}%).")
    print(f"Saved model + schema + metrics to {MODELS_DIR}")


if __name__ == "__main__":
    main()
