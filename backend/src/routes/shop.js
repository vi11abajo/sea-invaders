import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { confirmLimiter, sessionLimiter } from '../middleware/rateLimit.js';
import { getTokenBalance } from '../chain/readers.js';
import * as loadoutDb from '../db/loadout.js';
import { confirmPurchase, issuePurchase, ownedItemIds, readCatalog, readPlayerShop, ShopError } from '../services/shop.js';
import { SwapError, swapAvailable } from '../services/swap.js';

const router = express.Router();
const nowSeconds = () => Math.floor(Date.now() / 1000);

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const wallet = req.user.walletAddress;
    const [catalog, shop, balance] = await Promise.all([readCatalog(), readPlayerShop(wallet), getTokenBalance(wallet)]);
    await loadoutDb.upsertLoadout(wallet, { inventory: shop.inventory, tide: shop.tide, tideAt: shop.tideAt });

    const owned = new Set(ownedItemIds(shop.inventory));
    res.json({
      // An inactive item the wallet does not own is dropped (nothing to buy); an inactive item it
      // already owns stays listed, since owning it never goes away (owner decision, spec §3 omits `active`).
      items: catalog
        .filter((it) => it.active || owned.has(it.id))
        .map(({ id, kind, name, priceSkr }) => ({ id, kind, name, priceSkr, owned: owned.has(id) })),
      balanceSkr: Number(balance) / 1e6,
      swap: { available: swapAvailable() },
    });
  } catch (error) {
    next(error);
  }
});

router.post('/buy', authenticateToken, sessionLimiter, async (req, res, next) => {
  try {
    const item = Number.parseInt(req.body?.item, 10);
    if (!Number.isInteger(item) || item < 0) return res.status(400).json({ error: 'BadRequest', message: 'item is required' });
    // `swap: true` only offers the SOL -> SKR swap; the service still decides whether it is needed
    // (the balance is short) and possible (mainnet), and answers 409 not_enough_skr when it is not.
    const swap = req.body?.swap === true;
    res.status(201).json(await issuePurchase({ wallet: req.user.walletAddress, item, now: nowSeconds(), swap }));
  } catch (error) {
    next(error);
  }
});

router.post('/confirm', authenticateToken, confirmLimiter, async (req, res, next) => {
  try {
    const signature = typeof req.body?.signature === 'string' ? req.body.signature : '';
    const item = Number.parseInt(req.body?.item, 10);
    if (!signature || !Number.isInteger(item)) return res.status(400).json({ error: 'BadRequest', message: 'signature and item are required' });
    const result = await confirmPurchase({ wallet: req.user.walletAddress, signature, item });
    res.status(result.confirmed ? 200 : 202).json(result);
  } catch (error) {
    next(error);
  }
});

/** Maps ShopError (and a failing swap, which only `POST /buy` can raise) to its HTTP status; everything else falls through to the app's error handler. */
router.use((err, req, res, next) => {
  if (err instanceof ShopError) {
    return res.status(err.status).json({ error: 'Shop', code: err.code, message: err.message, ...err.extra });
  }
  if (err instanceof SwapError) {
    return res.status(err.status).json({ error: 'Swap', code: err.code, message: err.message });
  }
  next(err);
});

export default router;
