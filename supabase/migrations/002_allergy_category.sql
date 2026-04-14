-- Add 'allergy' to the preferences category CHECK constraint.
-- Allergies are treated as the strictest form of "do not use" — the AI must
-- never suggest these ingredients and must warn about cross-contamination.

ALTER TABLE preferences DROP CONSTRAINT preferences_category_check;

ALTER TABLE preferences ADD CONSTRAINT preferences_category_check
  CHECK (category IN ('do_not_use', 'use_sparingly', 'prefer', 'substitute', 'general', 'allergy'));
