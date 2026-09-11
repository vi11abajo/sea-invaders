import express from 'express';
import jwt from 'jsonwebtoken';
import { jwtConfig } from '../config/jwt.js';
import { findOrCreateWalletUser } from '../db/users.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { issueNonce, signInPayload, verifySignIn } from '../services/siws.js';

const router = express.Router();

/** POST /api/auth/siws/nonce — the payload the app hands to the wallet. */
router.post('/nonce', authLimiter, (req, res) => {
  const { nonce, issuedAt } = issueNonce();
  res.json(signInPayload(nonce, issuedAt));
});

/** POST /api/auth/siws/verify — { address, signedMessage, signature } (base64) → JWT. */
router.post('/verify', authLimiter, async (req, res, next) => {
  try {
    const result = verifySignIn(req.body);
    if (!result.ok) {
      return res.status(401).json({ error: 'SignInRejected', reason: result.reason });
    }
    const user = await findOrCreateWalletUser(result.address);
    const token = jwt.sign(
      { userId: user.id, walletAddress: user.wallet_address, username: user.username },
      jwtConfig.secret,
      { algorithm: jwtConfig.algorithm, expiresIn: jwtConfig.expiresIn, issuer: jwtConfig.issuer, audience: jwtConfig.audience },
    );
    res.json({ token, user: { id: user.id, walletAddress: user.wallet_address, username: user.username } });
  } catch (error) {
    next(error);
  }
});

export default router;
