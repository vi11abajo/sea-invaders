/**
 * Middleware for validating request data
 */

// Validate score submission
export function validateScoreSubmission(req, res, next) {
  const { sessionId, score, level, duration, enemiesKilled, accuracy } = req.body;

  const errors = [];

  // Check required fields
  if (!sessionId || typeof sessionId !== 'string') {
    errors.push('sessionId is required and must be a string');
  }

  if (typeof score !== 'number' || score < 0) {
    errors.push('score must be a non-negative number');
  }

  if (typeof level !== 'number' || level < 1) {
    errors.push('level must be a positive number');
  }

  // Check optional fields
  if (duration !== undefined && (typeof duration !== 'number' || duration < 0)) {
    errors.push('duration must be a non-negative number');
  }

  if (enemiesKilled !== undefined && (typeof enemiesKilled !== 'number' || enemiesKilled < 0)) {
    errors.push('enemiesKilled must be a non-negative number');
  }

  if (accuracy !== undefined) {
    if (typeof accuracy !== 'number' || accuracy < 0 || accuracy > 100) {
      errors.push('accuracy must be a number between 0 and 100');
    }
  }

  // Check limits from .env
  const maxScore = parseInt(process.env.MAX_SCORE_PER_LEVEL) || 10000;
  const maxLevel = parseInt(process.env.MAX_LEVEL) || 100;
  const minDuration = parseInt(process.env.MIN_GAME_DURATION) || 5000;

  if (score > maxScore * level) {
    errors.push(`score is too high for level ${level} (max: ${maxScore * level})`);
  }

  if (level > maxLevel) {
    errors.push(`level exceeds maximum allowed (${maxLevel})`);
  }

  if (duration && duration < minDuration) {
    errors.push(`game duration is too short (min: ${minDuration}ms)`);
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Invalid score submission data',
      details: errors
    });
  }

  next();
}

// Validate session creation
export function validateSessionStart(req, res, next) {
  const { gameMode, tournamentId } = req.body;

  const errors = [];

  if (gameMode && !['classic', 'tournament'].includes(gameMode)) {
    errors.push('gameMode must be either "classic" or "tournament"');
  }

  if (gameMode === 'tournament' && !tournamentId) {
    errors.push('tournamentId is required for tournament mode');
  }

  if (tournamentId !== undefined && typeof tournamentId !== 'number') {
    errors.push('tournamentId must be a number');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Invalid session start data',
      details: errors
    });
  }

  next();
}

// Validate heartbeat
export function validateHeartbeat(req, res, next) {
  const { sessionId, events } = req.body;

  const errors = [];

  if (!sessionId || typeof sessionId !== 'string') {
    errors.push('sessionId is required and must be a string');
  }

  if (events !== undefined && !Array.isArray(events)) {
    errors.push('events must be an array');
  }

  if (errors.length > 0) {
    return res.status(400).json({
      error: 'ValidationError',
      message: 'Invalid heartbeat data',
      details: errors
    });
  }

  next();
}

// Validate pagination for leaderboard
export function validateLeaderboardQuery(req, res, next) {
  const { limit, offset } = req.query;

  if (limit) {
    const limitNum = parseInt(limit);
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'limit must be between 1 and 1000'
      });
    }
    req.query.limit = limitNum;
  }

  if (offset) {
    const offsetNum = parseInt(offset);
    if (isNaN(offsetNum) || offsetNum < 0) {
      return res.status(400).json({
        error: 'ValidationError',
        message: 'offset must be a non-negative number'
      });
    }
    req.query.offset = offsetNum;
  }

  next();
}

export default {
  validateScoreSubmission,
  validateSessionStart,
  validateHeartbeat,
  validateLeaderboardQuery
};
