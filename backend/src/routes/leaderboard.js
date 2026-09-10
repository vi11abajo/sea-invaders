import express from 'express';
import NodeCache from 'node-cache';
import pool from '../config/database.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { validateLeaderboardQuery } from '../middleware/validation.js';
import { leaderboardLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// Apply soft rate limiter to all leaderboard endpoints
router.use(leaderboardLimiter);

// cache for leaderboard (TTL from .env)
const cacheTTL = parseInt(process.env.LEADERBOARD_CACHE_TTL) || 30;
const cache = new NodeCache({ stdTTL: cacheTTL, checkperiod: 60 });

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ success: true, message: 'Leaderboard route works!' });
});

/**
 * GET /api/leaderboard
 * Root leaderboard endpoint (for frontend compatibility)
 * Supports filter: all, weekly, daily
 */
router.get('/', optionalAuth, async (req, res) => {
  const { filter = 'all', page = 1, limit = 50 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const cacheKey = `leaderboard_${filter}_${page}_${limit}`;

  try {
    // Check if database is available
    try {
      await pool.query('SELECT 1');
    } catch (dbError) {
      console.error('⚠️  Database not available for leaderboard, returning mock data');
      return res.json({
        success: true,
        entries: [],
        total: 0,
        page: parseInt(page),
        limit: parseInt(limit),
        hasMore: false,
        message: 'Database not available - please check DB configuration',
      });
    }

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({
        ...cached,
        cached: true,
      });
    }

    let whereClause = '';
    let queryParams = [parseInt(limit), offset];

    // Add time filters
    if (filter === 'monthly') {
      const monthAgo = new Date();
      monthAgo.setMonth(monthAgo.getMonth() - 1);
      whereClause = 'WHERE s.created_at >= $3';
      queryParams.push(monthAgo.toISOString());
    } else if (filter === 'weekly') {
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      whereClause = 'WHERE s.created_at >= $3';
      queryParams.push(weekAgo.toISOString());
    } else if (filter === 'daily') {
      const dayAgo = new Date();
      dayAgo.setDate(dayAgo.getDate() - 1);
      whereClause = 'WHERE s.created_at >= $3';
      queryParams.push(dayAgo.toISOString());
    }

    // Query with JOIN to users table for avatar/username
    const query = `
      SELECT
        ROW_NUMBER() OVER (ORDER BY s.score DESC) as rank,
        COALESCE(u.username, CAST(u.fid AS TEXT), 'Player') as player,
        s.score,
        s.level_reached as level,
        to_char(s.created_at, 'YYYY-MM-DD') as date,
        u.avatar,
        u.username
      FROM scores s
      LEFT JOIN users u ON s.user_id = u.id
      ${whereClause}
      ORDER BY s.score DESC
      LIMIT $1 OFFSET $2
    `;

    const result = await pool.query(query, queryParams);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM scores s';
    let countParams = [];
    if (whereClause) {
      countQuery += ' ' + whereClause;
      countParams = [queryParams[2]];
    }
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].total) || 0;

    const entries = result.rows.map((row) => ({
      rank: parseInt(row.rank),
      player: row.player,
      score: row.score,
      level: row.level,
      date: row.date,
      avatar: row.avatar,
      username: row.username,
    }));

    const response = {
      success: true,
      entries,
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      hasMore: (parseInt(page) * parseInt(limit)) < total,
    };

    // Save to cache
    cache.set(cacheKey, response);

    res.json(response);
  } catch (error) {
    console.error('❌ Error fetching leaderboard:', error);
    console.error('   Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
    });
    res.status(500).json({
      success: false,
      error: 'Failed to fetch leaderboard',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
});

// Separate cache for tournament leaderboard with smaller TTL for more frequent updates
const tournamentCacheTTL = parseInt(process.env.TOURNAMENT_LEADERBOARD_CACHE_TTL) || 10; // 10 seconds
const tournamentCache = new NodeCache({ stdTTL: tournamentCacheTTL, checkperiod: 20 });

/**
 * GET /api/leaderboard/main
 * Main leaderboard (updates once per 30 sec through cache)
 */
router.get('/main', optionalAuth, validateLeaderboardQuery, async (req, res) => {
  const limit = req.query.limit || 100;
  const offset = req.query.offset || 0;
  const cacheKey = `leaderboard_main_${limit}_${offset}`;

  try {
    // Checking cache
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({
        ...cached,
        cached: true,
        ttl: cache.getTtl(cacheKey),
      });
    }

    // Getting total count of unique players for pagination
    const countResult = await pool.query(
      `SELECT COUNT(DISTINCT user_id) as total
       FROM scores
       WHERE game_mode = 'classic'`
    );
    const totalCount = parseInt(countResult.rows[0].total) || 0;

    // Database request - Getting BEST result of each player + number of games
    const result = await pool.query(
      `WITH player_stats AS (
         SELECT
           s.user_id,
           MAX(s.score) as best_score,
           MAX(s.level_reached) as max_level,
           COUNT(*) as games_played,
           MAX(s.created_at) FILTER (WHERE s.score = (SELECT MAX(score) FROM scores WHERE user_id = s.user_id AND game_mode = 'classic')) as best_score_date
         FROM scores s
         WHERE s.game_mode = 'classic'
         GROUP BY s.user_id
       )
       SELECT
         u.discord_id,
         u.username,
         u.avatar,
         ps.best_score as score,
         ps.max_level as level_reached,
         ps.games_played,
         ps.best_score_date as created_at,
         ROW_NUMBER() OVER (ORDER BY ps.best_score DESC) as rank
       FROM player_stats ps
       JOIN users u ON ps.user_id = u.id
       ORDER BY ps.best_score DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    // Form response with correct rank
    const leaderboard = result.rows.map((row, index) => ({
        rank: offset + index + 1,
        discord_id: row.discord_id,
        username: row.username,
        avatar: row.avatar,
        score: row.score,
        level_reached: row.level_reached,
        games_played: row.games_played,
        created_at: row.created_at,
    }));

    // Form response for caching
    const response = {
      leaderboard,
      totalCount,
      cached: false,
    };

    // Save to cache
    cache.set(cacheKey, response);

    res.json(response);
  } catch (error) {
    console.error('Error fetching main leaderboard:', error);
    res.status(500).json({
      error: 'ServerError',
      message: 'Failed to fetch leaderboard',
    });
  }
});

/**
 * GET /api/leaderboard/tournament/:tournamentId
 * Tournament leaderboard (cached for 10 seconds to reduce load)
 */
router.get('/tournament/:tournamentId', optionalAuth, validateLeaderboardQuery, async (req, res) => {
  const { tournamentId } = req.params;
  const limit = req.query.limit || 100;
  const cacheKey = `tournament_${tournamentId}_${limit}`;

  try {
    // Checking cache
    const cached = tournamentCache.get(cacheKey);
    if (cached) {
      return res.json({
        ...cached,
        cached: true,
        ttl: tournamentCache.getTtl(cacheKey),
      });
    }

    // Check tournament existence
    const tournamentCheck = await pool.query(
      'SELECT * FROM tournaments WHERE id = $1',
      [tournamentId]
    );

    if (tournamentCheck.rows.length === 0) {
      return res.status(404).json({
        error: 'TournamentNotFound',
        message: 'Tournament not found',
      });
    }

    const tournament = tournamentCheck.rows[0];

    // Get leaderboard (using new composite index)
    const result = await pool.query(
      `SELECT
         u.discord_id,
         u.username,
         u.avatar,
         ts.score,
         ts.level_reached,
         ts.created_at,
         ROW_NUMBER() OVER (ORDER BY ts.score DESC) as rank
       FROM tournament_scores ts
       JOIN users u ON ts.user_id = u.id
       WHERE ts.tournament_id = $1
       ORDER BY ts.score DESC
       LIMIT $2`,
      [tournamentId, limit]
    );

    const response = {
      tournament: {
        id: tournament.id,
        name: tournament.name,
        status: tournament.status,
        start_time: tournament.start_time,
        end_time: tournament.end_time,
      },
      leaderboard: result.rows,
    };

    // Save to cache
    tournamentCache.set(cacheKey, response);

    res.json({
      ...response,
      cached: false,
    });
  } catch (error) {
    console.error('Error fetching tournament leaderboard:', error);
    res.status(500).json({
      error: 'ServerError',
      message: 'Failed to fetch tournament leaderboard',
    });
  }
});

/**
 * GET /api/leaderboard/top-players
 * Top players by statistics
 */
router.get('/top-players', validateLeaderboardQuery, async (req, res) => {
  const limit = req.query.limit || 100;
  const sortBy = req.query.sortBy || 'best_score'; // best_score, total_games, avg_score

  const allowedSortFields = ['best_score', 'total_games', 'avg_score', 'max_level_reached', 'tournaments_won'];

  if (!allowedSortFields.includes(sortBy)) {
    return res.status(400).json({
      error: 'InvalidSortField',
      message: `sortBy must be one of: ${allowedSortFields.join(', ')}`,
    });
  }

  try {
    const result = await pool.query(
      `SELECT
         u.discord_id,
         u.username,
         u.avatar,
         us.best_score,
         us.total_games,
         us.avg_score,
         us.max_level_reached,
         us.tournaments_won,
         ROW_NUMBER() OVER (ORDER BY us.${sortBy} DESC) as rank
       FROM user_stats us
       JOIN users u ON us.user_id = u.id
       ORDER BY us.${sortBy} DESC
       LIMIT $1`,
      [limit]
    );

    res.json({
      topPlayers: result.rows,
      sortedBy: sortBy,
    });
  } catch (error) {
    console.error('Error fetching top players:', error);
    res.status(500).json({
      error: 'ServerError',
      message: 'Failed to fetch top players',
    });
  }
});

/**
 * GET /api/leaderboard/my-rank
 * Get your own rank in general leaderboard
 */
router.get('/my-rank', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `WITH ranked_scores AS (
         SELECT
           user_id,
           MAX(score) as best_score,
           ROW_NUMBER() OVER (ORDER BY MAX(score) DESC) as rank
         FROM scores
         WHERE game_mode = 'classic'
         GROUP BY user_id
       )
       SELECT rank, best_score
       FROM ranked_scores
       WHERE user_id = $1`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.json({
        rank: null,
        best_score: 0,
        message: 'No scores yet',
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching user rank:', error);
    res.status(500).json({
      error: 'ServerError',
      message: 'Failed to fetch rank',
    });
  }
});

/**
 * GET /api/leaderboard/stats
 * Get general leaderboard statistics
 */
router.get('/stats', async (req, res) => {
  const cacheKey = 'leaderboard_stats';

  try {
    // Checking cache
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({
        ...cached,
        cached: true,
      });
    }

    // Get statistics from database
    const result = await pool.query(
      `SELECT
         COUNT(DISTINCT user_id) as total_players,
         COUNT(*) as total_games
       FROM scores
       WHERE game_mode = 'classic'`
    );

    const stats = {
      totalPlayers: parseInt(result.rows[0].total_players) || 0,
      totalGames: parseInt(result.rows[0].total_games) || 0,
    };

    // Save to cache
    cache.set(cacheKey, stats);

    res.json({
      ...stats,
      cached: false,
    });
  } catch (error) {
    console.error('Error fetching leaderboard stats:', error);
    res.status(500).json({
      error: 'ServerError',
      message: 'Failed to fetch leaderboard stats',
    });
  }
});

/**
 * Function for clearing tournament leaderboard cache
 * Called after saving a new score in tournament
 */
export function clearTournamentCache(tournamentId) {
  const cacheKey = `tournament_${tournamentId}_100`;
  tournamentCache.del(cacheKey);
  console.log(`🗑️ Cleared tournament cache for tournament ${tournamentId}`);
}

export default router;
