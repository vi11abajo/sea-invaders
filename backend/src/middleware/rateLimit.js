import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwt.js';

// Function for extracting rate limiting key (userId or IP)
const getUserKey = (req) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, jwtConfig.secret, {
        algorithms: [jwtConfig.algorithm],
        issuer: jwtConfig.issuer,
        audience: jwtConfig.audience
      });

      // Use userId for authenticated users
      if (decoded.userId) {
        return `user:${decoded.userId}`;
      }
    }
  } catch (error) {
    // If error during token verification - use IP
  }

  // For unauthenticated - use IP
  return `ip:${req.ip}`;
};

// General rate limiter for API
export const apiLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 3000, // Increased to 3000 with per-user limiting
  message: {
    error: 'TooManyRequests',
    message: 'Too many requests from this IP, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use per-user rate limiting for authenticated users
  keyGenerator: getUserKey,
  // Skip requests from administrators
  skip: (req) => {
    try {
      // Check Authorization header
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return false;
      }

      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, jwtConfig.secret, {
        algorithms: [jwtConfig.algorithm],
        issuer: jwtConfig.issuer,
        audience: jwtConfig.audience
      });

      // Skip if user is admin
      return decoded.isAdmin === true;
    } catch (error) {
      // If error during token verification - don't skip
      return false;
    }
  }
});

// Limiter for authentication (defense from bruteforce, but soft enough for normal use)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // increased from 10 to 50 authentication attempts
  message: {
    error: 'TooManyAuthAttempts',
    message: 'Too many authentication attempts, please try again later'
  },
  skipSuccessfulRequests: true, // don't count successful requests
  standardHeaders: true,
  legacyHeaders: false,
});

// Limiter for submitting results (defense from spam)
export const scoreSubmitLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // maximum 5 results per minute
  message: {
    error: 'TooManyScoreSubmissions',
    message: 'You are submitting scores too quickly. Please wait a moment.'
  },
  keyGenerator: getUserKey, // Per-user limiting
});

// Limiter for creating game sessions
export const sessionLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // maximum 10 new sessions per minute
  message: {
    error: 'TooManySessions',
    message: 'Too many game sessions created. Please wait.'
  },
  keyGenerator: getUserKey, // Per-user limiting
});

// Limiter for the swap price-quote label route (POST /api/swap/quote): a read-only Jupiter lookup,
// not a chain write, so it gets its own generous bucket instead of sharing sessionLimiter's 10/min -
// otherwise a client still calling the route directly could exhaust the same budget purchases,
// revives and loadout saves depend on (final re-review, "New Breakage in the Fix Diff"). The Shop
// and the Tide no longer call this route at all - GET /api/shop and POST /api/revive/quote price
// their lists/quotes themselves - so this limiter is a safety margin for any caller that still does.
export const quoteLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // maximum 60 price quotes per minute
  message: {
    error: 'TooManyQuotes',
    message: 'Too many price quotes requested. Please wait.'
  },
  keyGenerator: getUserKey, // Per-user limiting
});

// Limiter for confirmation polls (read-only chain lookups; the mobile client polls every
// 2s for up to 60s, i.e. up to 30 requests per confirmation flow) — kept separate from
// sessionLimiter so a confirm poll never eats into the budget for creating new sessions.
export const confirmLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60, // maximum 60 confirmation polls per minute
  message: {
    error: 'TooManyConfirmations',
    message: 'Too many confirmation polls. Please wait.'
  },
  keyGenerator: getUserKey, // Per-user limiting
});

// Soft limiter for leaderboard (for tournaments with frequent updates)
export const leaderboardLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 200, // maximum 200 requests per minute with per-user limiting
  message: {
    error: 'TooManyLeaderboardRequests',
    message: 'Too many leaderboard requests. Please wait.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getUserKey, // Per-user limiting
});

export default {
  apiLimiter,
  authLimiter,
  scoreSubmitLimiter,
  sessionLimiter,
  quoteLimiter,
  confirmLimiter,
  leaderboardLimiter
};
