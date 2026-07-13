# Deployment

## Current status (as of this consolidation)

The app originally ran on a Lovable-managed Supabase backend ("Lovable Cloud"), which wasn't independently accessible outside Lovable's own dashboard. To get full direct control, we provisioned a **new, independently-owned Supabase project** and cut over to it:

- **New project**: `umnvrftxfxaunofkwbgh` (region `ap-south-1`), owned directly by the project owner's own Supabase account -- no platform in the middle.
- **Schema**: all 6 migrations applied (`supabase db push`), verified via `supabase migration list`.
- **Edge functions**: all 5 deployed and `ACTIVE` (`run-predictions`, `calculate-cost-optimization`, `seed-sample-data`, `validate-password`, `secure-sign-in`).
- **Frontend `.env`**: updated to point at the new project.
- Smoke-tested `secure-sign-in` live against the new project (correctly rejects bad credentials and tracks remaining attempts) -- confirms migrations + RLS + functions are wired together correctly end to end.
- The old Lovable-managed project is now unused by this repo going forward; nothing was deleted there, it's just no longer referenced.

## What's still needed (can't be done without dashboard/account access this session didn't have)

1. **Update Vercel's environment variables** to the new project's values (below) and redeploy -- the currently-live `medstockwiseapp.vercel.app` still points at the old Lovable-managed project until this happens.
2. **Create the first admin account**: sign up a normal account through the app (`/auth`), which defaults to the `nurse` role, then promote it via SQL (Supabase Dashboard -> SQL Editor, now directly accessible on the new project):
   ```sql
   update public.user_roles set role = 'admin' where user_id = '<your-user-id-from-auth.users>';
   ```
3. **Deploy the prediction API** (`services/prediction-api/`) and set its URL/key as secrets (below) -- until then, predictions use the formula fallback, clearly labeled `model_source: "fallback_formula"` in responses.

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

## 3. Frontend (Vercel)

Build command: `npm run build`. Output directory: `dist`. Framework preset: Vite.

Required environment variables (Vercel Project Settings -> Environment Variables) -- **these need updating to the new project's values**:
```
VITE_SUPABASE_PROJECT_ID=umnvrftxfxaunofkwbgh
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_OBLdIYT__sYdnoI_77EMOQ_kxweEO34
VITE_SUPABASE_URL=https://umnvrftxfxaunofkwbgh.supabase.co
```

If the Vercel project is connected to this GitHub repo, pushing to `main` triggers a deploy automatically (the env vars still need updating in Vercel's dashboard regardless). Otherwise: `vercel --prod` from the repo root.

## 4. CI

`.github/workflows/ci.yml` runs on every push/PR to `main`: frontend typecheck/lint/test/build, ML pipeline pytest, and a prediction-api import smoke test. No deploy step is wired into CI -- deployment above is manual.

## Verification checklist

- [x] `supabase db push` completed with no errors (new project)
- [x] All 5 edge functions deployed and `ACTIVE` (new project)
- [x] `secure-sign-in` smoke-tested live (rejects bad credentials correctly)
- [ ] Vercel env vars updated to the new project + redeployed
- [ ] First admin account created and promoted via SQL
- [ ] `PREDICTION_API_URL`/`PREDICTION_API_KEY` secrets set once the prediction API is deployed; confirm `model_source: "ml_service"` (not `"fallback_formula"`) in a real prediction response
- [ ] Frontend loads with no console errors against the new backend on `/auth` and the dashboard
