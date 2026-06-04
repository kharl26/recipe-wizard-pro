-- Allow a 'system' context on user_messages so the app can drop admin-facing
-- alerts (e.g. a recipe response that hit the output-token ceiling and got
-- truncated) into the same inbox the admin already reviews. These rows are
-- written by the app itself, not submitted by a user.

ALTER TABLE user_messages DROP CONSTRAINT IF EXISTS user_messages_context_check;

ALTER TABLE user_messages
  ADD CONSTRAINT user_messages_context_check
  CHECK (context IN ('deletion', 'help', 'support', 'general', 'system'));
