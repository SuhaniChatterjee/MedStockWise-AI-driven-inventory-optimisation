# Deployment

## Current status (as of this consolidation)

The app originally ran on a Lovable-managed Supabase backend ("Lovable Cloud"), which wasn't independently accessible outside Lovable's own dashboard. To get full direct control, we provisioned a **new, independently-owned Supabase project** and cut over to it:

- **New project**: `umnvrftxfxaunofkwbgh` (region `ap-south-1`), owned directly by the project owner's own Supabase account -- no platform in the middle.
- **Schema**: all 6 migrations applied (`supabase db push`), verified via `supabase migration list`.
- **Edge functions**: all 5 deployed and `ACTIVE` (`run-predictions`, `calculate-cost-optimization`, `seed-sample-data`, `validate-password`, `secure-sign-in`).
- **Frontend `.env`**: updated to point at the new project.
- Smoke-tested `secure-sign-in` live against the new project (correctly rejects bad credentials and tracks remaining attempts) -- confirms migrations + RLS + functions are wired together correctly end to end.
- The old Lovable-managed project is now unused by this repo going forward; nothing was deleted there, it's just no longer referenced.
- **Vercel** (`medstockwiseapp`): environment variables updated to the new project (Production/Preview/Development), and redeployed. `medstockwiseapp.vercel.app` is now live on the new backend -- verified the deployed bundle contains the new project ref and that `/`, `/auth`, `/inventory` all return 200 (a `vercel.json` SPA rewrite was added in the same pass; direct navigation to client-side routes was 404ing before that, since no rewrite config existed at all).

- **Auth redirect URL**: the new project's Auth config defaulted to `site_url: http://localhost:3000` with an empty redirect allow-list (this is a dashboard/Management-API-level setting, not something `db push`/`functions deploy` touches). This broke email confirmation links -- they'd verify successfully server-side but then redirect to `localhost:3000`, which doesn't load. Fixed via the Management API: `site_url` -> `https://medstockwiseapp.vercel.app`, with that URL (and `http://localhost:8080/**` for local dev) added to `uri_allow_list`.
- **First admin account**: created (signed up normally through the app, defaulted to `nurse`) and promoted to `admin` via direct SQL through the Management API's query endpoint.
- **Prediction API**: deployed to Render (`https://medstockwise-prediction-api.onrender.com`, free tier -- spins down after 15 min idle, ~30-60s cold start on the next request), `PREDICTION_API_URL`/`PREDICTION_API_KEY` set as Supabase secrets. `/health` and `/predict` smoke-tested directly and return correct results. Two real bugs surfaced and fixed during this deploy (see commit history): `python:3.11-slim` is missing `libgomp1`, which LightGBM's compiled binary needs at import time; and `MODEL_DIR`'s fallback path expression was being evaluated eagerly by `os.environ.get()` even when the env var was already set, crashing on the Docker image's flatter directory layout.

- **Email alerts**: `RESEND_API_KEY` set as a Supabase secret; `run-predictions` now emails admins/inventory_managers when it generates a `low_stock`/`critical_stock` alert (both already had `email` enabled in `alert_configurations.notification_channels` by default). Verified the Resend integration itself works via a direct API call. Deliberately not wired into `seed-sample-data` -- those alerts are synthetic demo data, and emailing real people about fake data would be actively misleading. Resend's sandbox mode (no verified sending domain) can currently only deliver to the account owner's own email; verify a domain in Resend's dashboard to notify other staff.

## What's still needed

Nothing blocking -- the full stack (Supabase backend, prediction API, frontend, email alerts) is deployed and wired together. Worth doing when convenient:
- Click "Run Predictions" in the live app and confirm the response's `model_source` is `"ml_service"` (not `"fallback_formula"`) -- this wasn't tested with a real logged-in user session, only with `curl` directly against the prediction API and Supabase's own auth endpoints separately.
- No current inventory item is actually low enough to trigger a real `low_stock`/`critical_stock` alert (closest is Oxygen Tanks at 90% of minimum; alerts fire below 20%). Edit an item's stock down via the Inventory page and run predictions to see the full alert + email flow live.

## 1. Supabase (reference -- already done for the new project above)

```bash
supabase login --token <personal-access-token>
supabase link --project-ref umnvrftxfxaunofkwbgh
supabase db push   # applies everything in supabase/migrations/, in order
supabase functions deploy run-predictions
supabase functions deploy calculate-cost-optimization
supabase functions deploy seed-sample-data
supabase functions deploy validate-password
supabase functions deploy secure-sign-in
```

If migrating to yet another project in the future, repeat this against the new `--project-ref`.

### Secrets (done)

```bash
supabase secrets set PREDICTION_API_URL=https://medstockwise-prediction-api.onrender.com
supabase secrets set PREDICTION_API_KEY=<the key generated when deploying the prediction API>
supabase secrets set RESEND_API_KEY=<your Resend API key>
# Optional, defaults to onboarding@resend.dev (Resend's shared sandbox sender):
supabase secrets set ALERT_EMAIL_FROM="MedStock Wise <alerts@yourdomain.com>"
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically to edge functions by Supabase; nothing to set for those.

## 2. Prediction API -- done (now serving the weather-informed global model)

Deployed to Render as a Docker web service, built from `services/prediction-api/Dockerfile`. Now serves the **global weather-informed model** distilled into seasonal multiplier curves (`ml/models/seasonal_multipliers.json`) -- pure-Python lookup, so the container no longer needs LightGBM/pandas. Verified live: a `respiratory_airway` item returns ~1.85x higher demand in January than July (real cold-season seasonality). Free tier: spins down after 15 min idle, ~30-60s cold start.

Retraining / refreshing seasonality: `python3 ml/train_global.py && python3 ml/export_seasonal_curves.py`, then redeploy this service.

Gotcha already fixed (would resurface on a fresh host): `MODEL_DIR`'s local-dev fallback path must not be evaluated when the env var is already set (Python's `os.environ.get(name, default)` evaluates `default` unconditionally).

## 3. Frontend (Vercel) -- done

Build command: `npm run build`. Output directory: `dist`. Framework preset: Vite. `vercel.json` adds the SPA rewrite (`/(.*) -> /index.html`) needed for client-side routing to survive a direct page load/refresh.

Environment variables (Vercel Project Settings -> Environment Variables), set across Production/Preview/Development:
```
VITE_SUPABASE_PROJECT_ID=umnvrftxfxaunofkwbgh
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_OBLdIYT__sYdnoI_77EMOQ_kxweEO34
VITE_SUPABASE_URL=https://umnvrftxfxaunofkwbgh.supabase.co
```

Deployed via `vercel --prod`. Vercel's Git integration is connected to `SuhaniChatterjee/MedStockWise-AI-driven-inventory-optimisation` (this repo's actual current name/location -- it was previously connected to an older, unrelated one-shot export repo), production branch `main` -- future pushes to `main` will auto-deploy.

## 4. CI

`.github/workflows/ci.yml` runs on every push/PR to `main`: frontend typecheck/lint/test/build, ML pipeline pytest, and a prediction-api import smoke test. No deploy step is wired into CI -- deployment above is manual.

## Verification checklist

- [x] `supabase db push` completed with no errors (new project)
- [x] All 5 edge functions deployed and `ACTIVE` (new project)
- [x] `secure-sign-in` smoke-tested live (rejects bad credentials correctly)
- [x] Vercel env vars updated to the new project + redeployed
- [x] Frontend loads with no console-breaking errors against the new backend; `/`, `/auth`, `/inventory` all verified 200 live
- [x] Vercel Git integration connected to this repo's `main` branch, for auto-deploy on future pushes
- [x] Auth site_url/redirect allow-list fixed so email confirmation links land somewhere real
- [x] First admin account created and promoted via SQL
- [x] Prediction API deployed to Render; `/health` and `/predict` smoke-tested directly
- [x] `PREDICTION_API_URL`/`PREDICTION_API_KEY` secrets set on the Supabase project
- [x] `RESEND_API_KEY` set on the Supabase project; Resend integration verified via direct API call
- [x] Global weather-informed model live on the prediction API; seasonal effect verified directly (Jan vs Jul respiratory demand)
- [ ] Confirm `model_source: "ml_service"` end-to-end via a real logged-in "Run Predictions" click in the live app (every link verified independently; only the authenticated round-trip is untested)
- [ ] Trigger a real low-stock alert (edit an item's stock down) to see the email flow end-to-end
