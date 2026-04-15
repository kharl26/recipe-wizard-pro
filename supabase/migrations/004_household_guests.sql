-- Household guest profiles.
--
-- Non-registered household members (kids, elderly relatives, roommates
-- who don't want an account) can have their preferences/allergies tracked
-- without creating an auth.users record. Owned by the household; managed
-- by any registered member.
--
-- A guest can later be "upgraded" to a full registered user via an
-- invite flow — when they sign up, we link their new user_id here and
-- migrate their preferences.

CREATE TABLE household_guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id UUID REFERENCES households(id) ON DELETE CASCADE NOT NULL,
  display_name TEXT NOT NULL,
  experience TEXT DEFAULT 'beginner'
    CHECK (experience IN ('novice', 'beginner', 'intermediate', 'experienced', 'expert')),
  wine_pairing BOOLEAN DEFAULT false,
  notes TEXT,
  -- Set when this guest becomes a registered user. Kept as a pointer so
  -- historical references (e.g., shared recipes) still resolve.
  converted_to_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_household_guests_household ON household_guests(household_id);
CREATE INDEX idx_household_guests_converted ON household_guests(converted_to_user_id) WHERE converted_to_user_id IS NOT NULL;

-- Preferences: allow attribution to either a user OR a guest.
-- Drop the user_id NOT NULL constraint and add guest_id.
ALTER TABLE preferences ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE preferences ADD COLUMN guest_id UUID REFERENCES household_guests(id) ON DELETE CASCADE;
ALTER TABLE preferences ADD CONSTRAINT preferences_owner_check
  CHECK ((user_id IS NOT NULL AND guest_id IS NULL) OR (user_id IS NULL AND guest_id IS NOT NULL));

CREATE INDEX idx_preferences_guest ON preferences(guest_id) WHERE guest_id IS NOT NULL;

-- RLS on guests: household members can read/write
ALTER TABLE household_guests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Household members manage guests"
  ON household_guests FOR ALL
  USING (household_id = auth_household_id());
