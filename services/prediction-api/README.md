# Prediction API

FastAPI microservice that serves the **global weather-informed demand model**
(see [`ml/README.md`](../../ml/README.md)) as pre-distilled per-(category,
region) **seasonal multiplier curves**. Called by the Supabase `run-predictions`
edge function.

## How it works

The global model predicts demand in the *training data's* units, which don't
match any given hospital item's scale. So instead of serving the model
directly, `ml/export_seasonal_curves.py` distills it into
`ml/models/seasonal_multipliers.json` — a normalized (mean 1.0) seasonal curve
per demand category per climate region. Serving is then scale-invariant:

```
forecast_daily = item_baseline_usage × seasonal_multiplier[category][region][day]
estimated_demand = forecast_daily × restock_lead_time
```

The multiplier carries the seasonal/weather **shape** (learned from real data);
the item's own baseline usage carries the **level**. So it transfers to any
hospital item at any magnitude with **no retraining**. `general`-category items
(equipment, most PPE) get a flat 1.0 — no seasonal adjustment.

Because serving is just a JSON lookup + arithmetic, this container needs **no
LightGBM/pandas** — only fastapi/uvicorn/pydantic.

## Run locally

```bash
# from the repo root
python3 ml/train_global.py            # -> ml/models/global_demand_model.txt
python3 ml/export_seasonal_curves.py  # -> ml/models/seasonal_multipliers.json
cd services/prediction-api
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "current_stock": 180, "min_required": 200, "max_capacity": 500,
    "unit_cost": 8500, "avg_usage_per_day": 100, "restock_lead_time": 10,
    "item_type": "Consumable", "item_name": "Oxygen Tanks",
    "demand_category": "respiratory_airway", "region": "temperate",
    "prediction_date": "2026-01-15"
  }'
```

## API

- `GET /health` — liveness, no auth.
- `GET /model-info` — categories, regions, version.
- `POST /predict` — see `app/schemas.py`. Key inputs: `avg_usage_per_day`
  (the item's baseline), `demand_category`, `region`, optional
  `prediction_date`. Both info/predict require `X-API-Key` matching
  `PREDICTION_API_KEY` if that env var is set.

## Deploying

Any container host. Build from the **repo root** so the Dockerfile can copy
`ml/models/seasonal_multipliers.json`:

```bash
docker build -f services/prediction-api/Dockerfile -t medstockwise-prediction-api .
docker run -p 8000:8000 -e PREDICTION_API_KEY=<secret> medstockwise-prediction-api
```

`run-predictions` falls back to a formula (no seasonal adjustment, labeled
`model_source: "fallback_formula"`) if this service is unset or unreachable,
so the app keeps working during deploys.

## Retraining / refreshing the curves

Re-run `python3 ml/train_global.py && python3 ml/export_seasonal_curves.py`
whenever the model changes, then rebuild/redeploy this service. Tests:
`python3 -m pytest services/prediction-api/`.
