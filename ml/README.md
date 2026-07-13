# ML Pipeline

## Data

`data/raw/*.csv` are the actual datasets the app seeds from (Kaggle-sourced,
per the project's data provenance). `inventory_data.csv` has 500 rows: one
row per calendar day from 2024-10-01 to 2026-02-12, each recording a
snapshot for one of 5 items (chosen quasi-randomly that day) -- it is not a
dense daily time series per item, and items are sampled irregularly (gaps
of several days between consecutive observations of the same item are
common).

## An honest finding: `Avg_Usage_Per_Day` has ~zero autocorrelation

Before committing to the feature set below, we checked whether the
target actually has learnable temporal structure:

```
corr(Avg_Usage_Per_Day, Avg_Usage_Per_Day.shift(1)) ≈ 0.012
corr(Avg_Usage_Per_Day, Current_Stock/Min_Required/Max_Capacity/Unit_Cost/Restock_Lead_Time) ≈ 0.02–0.07
```

In other words, this field is effectively independent random noise in the
source dataset -- it does not depend meaningfully on its own history or on
any other column. This is a real property of the data, not a bug in the
pipeline, and it caps how accurate *any* model trained on it can be. It
explains why:

- `ml/notebooks/demand_forecasting.ipynb`'s dense **synthetic** generator
  (2,500 rows with deliberately engineered weekly/seasonal/trend dynamics)
  achieves R² ≈ 0.96, while
- `ml/train.py`'s model on the **real** 500-row CSV achieves R² ≈ 0
  (see `models/metrics.json`) -- it cannot beat predicting close to each
  item's historical mean, because there is little more signal than that to
  find.

We chose to train and ship the honest, real-data model rather than the
synthetic one, and to report this finding rather than paper over it. The
practical framing that still holds up: the model acts as a smoothed,
context-aware estimate (folding in an item's stock/cost/lead-time
attributes) that's more robust to a single noisy daily reading than naively
trusting today's raw value -- which is what the app did before (see
`supabase/functions/run-predictions/index.ts`'s fallback formula). It is
*not* a genuine multi-day-ahead forecast, and shouldn't be presented as one.

The shortage-risk classification (`risk_ratio > 1.0`, precision 0.88,
recall 0.93, F1 0.905 -- see `models/metrics.json`) looks stronger, but
partly because the label formula includes the item's current, already-known
buffer (`current_stock - min_required`), which is deterministic information,
not something the model had to learn. Treat it as "current deficit +
weak forward signal," not as a validated demand forecast.

## Retraining

```bash
python3 ml/train.py
```

Reads `data/raw/inventory_data.csv`, writes `models/demand_regressor.txt`
(LightGBM, native text format -- no pickle deserialization risk),
`models/feature_schema.json`, and `models/metrics.json`. Re-run this
whenever the dataset changes, then rebuild/redeploy
`services/prediction-api` (see its README) so it picks up the new model.

## Serving

`services/prediction-api` is a FastAPI microservice that loads these
artifacts and is called by the Supabase `run-predictions` edge function
over HTTP (Deno can't run LightGBM natively). See that service's README
for running locally and deploying.

Cold start: the deployed app's schema originally had no way to store an
item's usage history over time (only the latest snapshot). We added
`usage_observations` (migration `20260713090000_usage_observations.sql`)
so `run-predictions` now records an observation every time it runs and
feeds up to the last 10 back into the model as lag/rolling features. Until
enough history accumulates for an item, the service falls back to using
that item's current reading as its own lag (see `_build_features` in
`services/prediction-api/app/model.py`).

## Reproducibility

`SEED = 42` throughout; `RandomizedSearchCV` uses `TimeSeriesSplit` (not
random K-fold) so cross-validation never trains on future data relative to
what it validates on. The train/test split itself is a single 80/20 cut by
date, not shuffled, for the same reason.
