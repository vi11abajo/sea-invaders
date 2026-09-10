import pool from '../config/database.js';

/**
 * Game result validation (anti-cheat)
 */
export function validateScore({ score, level, duration, enemiesKilled, events }) {
  const validation = { valid: true, reason: null };

  // Get limits from .env
  const maxScorePerLevel = parseInt(process.env.MAX_SCORE_PER_LEVEL) || 10000;
  const maxLevel = parseInt(process.env.MAX_LEVEL) || 100;
  const minDuration = parseInt(process.env.MIN_GAME_DURATION) || 5000;

  // Check 1: Score too high for level
  if (score > maxScorePerLevel * level) {
    validation.valid = false;
    validation.reason = `Score too high for level ${level}`;
    return validation;
  }

  // Check 2: Level too high
  if (level > maxLevel) {
    validation.valid = false;
    validation.reason = `Level ${level} exceeds maximum`;
    return validation;
  }

  // Check 3: Game too short
  if (duration && duration < minDuration) {
    validation.valid = false;
    validation.reason = `Game duration too short (${duration}ms)`;
    return validation;
  }

  // Check 4: Physically impossible score per second
  if (duration) {
    const scorePerSecond = (score / (duration / 1000));
    const maxScorePerSecond = 1000; // configurable

    if (scorePerSecond > maxScorePerSecond) {
      validation.valid = false;
      validation.reason = `Impossible score rate (${scorePerSecond.toFixed(2)} points/sec)`;
      return validation;
    }
  }

  // Check 5: Number of killed enemies vs score
  if (enemiesKilled !== undefined) {
    const avgScorePerEnemy = score / (enemiesKilled || 1);

    // Average crab gives 30-170 points (see game-constants.js)
    if (avgScorePerEnemy > 500) {
      validation.valid = false;
      validation.reason = `Score per enemy too high (${avgScorePerEnemy.toFixed(2)})`;
      return validation;
    }
  }

  // Check 6: Events from session (if enabled)
  if (events && Array.isArray(events)) {
    // Can add deeper event validation
    // For example, checking event sequence, timestamps, etc.
  }

  return validation;
}

/**
 * Save game result
 */
export async function saveScore(userId, scoreData) {
  const { sessionId, score, level, duration, enemiesKilled, accuracy, gameMode = 'classic' } = scoreData;

  try {
    const result = await pool.query(
      `INSERT INTO scores (user_id, score, level_reached, game_duration, enemies_killed, accuracy, session_id, game_mode)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, score, level, duration, enemiesKilled, accuracy, sessionId, gameMode]
    );

    return result.rows[0];
  } catch (error) {
    if (error.code === '23505') { // unique_violation
      throw new Error('Score already submitted for this session');
    }
    console.error('Error saving score:', error);
    throw error;
  }
}


/**
 * Get user's best results
 */
export async function getUserTopScores(userId, limit = 10) {
  try {
    const result = await pool.query(
      `SELECT * FROM scores
       WHERE user_id = $1
       ORDER BY score DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows;
  } catch (error) {
    console.error('Error getting user top scores:', error);
    throw error;
  }
}

export default {
  validateScore,
  saveScore,
  getUserTopScores,
};
