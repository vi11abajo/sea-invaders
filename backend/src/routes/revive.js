import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { confirmLimiter, sessionLimiter } from '../middleware/rateLimit.js';
import { ShopError } from '../services/shop.js';
import { SwapError } from '../services/swap.js';
import { confirmRevive, issueRevive, quoteRevive } from '../services/tide.js';

const router = express.Router();
const nowSeconds = () => Math.floor(Date.now() / 1000);

router.post('/quote', authenticateToken, sessionLimiter, async (req, res, next) => {
  try {
    res.json(await quoteRevive({ wallet: req.user.walletAddress, now: nowSeconds() }));
  } catch (error) {
    next(error);
  }
});

router.post('/', authenticateToken, sessionLimiter, async (req, res, next) => {
  try {
    // `swap: true` only offers the SOL -> SKR swap; the service still decides whether it is needed
    // (the balance is short) and possible (mainnet), and answers 409 not_enough_skr when it is not.
    const swap = req.body?.swap === true;
    res.status(201).json(await issueRevive({ wallet: req.user.walletAddress, now: nowSeconds(), swap }));
  } catch (error) {
    next(error);
  }
});

router.post('/confirm', authenticateToken, confirmLimiter, async (req, res, next) => {
  try {
    const signature = typeof req.body?.signature === 'string' ? req.body.signature : '';
    if (!signature) return res.status(400).json({ error: 'BadRequest', message: 'signature is required' });
    const result = await confirmRevive({ wallet: req.user.walletAddress, signature });
    res.status(result.confirmed ? 200 : 202).json(result);
  } catch (error) {
    next(error);
  }
});

/** Maps ShopError (and a failing swap, which only `POST /` can raise) to its HTTP status; everything else falls through to the app's error handler. */
router.use((err, req, res, next) => {
  if (err instanceof ShopError) {
    return res.status(err.status).json({ error: 'Tide', code: err.code, message: err.message, ...err.extra });
  }
  if (err instanceof SwapError) {
    return res.status(err.status).json({ error: 'Swap', code: err.code, message: err.message });
  }
  next(err);
});

export default router;
