-- Security hardening pass.
--
-- Findings this migration addresses:
-- 1. prediction_history allowed ANY authenticated user (including 'nurse') to insert
--    fabricated predictions directly via the client SDK, bypassing the intended
--    admin/inventory_manager-only write model used elsewhere (e.g. predictions table).
-- 2. alerts_history allowed any authenticated user to INSERT arbitrary alerts and
--    UPDATE any column on any alert (including rewriting title/message/severity of
--    someone else's alert), not just acknowledge/resolve it.
-- 3. login_attempts allowed public INSERT (including anon/unauthenticated callers),
--    which lets an attacker fabricate failed attempts against a victim's email to
--    force an account lockout (DoS). Only the edge functions (service_role) should
--    ever write here.
-- 4. activity_logs exists but nothing ever wrote to it -- role changes and inventory
--    deletions were unaudited. Add triggers so these are logged automatically,
--    regardless of which client/edge function performed the change.

-- 1. prediction_history: restrict INSERT to admin/inventory_manager.
DROP POLICY IF EXISTS "Authenticated users can insert predictions" ON public.prediction_history;
CREATE POLICY "Admins and managers can insert prediction history"
  ON public.prediction_history FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role) OR
    public.has_role(auth.uid(), 'inventory_manager'::public.app_role)
  );

-- 2a. alerts_history: only service_role (edge functions) may create alerts.
DROP POLICY IF EXISTS "System can insert alerts" ON public.alerts_history;
CREATE POLICY "Service role can insert alerts"
  ON public.alerts_history FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 2b. alerts_history: authenticated users may still update rows (to acknowledge /
-- resolve), but a trigger below blocks tampering with alert content unless admin.
DROP POLICY IF EXISTS "Users can update their alerts" ON public.alerts_history;
CREATE POLICY "Authenticated users can acknowledge alerts"
  ON public.alerts_history FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.prevent_alert_content_tampering()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    IF NEW.alert_type IS DISTINCT FROM OLD.alert_type
       OR NEW.severity IS DISTINCT FROM OLD.severity
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.message IS DISTINCT FROM OLD.message
       OR NEW.item_id IS DISTINCT FROM OLD.item_id THEN
      RAISE EXCEPTION 'Only admins may modify alert content; other users may only acknowledge/resolve alerts';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS alerts_history_protect_content ON public.alerts_history;
CREATE TRIGGER alerts_history_protect_content
  BEFORE UPDATE ON public.alerts_history
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_alert_content_tampering();

-- 3. login_attempts: only service_role may write (closes the account-lockout DoS vector).
DROP POLICY IF EXISTS "System can insert login attempts" ON public.login_attempts;
CREATE POLICY "Service role can insert login attempts"
  ON public.login_attempts FOR INSERT
  TO service_role
  WITH CHECK (true);

-- 4a. Audit user_roles changes (role assignment is a sensitive admin action).
CREATE OR REPLACE FUNCTION public.log_role_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.activity_logs (user_id, action, details)
  VALUES (
    auth.uid(),
    lower(TG_OP) || '_user_role',
    jsonb_build_object(
      'target_user_id', COALESCE(NEW.user_id, OLD.user_id),
      'role', COALESCE(NEW.role, OLD.role)
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS user_roles_audit ON public.user_roles;
CREATE TRIGGER user_roles_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_role_change();

-- 4b. Audit inventory deletions.
CREATE OR REPLACE FUNCTION public.log_inventory_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.activity_logs (user_id, action, details)
  VALUES (
    auth.uid(),
    'delete_inventory_item',
    jsonb_build_object('item_id', OLD.id, 'item_name', OLD.item_name)
  );
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS inventory_items_audit_delete ON public.inventory_items;
CREATE TRIGGER inventory_items_audit_delete
  BEFORE DELETE ON public.inventory_items
  FOR EACH ROW
  EXECUTE FUNCTION public.log_inventory_delete();
