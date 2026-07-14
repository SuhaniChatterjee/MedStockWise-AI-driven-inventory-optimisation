-- Stage 2 onboarding: let a new signup either CREATE a new hospital (and
-- become its admin) or JOIN an existing one by invite code (as a nurse),
-- instead of everyone silently landing in the default hospital as a nurse.
--
-- All of this happens inside handle_new_user(), which runs in the same
-- transaction as the auth.users insert -- so if hospital creation or an
-- invite-code lookup fails, the whole signup rolls back atomically. No
-- orphaned hospitals, no half-created accounts.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_invite_code text := NULLIF(NEW.raw_user_meta_data->>'invite_code', '');
  v_hospital_name text := NULLIF(NEW.raw_user_meta_data->>'hospital_name', '');
  v_region text := NULLIF(NEW.raw_user_meta_data->>'region', '');
  v_explicit_id text := NULLIF(NEW.raw_user_meta_data->>'hospital_id', '');
  v_hospital_id uuid;
  v_role public.app_role;
BEGIN
  IF v_invite_code IS NOT NULL THEN
    -- Join existing hospital by invite code, as a nurse. Invalid code
    -- raises here, which rolls back the whole signup.
    SELECT id INTO v_hospital_id FROM public.hospitals WHERE invite_code = v_invite_code;
    IF v_hospital_id IS NULL THEN
      RAISE EXCEPTION 'Invalid invite code';
    END IF;
    v_role := 'nurse';

  ELSIF v_hospital_name IS NOT NULL THEN
    -- Create a new hospital; the creator becomes its admin. region is
    -- validated by the hospitals CHECK constraint (temperate/tropical/
    -- subtropical) -- an invalid value raises and rolls back signup.
    INSERT INTO public.hospitals (name, region)
    VALUES (v_hospital_name, COALESCE(v_region, 'temperate'))
    RETURNING id INTO v_hospital_id;
    v_role := 'admin';

  ELSE
    -- Fallback: explicit hospital_id metadata (used by tests/tooling), or
    -- the default hospital. Preserves the interim behavior from the
    -- previous migration for any signup that carries no onboarding choice.
    v_hospital_id := COALESCE(v_explicit_id::uuid, '00000000-0000-0000-0000-000000000001'::uuid);
    v_role := 'nurse';
  END IF;

  INSERT INTO public.profiles (id, full_name, email, hospital_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    NEW.email,
    v_hospital_id
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role);

  RETURN NEW;
END;
$$;

-- Tighten the hospitals SELECT policy. The multi-tenancy migration left
-- this as USING (true), which let ANY authenticated user read EVERY
-- hospital row -- including invite_code, so a logged-in user could
-- enumerate every hospital's join code. The invite-code lookup during
-- signup runs in handle_new_user() (SECURITY DEFINER, bypasses RLS) and
-- the validate-invite-code edge function uses the service-role key, so
-- neither needs a public read. Restrict authenticated reads to the
-- caller's own hospital (admins legitimately need their own invite_code
-- to share it).
DROP POLICY IF EXISTS "Anyone can view hospital name and region" ON public.hospitals;
CREATE POLICY "Users can view their own hospital"
  ON public.hospitals FOR SELECT
  TO authenticated
  USING (id = public.current_hospital_id());
