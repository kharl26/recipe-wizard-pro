-- Dietary constraints — numeric per-serving thresholds the AI must respect
-- when generating recipes. Distinct from `preferences` (which is free-text
-- categorical avoidance like "vegetarian" or "no cilantro"). Constraints are
-- structured: metric + operator + value, mapped directly onto the keys of
-- the `nutrition` object the AI emits per recipe.
--
-- Examples:
--   metric=calories  op=lte value=500   "≤ 500 cal/serving"
--   metric=protein_g op=gte value=25    "≥ 25 g protein/serving"
--
-- Per-person within a household, like preferences. Either user_id (a
-- registered member) or guest_id (a non-registered resident) — exactly one.

CREATE TABLE dietary_constraints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  guest_id UUID REFERENCES household_guests(id) ON DELETE CASCADE,
  household_id UUID REFERENCES households(id) ON DELETE CASCADE NOT NULL,
  metric TEXT NOT NULL
    CHECK (metric IN ('calories', 'sodium_mg', 'carbs_g', 'fat_g', 'protein_g', 'fiber_g')),
  op TEXT NOT NULL CHECK (op IN ('lte', 'gte')),
  value INTEGER NOT NULL CHECK (value >= 0 AND value <= 10000),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT dietary_constraints_owner_check
    CHECK ((user_id IS NOT NULL AND guest_id IS NULL)
        OR (user_id IS NULL AND guest_id IS NOT NULL)),
  CONSTRAINT dietary_constraints_unique_metric_op
    UNIQUE NULLS NOT DISTINCT (user_id, guest_id, metric, op)
);

CREATE INDEX idx_dietary_constraints_household ON dietary_constraints(household_id);
CREATE INDEX idx_dietary_constraints_user ON dietary_constraints(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_dietary_constraints_guest ON dietary_constraints(guest_id) WHERE guest_id IS NOT NULL;

-- RLS — more explicit than `preferences`. The preferences table only has a
-- "user_id = auth.uid()" write policy, which silently fails to cover the
-- guest_id case. Here we cover both paths from day one.
ALTER TABLE dietary_constraints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own constraints"
  ON dietary_constraints FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "Household members manage guest constraints"
  ON dietary_constraints FOR ALL
  USING (guest_id IS NOT NULL AND household_id = auth_household_id());

CREATE POLICY "Read household constraints"
  ON dietary_constraints FOR SELECT
  USING (household_id = auth_household_id());
