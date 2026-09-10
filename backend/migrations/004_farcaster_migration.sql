-- ============================================
-- Migration: Farcaster FID + Wallet Authentication
-- Description: Replace Discord auth with Farcaster FID + Wallet
-- ============================================

BEGIN;

-- Add new columns for Farcaster and Wallet
ALTER TABLE users ADD COLUMN IF NOT EXISTS fid BIGINT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address VARCHAR(42);
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(255);

-- Copy discord_username to username (temporary, for existing users)
UPDATE users SET username = discord_username WHERE username IS NULL AND discord_username IS NOT NULL;

-- Make fid unique
ALTER TABLE users ADD CONSTRAINT users_fid_unique UNIQUE (fid);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_fid ON users(fid);
CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet_address);

-- Drop Discord-related columns (after data migration)
-- IMPORTANT: Uncomment these after verifying data migration
-- ALTER TABLE users DROP COLUMN IF EXISTS discord_id;
-- ALTER TABLE users DROP COLUMN IF EXISTS discord_username;
-- ALTER TABLE users DROP COLUMN IF EXISTS discord_avatar;

-- Update scores table to use user_id (which will now be based on fid)
-- No changes needed - user_id foreign key remains the same

COMMIT;

-- ============================================
-- Post-migration notes:
-- ============================================
-- 1. After running this migration, update backend auth to use FID
-- 2. Verify all existing users have been migrated
-- 3. Uncomment the DROP COLUMN statements above
-- 4. Run: ALTER TABLE users ALTER COLUMN fid SET NOT NULL;
