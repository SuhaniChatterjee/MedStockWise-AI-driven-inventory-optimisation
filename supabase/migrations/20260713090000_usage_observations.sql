-- The demand-forecasting model (ml/train.py) uses lag/rolling features of an
-- item's prior usage observations. inventory_items only stores the latest
-- snapshot, so at inference time there was no real history to feed the
-- model -- only a single current reading. This table lets the app start
-- accumulating genuine per-item history from now on: run-predictions
-- records an observation each time it runs, and reads recent rows back to
-- build real lag features for the next prediction (falling back to a
-- same-as-current-reading default when an item has no history yet).
CREATE TABLE IF NOT EXISTS public.usage_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid REFERENCES public.inventory_items(id) ON DELETE CASCADE NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  avg_usage_per_day numeric NOT NULL,
  current_stock integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_usage_observations_item_time ON public.usage_observations(item_id, observed_at DESC);

ALTER TABLE public.usage_observations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can view usage observations"
  ON public.usage_observations FOR SELECT
  TO authenticated
  USING (true);

-- Only the run-predictions edge function (service_role) writes observations;
-- this is derived data recorded automatically, not something a client should
-- be able to fabricate directly.
CREATE POLICY "Service role can insert usage observations"
  ON public.usage_observations FOR INSERT
  TO service_role
  WITH CHECK (true);
