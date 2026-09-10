import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwt.js';

/**
 * Middleware for JWT token verification
 */
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Access token required'
    });
  }

  try {
    const decoded = jwt.verify(token, jwtConfig.secret, {
      algorithms: [jwtConfig.algorithm],
      issuer: jwtConfig.issuer,
      audience: jwtConfig.audience
    });

    // Add user data to request
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'TokenExpired',
        message: 'Access token expired'
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(403).json({
        error: 'InvalidToken',
        message: 'Invalid access token'
      });
    }

    return res.status(500).json({
      error: 'ServerError',
      message: 'Token verification failed'
    });
  }
}

/**
 * Optional authentication (doesn't throw error if token is missing)
 */
export function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, jwtConfig.secret);
    req.user = decoded;
  } catch (error) {
    req.user = null;
  }

  next();
}

export default authenticateToken;
