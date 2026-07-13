# MedStock Wise

AI-assisted hospital inventory management: demand forecasting, cost optimization (EOQ/reorder points), low-stock alerting, and role-based inventory tracking.

## Overview

MedStock Wise is a React/Supabase web app that tracks hospital inventory (equipment and consumables), predicts near-term demand for each item, flags items at risk of running out, and recommends order quantities. Predictions are served by a real trained LightGBM model via a separate FastAPI microservice, not a hardcoded formula.

**Full documentation:**
- [docs/architecture.md](docs/architecture.md) — system design, data flow, why it's shaped this way
- [docs/api.md](docs/api.md) — Supabase edge function request/response contracts
- [docs/deployment.md](docs/deployment.md) — how to actually deploy this (Supabase, prediction API, frontend)
- [ml/README.md](ml/README.md) — the ML pipeline, including an honest look at what the data does and doesn't support
- [services/prediction-api/README.md](services/prediction-api/README.md) — running/deploying the model-serving microservice
- [docs/AUTH_SECURITY_IMPLEMENTATION.md](docs/AUTH_SECURITY_IMPLEMENTATION.md) — auth security measures (rate limiting, password history, RLS)
- [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md), [ACCESSIBILITY.md](ACCESSIBILITY.md), [MICROINTERACTIONS.md](MICROINTERACTIONS.md) — frontend design conventions

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, React Query, React Router |
| Backend | Supabase (Postgres + Row-Level Security, Auth, Edge Functions on Deno) |
| ML | Python, LightGBM, scikit-learn, pandas |
| ML serving | FastAPI microservice, Docker |
| Testing | Vitest + Testing Library (frontend), pytest (ML pipeline) |
| CI | GitHub Actions |

## Project structure

```
medstock-wise/
├── src/                    # React app (routes in src/pages, shared UI in src/components)
├── supabase/
│   ├── functions/          # Deno edge functions (see docs/api.md)
│   └── migrations/         # Postgres schema + RLS policies, in order
├── ml/
│   ├── data/raw/           # Source datasets
│   ├── notebooks/          # Exploratory analysis
│   ├── train.py            # Reproducible training script -> ml/models/
│   └── tests/              # pytest: leakage checks, determinism
├── services/
│   └── prediction-api/     # FastAPI service that serves the trained model
├── docs/                   # Architecture, API, deployment, auth security docs
└── .github/workflows/      # CI
```

## Getting started

Prerequisites: Node.js 18+, npm, and (only if retraining/serving the model) Python 3.11+.

```bash
git clone <this-repo-url>
cd medstock-wise
npm install
cp .env.example .env   # fill in your Supabase project's URL + anon key
npm run dev
```

The app expects a Supabase project with the schema in `supabase/migrations/` applied (via `supabase db push` or the SQL editor) and the edge functions in `supabase/functions/` deployed (`supabase functions deploy`). See [docs/deployment.md](docs/deployment.md) for the full setup, including required secrets.

## Testing & verification

```bash
npm run lint             # ESLint
npx tsc --noEmit -p tsconfig.app.json   # Typecheck (strict mode)
npm test                 # Vitest unit tests
npm run build            # Production build

python3 -m pytest ml/    # ML pipeline tests (no-leakage, determinism)
```

All of the above run in CI on every push/PR to `main` (`.github/workflows/ci.yml`).

## ML pipeline (short version)

`ml/train.py` trains on the real dataset the app seeds from (`ml/data/raw/inventory_data.csv`), not a synthetic generator. Worth knowing before trusting the demand numbers: this dataset's `Avg_Usage_Per_Day` field has almost no correlation with its own history or any other column (~0.01–0.07) — it behaves like independent noise. The model (LightGBM, R² ≈ -0.01 on held-out data) reflects that honestly rather than being trained on easier synthetic data to produce a better-looking number. Full explanation, including why the shortage-risk classification still holds up reasonably well, in [ml/README.md](ml/README.md).

## Deployment status

- **Backend**: own, independently-controlled Supabase project (`umnvrftxfxaunofkwbgh`) — schema and all 5 edge functions applied and verified live.
- **Frontend**: `.env` points at the new backend; still needs Vercel's environment variables updated to match and a redeploy (the currently-live `medstockwiseapp.vercel.app` still points at the old backend until then).
- **Prediction API**: not deployed yet — `run-predictions` falls back to a simple formula until `services/prediction-api` is deployed and its URL/key are set as Supabase secrets.

Full checklist and exact values in [docs/deployment.md](docs/deployment.md).

## Future scope

- Deploy the prediction API and wire up real production secrets (see deployment doc).
- Multi-hospital tenancy.
- Data export/reporting (CSV/PDF).
- MFA/WebAuthn for admin accounts.
- A native mobile client (the app is already a installable PWA).
- Revisit the demand model once real day-level usage logs (not the current sparse, low-signal source dataset) are available — `usage_observations` is already accumulating history for this.
