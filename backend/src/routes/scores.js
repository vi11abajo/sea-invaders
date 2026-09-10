import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database.js';
import { authenticateToken } from '../middleware/auth.js';
import { scoreSubmitLimiter, sessionLimiter } from '../middleware/rateLimit.js';
import { validateScoreSubmission, validateSessionStart, validateHeartbeat } from '../middleware/validation.js';
import { validateScore, saveScore } from '../services/scoreService.js';

const router = express.Router();

/**
 * POST /api/scores/session/start
 * Start new game session
 */
router.post('/session/start', authenticateToken, sessionLimiter, validateSessionStart, async (req, res) => {
  const { gameMode = 'classic' } = req.body;
  const sessionId = uuidv4();

  try {
    // Create session
    await pool.query(
      `INSERT INTO game_sessions (session_id, user_id, game_mode)
       VALUES ($1, $2, $3)`,
      [sessionId, req.user.userId, gameMode]
    );

    res.json({
      success: true,
      sessionId,
      gameMode,
    });
  } catch (error) {
    console.error('Error starting session:', error);
    res.status(500).json({
      error: 'ServerError',
      message: 'Failed to start game session',
    });
  }
});

/**
 * POST /api/scores/session/heartbeat
 * Update session heartbeat (every 10-15 seconds during game)
 */
router.post('/session/heartbeat', authenticateToken, validateHeartbeat, async (req, res) => {
  const { sessionId, events } = req.body;

  try {
    const result = await pool.query(
      `UPDATE game_sessions
       SET last_heartbeat = NOW(),
           events = $1
       WHERE session_id = $2 AND user_id = $3
       RETURNING session_id`,
      [events ? JSON.stringify(events) : null, sessionId, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'SessionNotFound',
        message: 'Game session not found or unauthorized',
      });
    }

    res.json({
      success: true,
    });
  } catch (error) {
    console.error('Error updating heartbeat:', error);
    res.status(500).json({
      error: 'ServerError',
      message: 'Failed to update heartbeat',
    });
  }
});

/**
 * POST /api/scores/submit
 * Send final game result
 */
router.post('/submit', authenticateToken, scoreSubmitLimiter, validateScoreSubmission, async (req, res) => {
  const { sessionId, score, level, duration, enemiesKilled, accuracy } = req.body;

  try {
    // Check session existence
    const sessionResult = await pool.query(
      `SELECT * FROM game_sessions WHERE session_id = $1 AND user_id = $2`,
      [sessionId, req.user.userId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(404).json({
        error: 'SessionNotFound',
        message: 'Game session not found or unauthorized',
      });
    }

    const session = sessionResult.rows[0];

    // Check that session is still valid (not expired)
    const sessionTimeout = parseInt(process.env.SESSION_HEARTBEAT_TIMEOUT) || 30000;
    const lastHeartbeat = new Date(session.last_heartbeat);
    const now = new Date();

    if (now - lastHeartbeat > sessionTimeout && process.env.ENABLE_SCORE_VALIDATION === 'true') {
      return res.status(400).json({
        error: 'SessionExpired',
        message: 'Game session has expired due to inactivity',
      });
    }

    // Anti-cheat validation
    if (process.env.ENABLE_SCORE_VALIDATION === 'true') {
      const validation = validateScore({
        score,
        level,
        duration,
        enemiesKilled,
        events: session.events,
      });

      if (!validation.valid) {
        // Log violation
        await pool.query(
          `INSERT INTO anticheat_logs (session_id, user_id, violation_type, violation_data, severity)
           VALUES ($1, $2, $3, $4, $5)`,
          [sessionId, req.user.userId, 'score_validation_failed', JSON.stringify({ reason: validation.reason }), 'high']
        );

        return res.status(400).json({
          error: 'ValidationFailed',
          message: 'Score validation failed',
          reason: validation.reason,
        });
      }
    }

    // Save result
    const savedScore = await saveScore(req.user.userId, {
      sessionId,
      score,
      level,
      duration,
      enemiesKilled,
      accuracy,
      gameMode: session.game_mode,
    });

    // Update session
    await pool.query(
      `UPDATE game_sessions SET final_score = $1 WHERE session_id = $2`,
      [score, sessionId]
    );

    res.json({
      success: true,
      score: savedScore,
    });
  } catch (error) {
    if (error.message === 'Score already submitted for this session') {
      return res.status(400).json({
        error: 'DuplicateSubmission',
        message: error.message,
      });
    }

    if (error.message === 'Your existing tournament score is higher') {
      return res.status(400).json({
        error: 'LowerScore',
        message: error.message,
      });
    }

    console.error('Error submitting score:', error);
    res.status(500).json({
      error: 'ServerError',
      message: 'Failed to submit score',
    });
  }
});

/**
 * GET /api/scores/my-scores
 * Get your own results
 */
router.get('/my-scores', authenticateToken, async (req, res) => {
  const limit = parseInt(req.query.limit) || 10;

  try {
    const result = await pool.query(
      `SELECT * FROM scores
       WHERE user_id = $1
       ORDER BY score DESC
       LIMIT $2`,
      [req.user.userId, limit]
    );

    res.json({
      scores: result.rows,
    });
  } catch (error) {
    console.error('Error fetching user scores:', error);
    res.status(500).json({
      error: 'ServerError',
      message: 'Failed to fetch scores',
    });
  }
});

export default router;
