# Prediction API

FastAPI microservice serving the LightGBM demand-forecasting model trained
by [`ml/train.py`](../../ml/train.py). Replaces the hardcoded
`avg_usage_per_day × restock_lead_time` formula that used to live directly
inside the Supabase `run-predictions` edge function.

## Why a separate service

The model is trained in Python (LightGBM); Supabase edge functions run on
Deno. Rather than re-implementing LightGBM tree inference in TypeScript,
this service hosts the real trained model and the edge function calls it
over HTTP (see `supabase/functions/run-predictions/index.ts`).

## Run locally

```bash
# from the repo root
python3 ml/train.py                 # produces ml/models/*.{txt,json}
cd services/prediction-api
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "current_stock": 180, "min_required": 200, "max_capacity": 500,
    "unit_cost": 8500, "avg_usage_per_day": 8, "restock_lead_time": 20,
    "item_type": "Equipment", "item_name": "Oxygen Tanks", "history": []
  }'
```

## API

- `GET /health` -- liveness check, no auth.
- `GET /model-info` -- model type, feature list, training metrics.
- `POST /predict` -- see `app/schemas.py` for the request/response shape.
  `history` is a list of `{observed_at, avg_usage_per_day}` for the item,
  most recent last; pass `[]` for a cold-start item with no recorded
  history (the model falls back to using today's reading as its own lag,
  see `ml/README.md` for why).

Both `/model-info` and `/predict` require an `X-API-Key` header matching
the `PREDICTION_API_KEY` env var, if that env var is set. **Always set it
before deploying publicly** -- without it the endpoint is unauthenticated.

## Deploying

Any container host works (Render, Railway, Fly.io, a VM, etc.). Build from
the **repo root**, not this directory, so the Dockerfile can pick up
`ml/models/`:

```bash
docker build -f services/prediction-api/Dockerfile -t medstockwise-prediction-api .
docker run -p 8000:8000 -e PREDICTION_API_KEY=<generate-a-secret> medstockwise-prediction-api
```

Then point the Supabase edge function at it:

```bash
supabase secrets set PREDICTION_API_URL=https://<your-deployed-service>
supabase secrets set PREDICTION_API_KEY=<same-secret-as-above>
```

If `PREDICTION_API_URL` is unset, unreachable, or errors, `run-predictions`
falls back to the original formula-based estimate rather than failing the
request outright (see the fallback logic in that function) -- so the app
keeps working before this service is deployed, just without the real model.

## Retraining

Re-run `python3 ml/train.py` from the repo root whenever `ml/data/raw/inventory_data.csv`
is updated, then rebuild/redeploy this service so it picks up the new
`ml/models/demand_regressor.txt`.
