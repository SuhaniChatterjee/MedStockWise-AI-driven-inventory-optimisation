# Deployment

This repo was consolidated and hardened without direct access to the live Supabase project, Vercel project, or any cloud account (no `supabase`/`vercel`/`gh` CLI, no credentials, in the environment this work was done in). Everything below is written, tested locally, and CI-verified, but **has not been applied to a live environment** -- these steps still need to be run by someone with access.

## 1. Supabase

### Apply the schema

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push   # applies everything in supabase/migrations/, in order
```

Migrations added/changed in this consolidation (in order, on top of whatever was already applied):
- `20260713083903_security_hardening.sql` -- tightens RLS on `prediction_history`/`alerts_history`/`login_attempts`, adds audit-log triggers. See commit history for the specific vulnerabilities this closes.
- `20260713090000_usage_observations.sql` -- new table for real per-item usage history (needed by the ML model's lag features).

### Deploy the edge functions

```bash
supabase functions deploy run-predictions
supabase functions deploy calculate-cost-optimization
supabase functions deploy seed-sample-data
supabase functions deploy validate-password
supabase functions deploy secure-sign-in
```

Note: `check-rate-limit` was **removed** (replaced by `secure-sign-in`) -- if it's still deployed from a previous version, delete it: `supabase functions delete check-rate-limit`.

### Set secrets

```bash
supabase secrets set PREDICTION_API_URL=https://<your-deployed-prediction-api>
supabase secrets set PREDICTION_API_KEY=<same-value-used-when-deploying-the-prediction-api>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically to edge functions by Supabase; nothing to set for those.

### Rotate the anon key

`VITE_SUPABASE_PUBLISHABLE_KEY` (the anon key) was committed to git in this repo's history before this consolidation (see the `.env` untracking commit). The anon key is meant to be public (it's safe by design, gated by RLS), so this is lower severity than a service-role key leak, but if you want a clean rotation: Supabase Dashboard -> Project Settings -> API -> rotate the anon key, then update `.env` (see `.env.example`) and Vercel's environment variables.

## 2. Prediction API

Not deployed by default -- see [services/prediction-api/README.md](../services/prediction-api/README.md) for the full Docker build/deploy steps. Any container host works (Render, Railway, Fly.io, a VM). Once deployed, set `PREDICTION_API_URL`/`PREDICTION_API_KEY` as Supabase secrets (above) -- until then, `run-predictions` transparently falls back to a formula-based estimate.

Retraining: `python3 ml/train.py` regenerates `ml/models/`; rebuild and redeploy the prediction API afterward.

## 3. Frontend (Vercel)

Build command: `npm run build`. Output directory: `dist`. Framework preset: Vite.

Required environment variables (Vercel Project Settings -> Environment Variables), same as `.env.example`:
```
VITE_SUPABASE_PROJECT_ID
VITE_SUPABASE_PUBLISHABLE_KEY
VITE_SUPABASE_URL
```

If the Vercel project is connected to this GitHub repo, pushing to `main` triggers a deploy automatically. Otherwise: `vercel --prod` from the repo root (with the Vercel CLI installed and authenticated).

## 4. CI

`.github/workflows/ci.yml` runs on every push/PR to `main`: frontend typecheck/lint/test/build, ML pipeline pytest, and a prediction-api import smoke test. No deploy step is wired into CI -- deployment above is manual (Vercel's own GitHub integration handles the frontend deploy separately, as noted above).

## Verification checklist after deploying

- [ ] `supabase db push` completed with no errors
- [ ] All 5 edge functions listed above deploy successfully
- [ ] `PREDICTION_API_URL`/`PREDICTION_API_KEY` secrets set, prediction API's `/health` returns 200
- [ ] Sign up a test user, confirm role defaults to `nurse`, promote to `admin` via direct SQL (`insert into user_roles ...`) for the first admin
- [ ] As admin, run "Seed Sample Data" (Admin page) and "Run Predictions" (Predictions page); confirm `model_source` in the response is `"ml_service"`, not `"fallback_formula"`, once the prediction API is deployed
- [ ] Frontend builds and deploys on Vercel with no console errors on the `/auth` and dashboard routes
