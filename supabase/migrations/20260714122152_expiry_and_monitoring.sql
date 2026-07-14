-- Closes two "the schema promises it, nothing implements it" gaps that have
-- existed since the original alert_configurations migration:
--
-- 1. expiry_warning was a defined alert_type, but inventory_items had no
--    expiry_date column, so expiry alerts could never fire. Add it (nullable
--    -- equipment and many supplies don't expire).
-- 2. data_drift / prediction_error were defined alert types with zero
--    monitoring logic. The monitoring pass in run-predictions now computes
--    both from real usage history; this migration just adds a small table to
--    hold each item's model-baseline so drift can be measured against it.

ALTER TABLE public.inventory_items
  ADD COLUMN expiry_date date;

COMMENT ON COLUMN public.inventory_items.expiry_date IS
  'Optional expiry date; drives expiry_warning alerts when within the configured threshold.';

-- Per-item demand baseline the drift monitor compares recent real usage
-- against. Seeded from avg_usage_per_day the first time monitoring runs, then
-- only updated deliberately (e.g. after a confirmed, intended demand shift or
-- a model refresh) -- so drift is measured against a stable reference, not a
-- moving average that would mask gradual drift.
CREATE TABLE public.demand_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  hospital_id uuid NOT NULL REFERENCES public.hospitals(id) ON DELETE CASCADE,
  baseline_avg_usage_per_day numeric NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id)
);

CREATE INDEX idx_demand_baselines_hospital ON public.demand_baselines(hospital_id);

ALTER TABLE public.demand_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view demand baselines in their hospital"
  ON public.demand_baselines FOR SELECT
  TO authenticated
  USING (hospital_id = public.current_hospital_id());

-- Only the monitoring edge function (service_role) writes baselines; they're
-- derived data, not something a client should set directly.
CREATE POLICY "Service role manages demand baselines"
  ON public.demand_baselines FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
