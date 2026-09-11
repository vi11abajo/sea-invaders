-- ============================================
-- Migration: Solana wallet users and ranked daily runs
-- Description: Wallet sign-in creates users without Discord; ranked runs store verified replays.
-- ============================================

BEGIN;

-- Wallet-only users have no Discord id.
ALTER TABLE users ALTER COLUMN discord_id DROP NOT NULL;

-- Solana base58 addresses are up to 44 characters; leave headroom.
ALTER TABLE users ALTER COLUMN wallet_address TYPE VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wallet_unique ON users(wallet_address) WHERE wallet_address IS NOT NULL;

-- One row per ranked attempt. The replay is the proof; score and hash are what the server verified.
CREATE TABLE IF NOT EXISTS ranked_runs (
    id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day INTEGER NOT NULL,
    seed VARCHAR(64) NOT NULL,
    core_version INTEGER NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    ticks INTEGER,
    score INTEGER,
    state_hash VARCHAR(16),
    game_over BOOLEAN,
    replay BYTEA,
    status VARCHAR(16) NOT NULL DEFAULT 'started' CHECK (status IN ('started', 'verified', 'rejected')),
    reject_reason VARCHAR(64)
);

CREATE INDEX IF NOT EXISTS idx_ranked_runs_user_day ON ranked_runs(user_id, day);
CREATE INDEX IF NOT EXISTS idx_ranked_runs_day_score ON ranked_runs(day, score DESC) WHERE status = 'verified';

COMMIT;
