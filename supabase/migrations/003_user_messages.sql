-- User messages / suggestions / feedback to the admin.
-- Context: 'deletion', 'help', 'support', 'general'

CREATE TABLE user_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT, -- preserved even if the user deletes their account
  context TEXT NOT NULL CHECK (context IN ('deletion', 'help', 'support', 'general')),
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  read BOOLEAN DEFAULT false
);

CREATE INDEX idx_user_messages_created ON user_messages(created_at);
CREATE INDEX idx_user_messages_read ON user_messages(read);

ALTER TABLE user_messages ENABLE ROW LEVEL SECURITY;

-- Users can insert their own messages; admin reads via service_role
CREATE POLICY "Users can send messages"
  ON user_messages FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
