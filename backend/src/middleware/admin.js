import pool from '../config/database.js';

/**
 * Middleware for checking administrator rights
 * Requires prior authentication (authenticateToken)
 */
export const isAdmin = async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User ID not found in token',
      });
    }

    // Check in database
    const result = await pool.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: 'UserNotFound',
        message: 'User not found',
      });
    }

    if (!result.rows[0].is_admin) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Admin access required',
      });
    }

    // User is admin, continue
    next();
  } catch (error) {
    console.error('Error checking admin status:', error);
    res.status(500).json({
      error: 'ServerError',
      message: 'Failed to verify admin status',
    });
  }
};

/**
 * Middleware for optional admin check
 * Adds req.isAdmin flag, but doesn't block request
 */
export const checkAdmin = async (req, res, next) => {
  try {
    const userId = req.user?.userId || req.user?.id;

    if (!userId) {
      req.isAdmin = false;
      return next();
    }

    const result = await pool.query(
      'SELECT is_admin FROM users WHERE id = $1',
      [userId]
    );

    req.isAdmin = result.rows.length > 0 && result.rows[0].is_admin === true;
    next();
  } catch (error) {
    console.error('Error checking admin status:', error);
    req.isAdmin = false;
    next();
  }
};
