-- Sea Invaders Database Schema
-- Initial Migration

-- ====================================
-- 1. USERS TABLE
-- ====================================
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    discord_id VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(255) NOT NULL,
    discriminator VARCHAR(10),
    avatar VARCHAR(255),
    email VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_users_discord_id ON users(discord_id);
CREATE INDEX idx_users_username ON users(username);

-- ====================================
-- 2. SCORES TABLE (Main Game)
-- ====================================
CREATE TABLE IF NOT EXISTS scores (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score >= 0),
    level_reached INTEGER NOT NULL CHECK (level_reached >= 1),
    game_duration INTEGER CHECK (game_duration >= 0), -- in seconds
    enemies_killed INTEGER DEFAULT 0,
    accuracy FLOAT CHECK (accuracy >= 0 AND accuracy <= 100),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    game_mode VARCHAR(50) DEFAULT 'classic',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_scores_score ON scores(score DESC);
CREATE INDEX idx_scores_user_id ON scores(user_id);
CREATE INDEX idx_scores_created_at ON scores(created_at DESC);
CREATE INDEX idx_scores_session_id ON scores(session_id);
CREATE INDEX idx_scores_game_mode ON scores(game_mode);

-- ====================================
-- 3. TOURNAMENTS TABLE
-- ====================================
CREATE TABLE IF NOT EXISTS tournaments (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    status VARCHAR(50) DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'finished', 'cancelled')),
    prize_pool VARCHAR(100),
    max_participants INTEGER,
    min_score_required INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tournaments_status ON tournaments(status);
CREATE INDEX idx_tournaments_start_time ON tournaments(start_time);
CREATE INDEX idx_tournaments_end_time ON tournaments(end_time);

-- ====================================
-- 4. TOURNAMENT SCORES TABLE
-- ====================================
CREATE TABLE IF NOT EXISTS tournament_scores (
    id SERIAL PRIMARY KEY,
    tournament_id INTEGER REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL CHECK (score >= 0),
    level_reached INTEGER NOT NULL CHECK (level_reached >= 1),
    game_duration INTEGER,
    enemies_killed INTEGER DEFAULT 0,
    accuracy FLOAT CHECK (accuracy >= 0 AND accuracy <= 100),
    session_id VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(tournament_id, user_id) -- one best result per player per tournament
);

CREATE INDEX idx_tournament_scores_tournament_id ON tournament_scores(tournament_id);
CREATE INDEX idx_tournament_scores_score ON tournament_scores(score DESC);
CREATE INDEX idx_tournament_scores_user_id ON tournament_scores(user_id);

-- ====================================
-- 5. USER STATISTICS TABLE
-- ====================================
CREATE TABLE IF NOT EXISTS user_stats (
    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    total_games INTEGER DEFAULT 0,
    best_score INTEGER DEFAULT 0,
    total_score BIGINT DEFAULT 0,
    avg_score FLOAT DEFAULT 0,
    max_level_reached INTEGER DEFAULT 0,
    total_playtime INTEGER DEFAULT 0, -- in seconds
    tournaments_participated INTEGER DEFAULT 0,
    tournaments_won INTEGER DEFAULT 0,
    last_played_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_user_stats_best_score ON user_stats(best_score DESC);
CREATE INDEX idx_user_stats_total_games ON user_stats(total_games DESC);

-- ====================================
-- 6. GAME SESSIONS TABLE (Anti-Cheat)
-- ====================================
CREATE TABLE IF NOT EXISTS game_sessions (
    session_id VARCHAR(255) PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMP DEFAULT NOW(),
    last_heartbeat TIMESTAMP DEFAULT NOW(),
    events JSONB, -- array of game events for validation
    is_valid BOOLEAN DEFAULT TRUE,
    final_score INTEGER,
    game_mode VARCHAR(50) DEFAULT 'classic',
    tournament_id INTEGER REFERENCES tournaments(id) ON DELETE SET NULL
);

CREATE INDEX idx_sessions_user_id ON game_sessions(user_id);
CREATE INDEX idx_sessions_started_at ON game_sessions(started_at DESC);
CREATE INDEX idx_sessions_is_valid ON game_sessions(is_valid);

-- ====================================
-- 7. ANTI-CHEAT LOGS TABLE
-- ====================================
CREATE TABLE IF NOT EXISTS anticheat_logs (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) REFERENCES game_sessions(session_id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    violation_type VARCHAR(100) NOT NULL,
    violation_data JSONB,
    severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_anticheat_user_id ON anticheat_logs(user_id);
CREATE INDEX idx_anticheat_severity ON anticheat_logs(severity);
CREATE INDEX idx_anticheat_created_at ON anticheat_logs(created_at DESC);

-- ====================================
-- TRIGGERS
-- ====================================

-- Trigger that keeps updated_at current
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tournaments_updated_at BEFORE UPDATE ON tournaments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_stats_updated_at BEFORE UPDATE ON user_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ====================================
-- FUNCTIONS
-- ====================================

-- Function that updates user stats after a game
CREATE OR REPLACE FUNCTION update_user_stats_after_game()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_stats (user_id, total_games, best_score, total_score, avg_score, max_level_reached, total_playtime, last_played_at)
    VALUES (
        NEW.user_id,
        1,
        NEW.score,
        NEW.score,
        NEW.score,
        NEW.level_reached,
        COALESCE(NEW.game_duration, 0),
        NOW()
    )
    ON CONFLICT (user_id) DO UPDATE SET
        total_games = user_stats.total_games + 1,
        best_score = GREATEST(user_stats.best_score, NEW.score),
        total_score = user_stats.total_score + NEW.score,
        avg_score = (user_stats.total_score + NEW.score) / (user_stats.total_games + 1),
        max_level_reached = GREATEST(user_stats.max_level_reached, NEW.level_reached),
        total_playtime = user_stats.total_playtime + COALESCE(NEW.game_duration, 0),
        last_played_at = NOW();

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger that updates stats after a score is inserted
CREATE TRIGGER trigger_update_user_stats_after_game
    AFTER INSERT ON scores
    FOR EACH ROW
    EXECUTE FUNCTION update_user_stats_after_game();

-- Trigger for tournament results
CREATE TRIGGER trigger_update_user_stats_after_tournament_game
    AFTER INSERT ON tournament_scores
    FOR EACH ROW
    EXECUTE FUNCTION update_user_stats_after_game();

-- ====================================
-- INITIAL DATA
-- ====================================

-- Insert a sample tournament (optional)
-- INSERT INTO tournaments (name, description, start_time, end_time, status, prize_pool, max_participants)
-- VALUES (
--     'Grand Opening Tournament',
--     'The first official Sea Invaders tournament!',
--     NOW() + INTERVAL '1 day',
--     NOW() + INTERVAL '8 days',
--     'upcoming',
--     'TBD',
--     100
-- );

-- ====================================
-- VIEWS
-- ====================================

-- Top players (all time)
CREATE OR REPLACE VIEW v_top_players_alltime AS
SELECT
    u.discord_id,
    u.username,
    u.avatar,
    us.best_score,
    us.total_games,
    us.avg_score,
    us.max_level_reached,
    us.tournaments_won,
    ROW_NUMBER() OVER (ORDER BY us.best_score DESC) as rank
FROM users u
JOIN user_stats us ON u.id = us.user_id
ORDER BY us.best_score DESC
LIMIT 100;

-- Active tournaments with participant counts
CREATE OR REPLACE VIEW v_active_tournaments AS
SELECT
    t.*,
    COUNT(ts.id) as participants_count
FROM tournaments t
LEFT JOIN tournament_scores ts ON t.id = ts.tournament_id
WHERE t.status = 'active'
GROUP BY t.id;

COMMENT ON TABLE users IS 'Players (Discord accounts)';
COMMENT ON TABLE scores IS 'Game results (main mode)';
COMMENT ON TABLE tournaments IS 'Tournaments';
COMMENT ON TABLE tournament_scores IS 'Tournament game results';
COMMENT ON TABLE user_stats IS 'Player statistics';
COMMENT ON TABLE game_sessions IS 'Game sessions for anti-cheat';
COMMENT ON TABLE anticheat_logs IS 'Anti-cheat violation logs';
