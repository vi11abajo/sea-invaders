import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { quoteLimiter } from '../middleware/rateLimit.js';
import { quoteSwapPrice, SwapError, swapAvailable } from '../services/swap.js';

const router = express.Router();

// quoteLimiter, not sessionLimiter: this route is a read-only price label, and GET /api/shop /
// POST /api/revive/quote now price their own lists (services/shop.js's `withSolPrices`,
// services/tide.js's `quoteRevive`) rather than calling it, so it no longer belongs to the same
// budget as POST /api/shop/buy, /api/revive and PUT /api/profile/loadout (final re-review).
router.post('/quote', authenticateToken, quoteLimiter, async (req, res, next) => {
  try {
    if (!swapAvailable()) {
      return res.status(409).json({ error: 'Swap', code: 'swap_unavailable', message: 'Swap is not available on this cluster' });
    }

    const outSkr = Number(req.body?.outSkr);
    if (!Number.isFinite(outSkr) || outSkr <= 0) return res.status(400).json({ error: 'BadRequest', message: 'outSkr must be a positive number' });

    // Label-only: this is the Shop/Tide "≈ X SOL" price, not a payment - it never touches
    // Jupiter's /swap-instructions, and distinct prices are cached (services/swap.js) so a Shop
    // open asking for several items' prices costs at most one Jupiter call per distinct price.
    res.json(await quoteSwapPrice({ outSkr }));
  } catch (error) {
    if (error instanceof SwapError) return res.status(error.status).json({ error: 'Swap', code: error.code, message: error.message });
    next(error);
  }
});

export default router;
