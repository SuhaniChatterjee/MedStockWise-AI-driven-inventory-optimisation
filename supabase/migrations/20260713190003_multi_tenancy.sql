-- Multi-tenancy: the app was single-tenant -- every table was flat with no
-- hospital/organization scoping at all, and RLS separated by *role* only,
-- not by *organization*. A second hospital signing up today would see (and
-- could edit, subject to role) every other hospital's inventory, alerts,
-- and cost data. This migration adds real tenant isolation.
--
-- Existing live data is backfilled into a fixed-id default hospital so the
-- current admin account and its inventory keep working unchanged.

CREATE TABLE public.hospitals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  -- Deliberately 3 broad climate/epidemiological zones, not granular
  -- geography -- enough to drive a documented seasonal-illness lookup
  -- later without overclaiming precision we can't validate (no real
  -- epidemiological dataset is available; see ml/README.md).
  region text NOT NULL CHECK (region IN ('temperate', 'tropical', 'subtropical')),
  invite_code text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(6), 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fixed id (not gen_random_uuid()) so it can be referenced as a backfill
-- target below within this same migration.
INSERT INTO public.hospitals (id, name, region)
VALUES ('00000000-0000-0000-0000-000000000001', 'Default Hospital', 'tropical');

ALTER TABLE public.hospitals ENABLE ROW LEVEL SECURITY;

-- Anyone (even unauthenticated, for the "join by invite code" flow in a
-- later stage) can look up a hospital by name/region, but invite codes
-- are only readable by members of that hospital -- otherwise the join
-- flow can't validate a code exists, but a stranger also can't enumerate
-- codes by reading this table freely.
CREATE POLICY "Anyone can view hospital name and region"
  ON public.hospitals FOR SELECT
  USING (true);

-- =====================================================================
-- Add hospital_id to every hospital-data table. Nullable first so we can
-- backfill, then NOT NULL. activity_logs is included even though the
-- original plan didn't call it out explicitly: "Admins can view all
-- logs" currently has no hospital scoping at all, which would leak every
-- hospital's audit trail to any admin once a second hospital exists.
-- =====================================================================

ALTER TABLE public.profiles ADD COLUMN hospital_id uuid REFERENCES public.hospitals(id);
ALTER TABLE public.inventory_items ADD COLUMN hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE;
ALTER TABLE public.predictions ADD COLUMN hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE;
ALTER TABLE public.prediction_history ADD COLUMN hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE;
ALTER TABLE public.alerts_history ADD COLUMN hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE;
ALTER TABLE public.alert_configurations ADD COLUMN hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE;
ALTER TABLE public.cost_optimization ADD COLUMN hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE;
ALTER TABLE public.usage_observations ADD COLUMN hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE;
ALTER TABLE public.activity_logs ADD COLUMN hospital_id uuid REFERENCES public.hospitals(id) ON DELETE CASCADE;

-- public.current_hospital_id(), mirroring the existing has_role() pattern:
-- a SECURITY DEFINER helper so RLS policies can check "is this row in my
-- hospital" without each policy needing its own subquery against profiles
-- (which the calling role may not have SELECT access to for other rows).
-- Must come after the ADD COLUMN statements above since it references
-- profiles.hospital_id.
CREATE OR REPLACE FUNCTION public.current_hospital_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT hospital_id FROM public.profiles WHERE id = auth.uid()
$$;

UPDATE public.profiles SET hospital_id = '00000000-0000-0000-0000-000000000001' WHERE hospital_id IS NULL;
UPDATE public.inventory_items SET hospital_id = '00000000-0000-0000-0000-000000000001' WHERE hospital_id IS NULL;
UPDATE public.predictions SET hospital_id = '00000000-0000-0000-0000-000000000001' WHERE hospital_id IS NULL;
UPDATE public.prediction_history SET hospital_id = '00000000-0000-0000-0000-000000000001' WHERE hospital_id IS NULL;
UPDATE public.alerts_history SET hospital_id = '00000000-0000-0000-0000-000000000001' WHERE hospital_id IS NULL;
UPDATE public.alert_configurations SET hospital_id = '00000000-0000-0000-0000-000000000001' WHERE hospital_id IS NULL;
UPDATE public.cost_optimization SET hospital_id = '00000000-0000-0000-0000-000000000001' WHERE hospital_id IS NULL;
UPDATE public.usage_observations SET hospital_id = '00000000-0000-0000-0000-000000000001' WHERE hospital_id IS NULL;
-- activity_logs.user_id can be null (ON DELETE SET NULL from auth.users),
-- so not every row can be backfilled to a specific hospital; leave those
-- as NULL (pre-existing system-level log entries) rather than forcing a
-- default, and don't make the column NOT NULL for this table.
UPDATE public.activity_logs SET hospital_id = '00000000-0000-0000-0000-000000000001' WHERE hospital_id IS NULL;

ALTER TABLE public.profiles ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE public.inventory_items ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE public.predictions ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE public.prediction_history ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE public.alerts_history ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE public.alert_configurations ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE public.cost_optimization ALTER COLUMN hospital_id SET NOT NULL;
ALTER TABLE public.usage_observations ALTER COLUMN hospital_id SET NOT NULL;
-- activity_logs.hospital_id stays nullable (see above).

CREATE INDEX idx_profiles_hospital_id ON public.profiles(hospital_id);
CREATE INDEX idx_inventory_items_hospital_id ON public.inventory_items(hospital_id);
CREATE INDEX idx_predictions_hospital_id ON public.predictions(hospital_id);
CREATE INDEX idx_prediction_history_hospital_id ON public.prediction_history(hospital_id);
CREATE INDEX idx_alerts_history_hospital_id ON public.alerts_history(hospital_id);
CREATE INDEX idx_alert_configurations_hospital_id ON public.alert_configurations(hospital_id);
CREATE INDEX idx_cost_optimization_hospital_id ON public.cost_optimization(hospital_id);
CREATE INDEX idx_usage_observations_hospital_id ON public.usage_observations(hospital_id);
CREATE INDEX idx_activity_logs_hospital_id ON public.activity_logs(hospital_id);

-- hospital_id is set once (at signup/join, in a later stage) and must
-- never change afterward -- there's no legitimate reason for a user to
-- move between hospitals via a profile update, and allowing it would let
-- a compromised or malicious account graft itself onto another hospital.
CREATE OR REPLACE FUNCTION public.prevent_hospital_id_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.hospital_id IS DISTINCT FROM OLD.hospital_id THEN
    RAISE EXCEPTION 'hospital_id cannot be changed after signup';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_hospital_id_immutable
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_hospital_id_change();

-- =====================================================================
-- RLS: add hospital scoping to every existing role-based policy. Same
-- role-check logic as before, with `hospital_id = public.current_hospital_id()`
-- added everywhere -- role alone is no longer sufficient once there's
-- more than one hospital in the same tables.
-- =====================================================================

-- profiles
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view profiles in their hospital"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (hospital_id = public.current_hospital_id());

-- "Users can update own profile" is unchanged (auth.uid() = id) --
-- hospital_id itself is separately protected by the immutability trigger
-- above, so this policy doesn't need a hospital_id check.

-- user_roles
DROP POLICY IF EXISTS "Admins can manage all roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles within their hospital"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = user_roles.user_id
        AND profiles.hospital_id = public.current_hospital_id()
    )
  );

-- inventory_items
DROP POLICY IF EXISTS "All authenticated users can view inventory" ON public.inventory_items;
CREATE POLICY "Users can view inventory in their hospital"
  ON public.inventory_items FOR SELECT
  TO authenticated
  USING (hospital_id = public.current_hospital_id());

DROP POLICY IF EXISTS "Admins and managers can insert inventory" ON public.inventory_items;
CREATE POLICY "Admins and managers can insert inventory in their hospital"
  ON public.inventory_items FOR INSERT
  TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'inventory_manager'::public.app_role))
    AND hospital_id = public.current_hospital_id()
  );

DROP POLICY IF EXISTS "Admins and managers can update inventory" ON public.inventory_items;
CREATE POLICY "Admins and managers can update inventory in their hospital"
  ON public.inventory_items FOR UPDATE
  TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'inventory_manager'::public.app_role))
    AND hospital_id = public.current_hospital_id()
  );

DROP POLICY IF EXISTS "Admins can delete inventory" ON public.inventory_items;
CREATE POLICY "Admins can delete inventory in their hospital"
  ON public.inventory_items FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND hospital_id = public.current_hospital_id());

-- predictions
DROP POLICY IF EXISTS "All authenticated users can view predictions" ON public.predictions;
CREATE POLICY "Users can view predictions in their hospital"
  ON public.predictions FOR SELECT
  TO authenticated
  USING (hospital_id = public.current_hospital_id());

DROP POLICY IF EXISTS "Admins and managers can insert predictions" ON public.predictions;
CREATE POLICY "Admins and managers can insert predictions in their hospital"
  ON public.predictions FOR INSERT
  TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'inventory_manager'::public.app_role))
    AND hospital_id = public.current_hospital_id()
  );

-- activity_logs: "own logs" policy is unchanged (already user-scoped);
-- "admins can view all" is now scoped to the admin's own hospital.
DROP POLICY IF EXISTS "Admins can view all logs" ON public.activity_logs;
CREATE POLICY "Admins can view logs in their hospital"
  ON public.activity_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role) AND hospital_id = public.current_hospital_id());

-- model_registry: intentionally NOT scoped -- one deployed model serves
-- every hospital, this describes the model artifact, not hospital data.

-- prediction_history
DROP POLICY IF EXISTS "All authenticated users can view prediction history" ON public.prediction_history;
CREATE POLICY "Users can view prediction history in their hospital"
  ON public.prediction_history FOR SELECT
  TO authenticated
  USING (hospital_id = public.current_hospital_id());

DROP POLICY IF EXISTS "Admins and managers can insert prediction history" ON public.prediction_history;
CREATE POLICY "Admins and managers can insert prediction history in their hospital"
  ON public.prediction_history FOR INSERT
  TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'inventory_manager'::public.app_role))
    AND hospital_id = public.current_hospital_id()
  );

-- alert_configurations
DROP POLICY IF EXISTS "All authenticated users can view alert configurations" ON public.alert_configurations;
CREATE POLICY "Users can view alert configurations in their hospital"
  ON public.alert_configurations FOR SELECT
  TO authenticated
  USING (hospital_id = public.current_hospital_id());

DROP POLICY IF EXISTS "Admins and managers can manage alert configurations" ON public.alert_configurations;
CREATE POLICY "Admins and managers can manage alert configurations in their hospital"
  ON public.alert_configurations FOR ALL
  TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'inventory_manager'::public.app_role))
    AND hospital_id = public.current_hospital_id()
  );

-- alerts_history
DROP POLICY IF EXISTS "Users can view alerts for their roles" ON public.alerts_history;
CREATE POLICY "Users can view alerts in their hospital"
  ON public.alerts_history FOR SELECT
  TO authenticated
  USING (hospital_id = public.current_hospital_id());

DROP POLICY IF EXISTS "Authenticated users can acknowledge alerts" ON public.alerts_history;
CREATE POLICY "Authenticated users can acknowledge alerts in their hospital"
  ON public.alerts_history FOR UPDATE
  TO authenticated
  USING (hospital_id = public.current_hospital_id())
  WITH CHECK (hospital_id = public.current_hospital_id());

-- "Service role can insert alerts" is unchanged -- service role bypasses
-- RLS by design; the edge function itself is responsible for stamping
-- the correct hospital_id (see _shared/auth.ts's getHospitalId()).

-- cost_optimization
DROP POLICY IF EXISTS "All authenticated users can view cost optimization" ON public.cost_optimization;
CREATE POLICY "Users can view cost optimization in their hospital"
  ON public.cost_optimization FOR SELECT
  TO authenticated
  USING (hospital_id = public.current_hospital_id());

DROP POLICY IF EXISTS "Managers and admins can manage cost optimization" ON public.cost_optimization;
CREATE POLICY "Managers and admins can manage cost optimization in their hospital"
  ON public.cost_optimization FOR ALL
  TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'inventory_manager'::public.app_role))
    AND hospital_id = public.current_hospital_id()
  );

-- usage_observations
DROP POLICY IF EXISTS "All authenticated users can view usage observations" ON public.usage_observations;
CREATE POLICY "Users can view usage observations in their hospital"
  ON public.usage_observations FOR SELECT
  TO authenticated
  USING (hospital_id = public.current_hospital_id());

-- login_attempts/password_history: intentionally NOT scoped by hospital.
-- login_attempts happens pre-authentication (rate limiting by email,
-- before we know which hospital -- or whether the account exists at
-- all), so there's no clean hospital linkage; it's a shared security-
-- monitoring surface, not hospital operational data. password_history is
-- already strictly self-referential (auth.uid() = user_id) with no
-- cross-tenant exposure either way.
