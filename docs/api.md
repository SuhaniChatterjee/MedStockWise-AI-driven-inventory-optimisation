# API Reference

All endpoints below are Supabase Edge Functions (`supabase/functions/*/index.ts`), called via `supabase.functions.invoke("<name>", { body: {...} })` from the frontend, or `POST https://<project>.supabase.co/functions/v1/<name>` directly. Unless noted, requests need a valid Supabase session JWT (attached automatically by supabase-js; anonymous/public callers are rejected).

For the model-serving HTTP API itself (not a Supabase function), see [services/prediction-api/README.md](../services/prediction-api/README.md).

## `run-predictions`

Runs the demand prediction model (via the prediction API, with a formula fallback -- see [architecture.md](architecture.md)) for one item, all items, or a stateless single ad-hoc item (demo mode).

**Auth**: valid JWT required. Persisting a prediction (`run_all` or `item_id`) additionally requires `admin` or `inventory_manager` role. The `single_prediction` demo path is open to any authenticated user since it never writes to the database.

Request:
```json
{ "run_all": true }
{ "item_id": "<uuid>" }
{ "single_prediction": { "item_name": "...", "item_type": "Equipment|Consumable", "current_stock": 100, "min_required": 50, "max_capacity": 500, "avg_usage_per_day": 10, "restock_lead_time": 7, "unit_cost": 25.0 } }
```

Response (200):
```json
{
  "success": true,
  "estimated_demand": 1234.5,
  "inventory_shortfall": 0,
  "replenishment_needs": 890.1,
  "feature_contributions": { "Usage_Rolling_7": 13.6, "...": "..." },
  "confidence": 0.0,
  "shortage_risk": true,
  "model_source": "ml_service",
  "model_version": "LightGBM"
}
```
For `run_all`, the response instead has `predictions: [...]` and `alerts_generated`.

## `calculate-cost-optimization`

Computes EOQ, reorder point, and safety stock for one or all items.

**Auth**: `admin` or `inventory_manager` role required (always persists).

Request: `{ "run_all": true }` or `{ "item_id": "<uuid>" }`

Response: `{ "success": true, "optimizations": [...], "total_items": N }`

## `seed-sample-data`

Populates the database with demo inventory items, an initial model registry entry, and sample predictions/alerts. Idempotent -- a no-op if `inventory_items` already has rows.

**Auth**: `admin` or `inventory_manager` role required.

## `secure-sign-in`

Performs sign-in server-side (rather than the frontend calling `supabase.auth.signInWithPassword` directly) so failed-attempt tracking is based on the real outcome, not a client-reported flag. See [AUTH_SECURITY_IMPLEMENTATION.md](AUTH_SECURITY_IMPLEMENTATION.md).

**Auth**: none (this *is* the login endpoint; the anon key satisfies the gateway's JWT check).

Request: `{ "email": "...", "password": "..." }`

Response (always HTTP 200; check `success`):
```json
{ "success": true, "session": { "access_token": "...", "refresh_token": "..." } }
{ "success": false, "message": "Invalid credentials. 3 attempt(s) remaining before lockout." }
{ "success": false, "lockoutUntil": "2026-...", "message": "Too many failed attempts..." }
```

## `validate-password`

Checks a new password against the caller's last 5 password hashes (reuse prevention), and records it if it passes.

**Auth**: valid JWT required. The user id is derived from the JWT, not accepted as a request parameter.

Request: `{ "newPasswordHash": "<64-char SHA-256 hex, see src/lib/passwordValidation.ts hashPassword()>" }`

Response: `{ "valid": true }` or `{ "valid": false, "message": "This password was used recently..." }`

## Error format

All functions return `{ "error": "message" }` with a non-2xx status (400 invalid input, 401 unauthorized, 403 forbidden, 500 unexpected) on failure, except `secure-sign-in` which always returns 200 with `success: false` for expected failure cases (see note in that function's source on why).
