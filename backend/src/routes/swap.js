import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { quoteSwap, SwapError, swapAvailable } from '../services/swap.js';

const router = express.Router();

router.post('/quote', authenticateToken, async (req, res, next) => {
  try {
    if (!swapAvailable()) {
      return res.status(409).json({ error: 'Swap', code: 'swap_unavailable', message: 'Swap is not available on this cluster' });
    }

    const outSkr = Number(req.body?.outSkr);
    if (!Number.isFinite(outSkr) || outSkr <= 0) return res.status(400).json({ error: 'BadRequest', message: 'outSkr must be a positive number' });

    res.json(await quoteSwap({ outSkr, wallet: req.user.walletAddress }));
  } catch (error) {
    if (error instanceof SwapError) return res.status(error.status).json({ error: 'Swap', code: error.code, message: error.message });
    next(error);
  }
});

export default router;
