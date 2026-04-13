-- Recipe Wizard Pro — Complete Schema
-- Run this in Supabase SQL Editor after creating the project.

-- =========================================================================
-- HOUSEHOLDS
-- =========================================================================
-- A household is a shared space: pantry, saved recipes, conversations.
-- Auto-created when a user signs up (household of one).
-- Other users can be invited to join.

CREATE TABLE households (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =========================================================================
-- PROFILES
-- =========================================================================
-- Extends Supabase auth.users with app-specific fields.
-- One profile per user; each user belongs to exactly one household.

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE SET NULL,
  display_name TEXT UNIQUE,
  experience TEXT DEFAULT 'beginner'
    CHECK (experience IN ('novice', 'beginner', 'intermediate', 'experienced', 'expert')),
  wine_pairing BOOLEAN DEFAULT false,
  notes TEXT,
  tier TEXT DEFAULT 'free'
    CHECK (tier IN ('free', 'friend', 'subscriber', 'admin')),
  onboarded BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for looking up profiles by household
CREATE INDEX idx_profiles_household ON profiles(household_id);

-- =========================================================================
-- HOUSEHOLD INVITES
-- =========================================================================

CREATE TABLE household_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE,
  invited_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_invites_email ON household_invites(invited_email);
CREATE INDEX idx_invites_household ON household_invites(household_id);

-- =========================================================================
-- PANTRY
-- =========================================================================
-- Shared across the household. Binary: have it or don't, with confidence.

CREATE TABLE pantry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE NOT NULL,
  item TEXT NOT NULL,
  category TEXT,
  confidence TEXT DEFAULT 'likely'
    CHECK (confidence IN ('certain', 'likely', 'maybe', 'depleted')),
  notes TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  modified_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_pantry_household ON pantry(household_id);

-- =========================================================================
-- PREFERENCES
-- =========================================================================
-- Per-person within a household.

CREATE TABLE preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE NOT NULL,
  category TEXT DEFAULT 'general'
    CHECK (category IN ('do_not_use', 'use_sparingly', 'prefer', 'substitute', 'general')),
  item TEXT NOT NULL,
  detail TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_preferences_user ON preferences(user_id);
CREATE INDEX idx_preferences_household ON preferences(household_id);

-- =========================================================================
-- BOOKMARKS (Saved Recipes)
-- =========================================================================
-- Shared across the household.

CREATE TABLE bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE NOT NULL,
  saved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  shared_by TEXT, -- display name or email of the person who shared it
  recipe_json JSONB NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_bookmarks_household ON bookmarks(household_id);

-- =========================================================================
-- CONVERSATIONS
-- =========================================================================
-- Chat history, shared across the household.

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_conversations_household ON conversations(household_id);
CREATE INDEX idx_conversations_created ON conversations(created_at);

-- =========================================================================
-- USER USAGE
-- =========================================================================
-- Per-user generation count, tracked monthly. The free-tier gate and
-- cost monitoring both read from this table.

CREATE TABLE user_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  month TEXT NOT NULL, -- 'YYYY-MM' format
  count INTEGER DEFAULT 0,
  UNIQUE(user_id, month)
);

CREATE INDEX idx_usage_user_month ON user_usage(user_id, month);

-- =========================================================================
-- FEEDBACK (deferred — schema ready for future feedback UI)
-- =========================================================================

CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  bookmark_id UUID REFERENCES bookmarks(id) ON DELETE SET NULL,
  rating INTEGER CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =========================================================================
-- NOTIFICATIONS
-- =========================================================================
-- In-app notifications for household invites, removals, shared recipes.

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL, -- 'invite', 'removal', 'share', 'system'
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);

-- =========================================================================
-- ROW LEVEL SECURITY
-- =========================================================================

ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE pantry ENABLE ROW LEVEL SECURITY;
ALTER TABLE preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Helper: get the current user's household_id
CREATE OR REPLACE FUNCTION auth_household_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT household_id FROM profiles WHERE id = auth.uid()
$$;

-- HOUSEHOLDS: members can read their own household
CREATE POLICY "Users can view their household"
  ON households FOR SELECT
  USING (id = auth_household_id());

-- PROFILES: users can read/update their own profile; read household members
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid() OR household_id = auth_household_id());

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

-- HOUSEHOLD INVITES: members can manage invites for their household
CREATE POLICY "Household members can view invites"
  ON household_invites FOR SELECT
  USING (household_id = auth_household_id() OR invited_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "Household members can create invites"
  ON household_invites FOR INSERT
  WITH CHECK (household_id = auth_household_id());

CREATE POLICY "Invited user can update invite"
  ON household_invites FOR UPDATE
  USING (invited_email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- PANTRY: household members can CRUD their household's pantry
CREATE POLICY "Household pantry access"
  ON pantry FOR ALL
  USING (household_id = auth_household_id());

-- PREFERENCES: users can manage their own; read household members'
CREATE POLICY "Users can manage own preferences"
  ON preferences FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Users can read household preferences"
  ON preferences FOR SELECT
  USING (household_id = auth_household_id());

-- BOOKMARKS: household members can CRUD
CREATE POLICY "Household bookmark access"
  ON bookmarks FOR ALL
  USING (household_id = auth_household_id());

-- CONVERSATIONS: household members can CRUD
CREATE POLICY "Household conversation access"
  ON conversations FOR ALL
  USING (household_id = auth_household_id());

-- USER USAGE: users can read/write their own usage
CREATE POLICY "Users can manage own usage"
  ON user_usage FOR ALL
  USING (user_id = auth.uid());

-- FEEDBACK: users can manage their own
CREATE POLICY "Users can manage own feedback"
  ON feedback FOR ALL
  USING (user_id = auth.uid());

-- NOTIFICATIONS: users can read/update their own
CREATE POLICY "Users can access own notifications"
  ON notifications FOR ALL
  USING (user_id = auth.uid());

-- =========================================================================
-- TRIGGER: Auto-create household + profile on new user signup
-- =========================================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_household_id UUID;
  pending_invite RECORD;
BEGIN
  -- Check if there's a pending invite for this email
  SELECT * INTO pending_invite
    FROM household_invites
    WHERE invited_email = NEW.email
      AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1;

  IF pending_invite IS NOT NULL THEN
    -- Join the existing household
    new_household_id := pending_invite.household_id;
    -- Mark invite as accepted
    UPDATE household_invites SET status = 'accepted' WHERE id = pending_invite.id;
  ELSE
    -- Create a new solo household
    INSERT INTO households DEFAULT VALUES RETURNING id INTO new_household_id;
  END IF;

  -- Create the profile
  INSERT INTO profiles (id, household_id)
    VALUES (NEW.id, new_household_id);

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- =========================================================================
-- FUNCTION: Increment usage counter
-- =========================================================================

CREATE OR REPLACE FUNCTION increment_usage(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_month TEXT := to_char(now(), 'YYYY-MM');
  new_count INTEGER;
BEGIN
  INSERT INTO user_usage (user_id, month, count)
    VALUES (p_user_id, current_month, 1)
    ON CONFLICT (user_id, month)
    DO UPDATE SET count = user_usage.count + 1
    RETURNING count INTO new_count;
  RETURN new_count;
END;
$$;

-- =========================================================================
-- FUNCTION: Get current month usage for a user
-- =========================================================================

CREATE OR REPLACE FUNCTION get_usage(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT COALESCE(
    (SELECT count FROM user_usage
     WHERE user_id = p_user_id
       AND month = to_char(now(), 'YYYY-MM')),
    0
  )
$$;
