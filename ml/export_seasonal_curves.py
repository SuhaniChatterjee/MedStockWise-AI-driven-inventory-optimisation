"""
Distills the global demand model into per-(category, region) SEASONAL
MULTIPLIER curves and writes ml/models/seasonal_multipliers.json.

Why distill instead of serving the model directly:
  The global model predicts demand in the pharma dataset's UNITS (~0-50/day).
  A hospital's glove demand is on a totally different scale, so raw model
  output is meaningless for a hospital item. The scale-invariant fix: the model
  provides the seasonal SHAPE (a multiplier), the item's own baseline usage
  provides the LEVEL. forecast = item_baseline x multiplier[cat][region][day].

How the curve is built, per category x region:
  Run the model across a full representative year using that region's WEATHER
  CLIMATOLOGY (average weather by day-of-year, 2014-2019), holding lags at the
  category's mean and day-of-week fixed to a weekday -- so the curve isolates
  the seasonal/weather effect. Normalize the year to mean 1.0 -> a pure
  multiplier (e.g. allergy items ~1.4x in May, ~0.6x in December).

'general'-category items get no curve -> a flat 1.0 at serving (no seasonal
adjustment), which is the honest behavior for equipment/PPE.

Run: python3 ml/export_seasonal_curves.py  (after ml/train_global.py)
"""
import json
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

from train_global import (
    DEMAND_CATEGORIES,
    WEATHER_COLS,
    add_weather,
    load_long_demand,
)

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data" / "raw"
MODELS_DIR = ROOT / "models"
REGIONS = ["temperate", "tropical", "subtropical"]
REF_YEAR = 2019  # any non-special year for mapping day-of-year -> a date

booster = lgb.Booster(model_file=str(MODELS_DIR / "global_demand_model.txt"))
schema = json.loads((MODELS_DIR / "global_feature_schema.json").read_text())
FEATURE_COLS = schema["feature_columns"]


def category_mean_demand() -> dict:
    long = load_long_demand()
    return long.groupby("demand_category")["demand"].mean().to_dict()


def weather_climatology(region: str) -> pd.DataFrame:
    """Average weather by day-of-year across all years for a region."""
    w = pd.read_csv(DATA_DIR / f"weather_{region}.csv")
    w["date"] = pd.to_datetime(w["date"])
    w["temp_roll7"] = w["temp_mean"].rolling(7, min_periods=1).mean()
    w["doy"] = w["date"].dt.dayofyear
    clim = w.groupby("doy")[["temp_mean", "temp_min", "precip", "temp_roll7"]].mean()
    return clim


def build_year_rows(category: str, clim: pd.DataFrame, cat_mean: float) -> pd.DataFrame:
    dates = pd.date_range(f"{REF_YEAR}-01-01", f"{REF_YEAR}-12-31", freq="D")
    rows = []
    for d in dates:
        doy = d.dayofyear
        wx = clim.loc[doy] if doy in clim.index else clim.iloc[-1]
        row = {
            "month": d.month,
            # Fixed to a mid-week weekday so the curve is seasonal, not weekly.
            "dayofweek": 2,
            "weekofyear": int(d.isocalendar().week),
            "is_weekend": 0,
            # Lags held at the category mean -> curve reflects season/weather only.
            "lag_1": cat_mean,
            "lag_7": cat_mean,
            "lag_14": cat_mean,
            "roll_7": cat_mean,
            "temp_mean": wx["temp_mean"],
            "temp_min": wx["temp_min"],
            "precip": wx["precip"],
            "temp_roll7": wx["temp_roll7"],
        }
        for c in DEMAND_CATEGORIES:
            row[f"cat_{c}"] = 1 if c == category else 0
        rows.append(row)
    return pd.DataFrame(rows)[FEATURE_COLS]


def main():
    means = category_mean_demand()
    curves = {}

    for region in REGIONS:
        clim = weather_climatology(region)
        for category in DEMAND_CATEGORIES:
            X = build_year_rows(category, clim, means[category])
            pred = booster.predict(X)
            pred = np.clip(pred, 0, None)
            mult = pred / max(pred.mean(), 1e-9)  # normalize to mean 1.0
            curves.setdefault(category, {})[region] = [round(float(m), 4) for m in mult]

    out = {
        "reference_year_days": 365,
        "indexing": "day_of_year 1..365 -> curves[category][region][doy-1]",
        "categories": DEMAND_CATEGORIES,
        "regions": REGIONS,
        "general_multiplier": 1.0,  # items with no seasonal analog
        "curves": curves,
    }
    (MODELS_DIR / "seasonal_multipliers.json").write_text(json.dumps(out, indent=1))

    # Quick sanity readout: peak month per (category, temperate).
    print("Seasonal peak month by category (temperate region):")
    for category in DEMAND_CATEGORIES:
        arr = np.array(curves[category]["temperate"])
        peak_doy = int(arr.argmax()) + 1
        peak_month = pd.Timestamp(f"{REF_YEAR}-01-01").dayofyear  # placeholder
        peak_month = (pd.Timestamp(f"{REF_YEAR}-01-01") + pd.Timedelta(days=peak_doy - 1)).month
        print(f"  {category:20s} peak≈month {peak_month:2d}  (min {arr.min():.2f}, max {arr.max():.2f})")
    print(f"\nWrote {MODELS_DIR/'seasonal_multipliers.json'}")


if __name__ == "__main__":
    main()
