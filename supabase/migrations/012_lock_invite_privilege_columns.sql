-- SECURITY FIX: same missing-WITH-CHECK pattern as 011, on household_invites.
--
-- "Invited user can update invite" (001_schema.sql) is
--     FOR UPDATE USING (invited_email = ...)   -- no WITH CHECK
-- Postgres reuses USING as WITH CHECK when none is given, so the only
-- constraint on the new row is that invited_email must match the caller. That
-- says NOTHING about which columns change, and Supabase's default UPDATE
-- grant lets the authenticated role write every column. Net effect: an
-- invited user could PATCH their own invite row's household_id to redirect
-- which household accepting it moves them into (household/respond.js trusts
-- invite.household_id as the accept target), or overwrite invited_email /
-- status directly.
--
-- The app only ever writes `status` via the authenticated client
-- (household/respond.js, accept/decline). Everything else is written by
-- service-role code (guest/invite.js create, account/delete.js cleanup).
-- Lock the grant down to that one column, same approach as migration 011.

REVOKE UPDATE ON public.household_invites FROM anon, authenticated;

GRANT UPDATE (status) ON public.household_invites TO authenticated;
