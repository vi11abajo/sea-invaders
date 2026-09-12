-- ============================================
-- Migration: On-chain record confirmations mirror
-- Description: Mirrors confirmed on-chain daily-best submissions for fast leaderboard/history reads.
-- ============================================

BEGIN;

CREATE TABLE IF NOT EXISTS ranked_records (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    day INTEGER NOT NULL,
    score INTEGER NOT NULL,
    signature VARCHAR(128) NOT NULL,
    confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_ranked_records_day ON ranked_records(day);

COMMIT;
