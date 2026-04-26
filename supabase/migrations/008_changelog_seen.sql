-- Track when user last viewed the changelog
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS changelog_seen TIMESTAMPTZ;
