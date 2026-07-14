-- Fix a latent bug from the multi-tenancy migration: inventory_items.hospital_id
-- was made NOT NULL, but the frontend "Add Item" / edit forms insert without a
-- hospital_id (the app never had a hospital concept before). So adding an item
-- through the UI has been failing a NOT NULL violation since multi-tenancy
-- landed. Edge functions set hospital_id explicitly, so they were unaffected --
-- only the client-side insert path broke.
--
-- Fix: default hospital_id to the caller's own hospital. For an authenticated
-- client insert, current_hospital_id() resolves via auth.uid(); the RLS
-- WITH CHECK (hospital_id = current_hospital_id()) then passes automatically.
-- Edge functions still pass hospital_id explicitly, so the default is simply
-- unused there (and correctly yields NULL under the service role, which never
-- relies on it).
ALTER TABLE public.inventory_items
  ALTER COLUMN hospital_id SET DEFAULT public.current_hospital_id();
