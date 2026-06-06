-- SECURITY FIX (critical): stop users from escalating their own tier or moving
-- themselves between households by directly PATCHing the profiles table.
--
-- The "Users can update own profile" RLS policy (001_schema.sql) is
--     FOR UPDATE USING (id = auth.uid())   -- no WITH CHECK
-- Postgres reuses the USING expression as the WITH CHECK when none is given, so
-- the only constraint on the new row is `id = auth.uid()`. That says NOTHING
-- about `tier` or `household_id`, and Supabase's default UPDATE grant lets the
-- authenticated role write every column. Net effect: any signed-in user could
--     PATCH /rest/v1/profiles?id=eq.<self>  {"tier":"admin"}
-- to self-promote to admin (admin gate is profiles.tier = 'admin', and the admin
-- dashboard reads ALL users' data via the service-role key), or set their own
-- household_id to another household's UUID to read that household's data.
--
-- RLS alone cannot express "you may update these columns but not those," so we
-- fix it at the privilege layer. A table-level UPDATE grant overrides any
-- column-level REVOKE, so we must REVOKE the table grant and re-GRANT UPDATE on
-- only the columns the app legitimately lets a user change about themselves.
--
-- Privileged columns intentionally NOT granted (writable only via service_role):
--   tier         -> set by api/admin/tier.js and the post-checkout upgrade in
--                   subscribe.astro, both now using the service-role client
--   household_id -> set by the signup trigger (SECURITY DEFINER) and by
--                   household/{leave,respond}.js + guest/merge.js (service_role)
--   beta_tester  -> set by api/admin/beta.js (service_role)
--   id, created_at -> never user-writable
--
-- service_role keeps its own grants (not revoked here) and bypasses RLS, so all
-- the legitimate server-side writes above continue to work.

REVOKE UPDATE ON public.profiles FROM anon, authenticated;

GRANT UPDATE (display_name, notes, experience, wine_pairing, onboarded, show_photos, changelog_seen)
  ON public.profiles TO authenticated;
