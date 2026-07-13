# Architecture

## System overview

```
┌─────────────┐      ┌──────────────────────┐      ┌────────────────────┐
│   React SPA │◄────►│  Supabase            │◄────►│  Prediction API     │
│ (Vite, RQ)  │      │  - Postgres + RLS    │      │  (FastAPI, LightGBM)│
│             │      │  - Auth (GoTrue)     │      │  Docker-deployable, │
│             │      │  - Edge Functions    │─────►│  separate from      │
└─────────────┘      │    (Deno)            │      │  Supabase           │
                      └──────────────────────┘      └────────────────────┘
                               │
                               ▼
                      ┌──────────────────────┐
                      │  ml/train.py          │
                      │  -> ml/models/*.txt   │  (committed model artifacts,
                      │     feature_schema    │   loaded by the prediction API)
                      └──────────────────────┘
```

The frontend never talks to the prediction model directly -- it calls Supabase edge functions, which call the prediction API over HTTP. This exists because the model is trained in Python (LightGBM) and edge functions run on Deno; rather than reimplementing tree inference in TypeScript, the edge function is a thin proxy with a fallback.

## Why an edge-function proxy instead of calling the model directly from the browser

1. **Auth/RBAC enforcement**: edge functions verify the caller's JWT and role (admin/inventory_manager/nurse) before allowing writes. The prediction API itself only checks a shared API key, not per-user roles -- it doesn't know about Supabase users at all.
2. **Service-role DB writes**: predictions, alerts, and usage history need to be persisted with elevated privileges (bypassing RLS in the specific, intentional ways described below), which must happen server-side.
3. **Fallback behavior**: if the prediction API is down or not yet deployed, `run-predictions` (`supabase/functions/run-predictions/index.ts`) falls back to a simple formula rather than failing the whole request. A browser calling the model directly couldn't do this transparently.

## Data flow: running a prediction

1. Frontend calls `run-predictions` (single item, or `run_all` for every inventory item), with its own JWT attached automatically by supabase-js.
2. The edge function verifies the JWT and, for persisting predictions, checks the caller has `admin` or `inventory_manager` role.
3. For each item, it fetches up to the last 10 rows from `usage_observations` (that item's recorded usage history) and POSTs the item's current snapshot + that history to the prediction API.
4. The prediction API rebuilds the exact feature vector `ml/train.py` was trained on (lag/rolling usage features, calendar features, one-hot item name/type) and returns a prediction plus real per-prediction feature contributions (LightGBM `pred_contrib`).
5. The edge function records this observation into `usage_observations` (so the *next* prediction for this item has one more data point of real history), writes the prediction into `predictions` and `prediction_history`, and generates low-stock/critical-stock alerts based on simple stock-percentage thresholds (independent of the model).
6. If step 3/4 fails for any reason (`PREDICTION_API_URL` unset, service unreachable, non-2xx response), the edge function falls back to a formula (`avg_usage_per_day × restock_lead_time`) and marks the result `model_source: "fallback_formula"` so it's never silently confused with a real model prediction.

## Database design choices worth knowing

- **RLS is the primary authorization boundary**, not application code. Role checks in edge functions exist *in addition to* RLS because those functions use the service-role key (which bypasses RLS) precisely so they can, e.g., write alerts on behalf of the system -- so the role check has to happen in the function itself.
- **`usage_observations`** (added alongside the ML work) exists because the original schema only stored the latest snapshot per item, with no way to compute real lag/rolling features. It's written once per `run-predictions` call and is the app's only source of real historical usage data.
- **Audit triggers** on `user_roles` and `inventory_items` (delete) write to `activity_logs` automatically at the database level via `SECURITY DEFINER` functions, specifically so this can't be forgotten by a future edge function or bypassed by a direct SQL change through the dashboard.
- **`alerts_history`** content (title/message/severity/etc.) can only be modified by admins (enforced by a trigger, not just RLS), while any authenticated user can still acknowledge/resolve an alert -- RLS alone can't express "you can update this row, but only these columns."

## Frontend architecture choices

- **Route-level code splitting** (`React.lazy` in `src/App.tsx`): each page is a separate chunk, loaded on navigation.
- **React Query** for server state (currently: `Inventory.tsx`) instead of ad-hoc `useState`/`useEffect` fetch patterns used elsewhere in the app -- gives caching, dedup, and a consistent loading/error model. Not yet retrofitted onto every page; see Future Scope in the root README.
- **A single top-level `ErrorBoundary`** so a render error in any one page doesn't take down the whole app.
