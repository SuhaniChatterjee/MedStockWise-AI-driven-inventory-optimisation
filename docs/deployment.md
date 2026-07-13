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

## What's still needed

1. **Create the first admin account**: sign up a normal account through the app (`/auth`), which defaults to the `nurse` role, then promote it via SQL (Supabase Dashboard -> SQL Editor, directly accessible on the new project):
   ```sql
   update public.user_roles set role = 'admin' where user_id = '<your-user-id-from-auth.users>';
   ```
2. **Deploy the prediction API** (`services/prediction-api/`) and set its URL/key as secrets (below) -- until then, predictions use the formula fallback, clearly labeled `model_source: "fallback_formula"` in responses.

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

### Set secrets (still needed once the prediction API is deployed)

```bash
supabase secrets set PREDICTION_API_URL=https://<your-deployed-prediction-api>
supabase secrets set PREDICTION_API_KEY=<same-value-used-when-deploying-the-prediction-api>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically to edge functions by Supabase; nothing to set for those.

## 2. Prediction API

Not deployed yet -- see [services/prediction-api/README.md](../services/prediction-api/README.md) for the full Docker build/deploy steps. Any container host works (Render, Railway, Fly.io, a VM). Once deployed, set the two secrets above -- until then, `run-predictions` transparently falls back to a formula-based estimate.

Retraining: `python3 ml/train.py` regenerates `ml/models/`; rebuild and redeploy the prediction API afterward.

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
- [ ] First admin account created and promoted via SQL
- [ ] `PREDICTION_API_URL`/`PREDICTION_API_KEY` secrets set once the prediction API is deployed; confirm `model_source: "ml_service"` (not `"fallback_formula"`) in a real prediction response
