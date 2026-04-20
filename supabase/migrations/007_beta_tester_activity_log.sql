-- Beta tester flag on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS beta_tester boolean NOT NULL DEFAULT false;

-- Activity log for instrumented user actions
CREATE TABLE IF NOT EXISTS activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  detail JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_action ON activity_log(action);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at DESC);

-- RLS: only admin can read activity logs (via service role key)
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
