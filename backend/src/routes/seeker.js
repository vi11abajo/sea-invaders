import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { confirmLimiter, sessionLimiter } from '../middleware/rateLimit.js';
import { confirmSeekerLink, issueSeekerLink, readSeeker, SeekerError } from '../services/seeker.js';

const router = express.Router();

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    res.json(await readSeeker(req.user.walletAddress));
  } catch (error) {
    next(error);
  }
});

router.post('/link', authenticateToken, sessionLimiter, async (req, res, next) => {
  try {
    res.status(201).json(await issueSeekerLink({ wallet: req.user.walletAddress }));
  } catch (error) {
    next(error);
  }
});

router.post('/confirm', authenticateToken, confirmLimiter, async (req, res, next) => {
  try {
    const signature = typeof req.body?.signature === 'string' ? req.body.signature : '';
    if (!signature) return res.status(400).json({ error: 'BadRequest', message: 'signature is required' });
    const result = await confirmSeekerLink({ wallet: req.user.walletAddress, signature });
    res.status(result.linked ? 200 : 202).json(result);
  } catch (error) {
    next(error);
  }
});

/** Maps SeekerError to its HTTP status; everything else falls through to the app's error handler. */
router.use((err, req, res, next) => {
  if (err instanceof SeekerError) {
    return res.status(err.status).json({ error: 'Seeker', code: err.code, message: err.message });
  }
  next(err);
});

export default router;
