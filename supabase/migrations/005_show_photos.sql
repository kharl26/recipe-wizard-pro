-- Add show_photos toggle to profiles (default false — opt-in)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS show_photos boolean NOT NULL DEFAULT false;
