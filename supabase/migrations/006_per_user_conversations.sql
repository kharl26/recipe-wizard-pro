-- Make conversations per-user instead of household-shared.
-- The user_id column scopes chat history to individual users while
-- keeping conversations in the household for cascade-delete purposes.

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id);
