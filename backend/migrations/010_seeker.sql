-- ============================================
-- Migration: Seeker Genesis Token link mirror
-- Description: Mirrors the on-chain Seeker link (Player.seeker + the SeekerLink PDA) so the
--              leaderboards can render the SEEKER badge without one chain read per row. The chain
--              stays the truth: these columns only remember which mint was linked, and when.
-- ============================================

BEGIN;

ALTER TABLE users ADD COLUMN IF NOT EXISTS seeker_mint VARCHAR(64);
ALTER TABLE users ADD COLUMN IF NOT EXISTS seeker_linked_at TIMESTAMPTZ;

-- One token, one player - enforced on chain by the SeekerLink PDA's seeds, and here by this index.
-- Partial so the rows that never linked (the vast majority) stay out of it entirely.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_seeker_mint ON users(seeker_mint) WHERE seeker_mint IS NOT NULL;

COMMIT;
