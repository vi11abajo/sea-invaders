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
  leaderboardLimiter
};
