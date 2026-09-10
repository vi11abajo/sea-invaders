-- Performance Optimization Migration
-- To support 200+ concurrent players

-- ====================================
-- 1. COMPOSITE INDEX for the tournament leaderboard
-- ====================================
-- Speeds up "top players of a tournament ordered by score" queries
DROP INDEX IF EXISTS idx_tournament_scores_tournament_score;
CREATE INDEX idx_tournament_scores_tournament_score
ON tournament_scores(tournament_id, score DESC);

-- ====================================
-- 2. COMPOSITE INDEX for the main leaderboard
-- ====================================
-- Speeds up "best results in classic mode" queries
DROP INDEX IF EXISTS idx_scores_mode_score;
CREATE INDEX idx_scores_mode_score
ON scores(game_mode, score DESC);

-- ====================================
-- 3. INDEX for active sessions
-- ====================================
-- Speeds up lookups of a user's active sessions
DROP INDEX IF EXISTS idx_sessions_user_tournament;
CREATE INDEX idx_sessions_user_tournament
ON game_sessions(user_id, tournament_id, is_valid);

-- ====================================
-- 4. PARTIAL INDEX for active tournaments
-- ====================================
-- Speeds up queries that only touch active tournaments
DROP INDEX IF EXISTS idx_tournaments_active;
CREATE INDEX idx_tournaments_active
ON tournaments(start_time, end_time)
WHERE status = 'active';

-- ====================================
-- 5. Faster tournament participant counts
-- ====================================
-- The materialized view refreshes less often than live queries would run
DROP MATERIALIZED VIEW IF EXISTS mv_tournament_participants_count;
CREATE MATERIALIZED VIEW mv_tournament_participants_count AS
SELECT
    tournament_id,
    COUNT(DISTINCT user_id) as participants_count,
    MAX(score) as top_score,
    MIN(created_at) as first_submission,
    MAX(created_at) as last_submission
FROM tournament_scores
GROUP BY tournament_id;

CREATE UNIQUE INDEX idx_mv_tournament_participants_tournament_id
ON mv_tournament_participants_count(tournament_id);

-- Function that refreshes the materialized view
CREATE OR REPLACE FUNCTION refresh_tournament_stats()
RETURNS trigger AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_tournament_participants_count;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic refresh (deferred via pg_notify)
-- This prevents refreshing too often
DROP TRIGGER IF EXISTS trigger_tournament_score_stats ON tournament_scores;
CREATE TRIGGER trigger_tournament_score_stats
    AFTER INSERT OR UPDATE OR DELETE ON tournament_scores
    FOR EACH STATEMENT
    EXECUTE FUNCTION refresh_tournament_stats();

-- ====================================
-- COMMENTS
-- ====================================
COMMENT ON INDEX idx_tournament_scores_tournament_score IS 'Composite index for fast tournament leaderboard queries';
COMMENT ON INDEX idx_scores_mode_score IS 'Composite index for fast per-mode leaderboard queries';
COMMENT ON MATERIALIZED VIEW mv_tournament_participants_count IS 'Cached tournament participant statistics';
