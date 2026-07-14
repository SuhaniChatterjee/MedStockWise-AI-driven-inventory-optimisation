# ML Pipeline

## Current model: weather-informed global demand model (`ml/train_global.py`)

**Goal:** train once, serve every hospital, and generalize **zero-shot** to a
new hospital's items with **no retraining** — because the features describe
the *item and its context* (demand category, calendar, weather, its own recent
usage), never the hospital's identity. A new hospital's item is just a new
feature vector the model already knows how to score.

### Data foundation (why we changed it)

The original `inventory_data.csv` (documented below) has a noise target, so no
model could ever generalize from it. The global model instead trains on:

- **Real demand:** `data/raw/pharma_salesdaily.csv` — the public Pharma Sales
  dataset (2014–2019, daily sales across 8 ATC drug categories). It has
  **real, epidemiologically-coherent seasonality**: antihistamines (allergy)
  peak in spring, airway/asthma drugs peak in cold months, antipyretics in
  fever season — and real lag autocorrelation (0.15–0.47) vs the old data's
  ~0.01. The 8 ATC codes are grouped into 5 **demand categories**
  (`allergy`, `respiratory_airway`, `analgesic`, `anti_inflammatory`,
  `sedative`); R03/R06 are kept separate on purpose since their seasonality is
  opposite.
- **Real weather:** `data/raw/weather_<region>.csv`, pulled from the free
  Open-Meteo archive by `ml/fetch_weather.py` (committed so training is
  reproducible offline). Training joins the **temperate** file (Belgrade) —
  the climate the pharmacy data actually came from. The tropical (Mumbai) and
  subtropical (Delhi) files are for multi-region *serving*, not training.

### Results (`ml/models/global_metrics.json`)

| Evaluation | Result |
|---|---|
| Temporal holdout **R²** | **0.71** (vs the old noise dataset's ~ -0.01) |
| MAE / WAPE | 4.67 units/day / 37% |
| **Zero-shot** (leave-one-demand-category-out) | **all 5** held-out categories beat the mean baseline — allergy 3.54 vs 11.11, respiratory 6.20 vs 9.11 |
| Weather ablation | with-weather MAE only ~1% better than without |

Two of these deserve honesty:

- **R² 0.71 is the headline** — it proves the new data foundation actually
  supports a learnable, generalizing model, which the old data never could.
  The zero-shot result is the direct evidence for the "new hospital, unseen
  item type, no retraining, still useful" claim.
- **Weather adds only ~1% to single-location accuracy.** That's expected and
  we don't oversell it: at one training location, calendar features (month,
  week-of-year) are highly collinear with weather, so weather is largely
  redundant *for accuracy there*. Its real purpose is **cross-region
  differentiation at serving time** — feeding a tropical hospital's actual
  weather to the same model produces a region-appropriate forecast that
  calendar alone cannot. That's demonstrated at serving (see the prediction
  service), not in this single-site training number.
- **WAPE ~37%** reflects that day-to-day intermittent count demand is
  genuinely hard to predict exactly; R² shows the model captures the
  structure well despite that.

### Honest limits

- The pharmacy's exact location isn't published; temperate/Belgrade is a
  reasonable, documented assumption consistent with the observed seasonality.
- The **multi-region layer is simulation**: real weather-response learned from
  real (temperate) data, applied to other regions' real weather. It is not a
  validated multi-hospital accuracy claim — it demonstrates the architecture's
  region-differentiation behavior, honestly labeled.

### Reproduce

```bash
python3 ml/fetch_weather.py            # caches weather CSVs (no-op if present)
python3 ml/train_global.py            # -> global_demand_model.txt + schema + metrics
python3 ml/export_seasonal_curves.py  # -> seasonal_multipliers.json (what serving uses)
python3 -m pytest ml/                 # leakage / determinism / mapping / no-identity checks
```

### Continuous learning without per-hospital retraining

Two distinct things adapt, neither of which retrains the model when a hospital
onboards:

1. **Zero-shot serving (no retraining, ever, per hospital).** The model is
   global; a new hospital's item is just a new feature vector. This is the
   core "train once, works for everyone" property.
2. **Closed-loop model refresh (retrains the *shared* model as data evolves).**
   - *Signal:* in-app monitoring (`_shared/monitoring.ts`) raises `data_drift`
     alerts when a hospital's real usage diverges from its captured baseline.
   - *Actuator:* `.github/workflows/retrain.yml` regenerates the model +
     seasonal curves, runs the tests, commits the refreshed artifacts, and
     redeploys the prediction API. Trigger it manually when drift warrants, or
     let the weekly schedule run it (standard "continual training" via CI).
   - To close the loop automatically, add `RENDER_API_KEY` + `RENDER_SERVICE_ID`
     as repo secrets so the workflow's redeploy step fires.

   This is deliberately *not* true per-example online learning (River et al.):
   for noisy tabular demand, scheduled/triggered batch retraining is more
   robust and is what production MLOps actually does.

---

## (Superseded) original single-snapshot approach

The sections below describe the earlier `ml/train.py` model on
`inventory_data.csv`. That model is still what the *currently-deployed*
prediction service uses until the global model is wired in; it's kept here for
provenance. Its core limitation — a noise target — is exactly what motivated
the global model above.

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
