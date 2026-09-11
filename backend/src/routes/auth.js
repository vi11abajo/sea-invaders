import express from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import { jwtConfig } from '../config/jwt.js';

const router = express.Router();

/**
 * GET /api/auth/me
 * Get current user information
 */
router.get('/me', async (req, res) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'No token provided',
    });
  }

  try {
    const decoded = jwt.verify(token, jwtConfig.secret);

    // Get current data from DB
    const userResult = await pool.query(
      'SELECT id, username, wallet_address, created_at FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        error: 'UserNotFound',
        message: 'User not found',
      });
    }

    res.json({
      user: userResult.rows[0],
    });
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'TokenExpired',
        message: 'Token has expired',
      });
    }

    return res.status(403).json({
      error: 'InvalidToken',
      message: 'Invalid token',
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout (client needs to delete token from localStorage)
 */
router.post('/logout', (req, res) => {
  // In stateless JWT just send success
  // Client should delete token from localStorage
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

export default router;
