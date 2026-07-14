-- profiles.hospital_id became NOT NULL in the multi-tenancy migration, but
-- handle_new_user() (the trigger that creates a profile row on signup)
-- never set it -- meaning every new signup right now would hard-fail with
-- a NOT NULL violation. This can't wait for Stage 2's full onboarding UI
-- (create-hospital vs. join-by-invite-code); it needs an interim fix so
-- signup isn't broken in production in the meantime.
--
-- Interim behavior: accept an optional hospital_id via signup metadata
-- (so Stage 2 can pass one through from a real onboarding flow without
-- requiring another trigger change), falling back to the default hospital
-- if none is provided (today, that's every signup, since there's no UI
-- yet to choose one).
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_hospital_id uuid;
BEGIN
  target_hospital_id := COALESCE(
    (NEW.raw_user_meta_data->>'hospital_id')::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid
  );

  INSERT INTO public.profiles (id, full_name, email, hospital_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'User'),
    NEW.email,
    target_hospital_id
  );

  -- Assign default 'nurse' role to new users
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'nurse'::public.app_role);

  RETURN NEW;
END;
$$;
