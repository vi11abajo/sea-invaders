import express from 'express';
import jwt from 'jsonwebtoken';
import pool from '../config/database.js';
import { exchangeCodeForToken, getUserData, getAuthorizationUrl } from '../services/discordService.js';
import { upsertUser } from '../services/userService.js';
import { jwtConfig } from '../config/jwt.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

/**
 * GET /api/auth/discord
 * Redirect to Discord OAuth
 */
router.get('/discord', authLimiter, (req, res) => {
  // Get returnURL and origin from query parameters
  const returnUrl = req.query.returnUrl || '/';
  const origin = req.query.origin;

  console.log('🔐 Discord OAuth request:', { returnUrl, origin });

  // Save returnURL and redirectUri in state
  const redirectUri = origin ? `${origin}/api/auth/discord/callback` : null;
  const state = JSON.stringify({ returnUrl, origin, redirectUri });

  // Pass state and origin to Discord OAuth
  const authUrl = getAuthorizationUrl(state, origin);
  console.log('🔗 Generated auth URL:', authUrl);
  res.redirect(authUrl);
});

/**
 * GET /api/auth/discord/callback
 * Callback from Discord after authorization
 */
router.get('/discord/callback', authLimiter, async (req, res) => {
  const { code, error, state } = req.query;

  // Parse state to get returnURL, origin and redirectUri
  let returnUrl = '/';
  let frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  let redirectUri = null;

  if (state) {
    try {
      const stateData = JSON.parse(state);
      returnUrl = stateData.returnUrl || '/';
      redirectUri = stateData.redirectUri;
      // Use origin from state, if it was passed
      if (stateData.origin) {
        frontendUrl = stateData.origin;
        console.log('✅ Using origin from state:', frontendUrl);
      }
    } catch (e) {
      // If state is not JSON, use it as returnURL (backward compatibility)
      console.warn('⚠️ State is not JSON, using as returnUrl:', state);
      returnUrl = state;
    }
  }

  console.log('🔐 Discord callback:', { frontendUrl, returnUrl, redirectUri });

  // If user declined authorization
  if (error) {
    return res.redirect(`${frontendUrl}${returnUrl}?error=${error}`);
  }

  if (!code) {
    return res.redirect(`${frontendUrl}${returnUrl}?error=no_code`);
  }

  try {
    // Step 1: Exchange code for access_token (pass redirectUri)
    const tokenData = await exchangeCodeForToken(code, redirectUri);
    const { access_token } = tokenData;

    // Step 2: Get user data
    const discordUser = await getUserData(access_token);

    // Step 3: Save/Update user in DB
    const user = await upsertUser(discordUser);

    // Step 4: Create JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        discordId: user.discord_id,
        username: user.username,
      },
      jwtConfig.secret,
      {
        expiresIn: jwtConfig.expiresIn,
        algorithm: jwtConfig.algorithm,
        issuer: jwtConfig.issuer,
        audience: jwtConfig.audience,
      }
    );

    // Step 5: Redirect back to original page with token
    const redirectUrl = `${frontendUrl}${returnUrl}?token=${encodeURIComponent(token)}`;
    console.log('✅ Redirecting to:', redirectUrl);
    res.redirect(redirectUrl);
  } catch (error) {
    console.error('Discord OAuth callback error:', error);
    res.redirect(`${frontendUrl}${returnUrl}?error=server_error`);
  }
});

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
      'SELECT id, discord_id, username, avatar, created_at FROM users WHERE id = $1',
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
