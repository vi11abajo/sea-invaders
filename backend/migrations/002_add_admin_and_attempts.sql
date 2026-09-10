-- Migration: Add admin and tournament attempts columns
-- Date: 2025-10-28
-- Description: Adds is_admin column to users table and attempts_count to tournament_scores

-- Add is_admin column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;

-- Add attempts_count column to tournament_scores table
ALTER TABLE tournament_scores ADD COLUMN IF NOT EXISTS attempts_count INTEGER DEFAULT 1;

-- Create index on is_admin for faster admin checks
CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users(is_admin) WHERE is_admin = TRUE;

-- Add comment
COMMENT ON COLUMN users.is_admin IS 'Flag indicating if user has admin privileges';
COMMENT ON COLUMN tournament_scores.attempts_count IS 'Number of attempts used in this tournament';
