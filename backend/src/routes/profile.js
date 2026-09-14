// The player's off-chain loadout (design doc §3/§5): which owned skin/variant is equipped. There
// is no on-chain instruction for equipping - ownership itself is on-chain (`Player.inventory`),
// but the active selection only ever lives here, mirrored into the mobile app's AsyncStorage.
import express from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { sessionLimiter } from '../middleware/rateLimit.js';
import * as loadoutDb from '../db/loadout.js';
import { ownedItemIds, readPlayerShop } from '../services/shop.js';

const router = express.Router();

/** `activeSkin` 1..4 maps to catalog item ids 3..6 (design doc §3); 0 = base/no skin. */
function skinItemId(activeSkin) {
  return activeSkin > 0 ? activeSkin + 2 : null;
}

/** `activeVariant` 1..3 maps to catalog item ids 0..2 (design doc §3); 0 = base Octopi. */
function variantItemId(activeVariant) {
  return activeVariant > 0 ? activeVariant - 1 : null;
}

function isValidSelector(value, max) {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

/** The wallet's current shop inventory plus its stored loadout selection (0/0 for a wallet that has never set one). */
async function currentState(wallet) {
  const [shop, row] = await Promise.all([readPlayerShop(wallet), loadoutDb.getLoadout(wallet)]);
  return { inventory: shop.inventory, owned: ownedItemIds(shop.inventory), activeSkin: row?.activeSkin ?? 0, activeVariant: row?.activeVariant ?? 0 };
}

router.get('/loadout', authenticateToken, async (req, res, next) => {
  try {
    const { owned, activeSkin, activeVariant } = await currentState(req.user.walletAddress);
    res.json({ owned, activeSkin, activeVariant });
  } catch (error) {
    next(error);
  }
});

router.put('/loadout', authenticateToken, sessionLimiter, async (req, res, next) => {
  try {
    const wallet = req.user.walletAddress;
    const current = await currentState(wallet);
    // Checked on the raw body value, not a coerced one: `Number(null)`, `Number('')`, `Number(true)`
    // and `Number([1])` are all valid-looking small integers (0, 0, 1, 1) that would otherwise slip
    // through as a real selector.
    const activeSkin = req.body?.activeSkin === undefined ? current.activeSkin : req.body.activeSkin;
    const activeVariant = req.body?.activeVariant === undefined ? current.activeVariant : req.body.activeVariant;

    if (!isValidSelector(activeSkin, 4) || !isValidSelector(activeVariant, 3)) {
      return res.status(400).json({ error: 'BadRequest', message: 'activeSkin must be 0..4 and activeVariant must be 0..3' });
    }

    const owned = new Set(current.owned);
    const skinItem = skinItemId(activeSkin);
    if (skinItem !== null && !owned.has(skinItem)) {
      return res.status(409).json({ error: 'Loadout', code: 'not_owned', message: `Skin item ${skinItem} is not owned` });
    }
    const variantItem = variantItemId(activeVariant);
    if (variantItem !== null && !owned.has(variantItem)) {
      return res.status(409).json({ error: 'Loadout', code: 'not_owned', message: `Variant item ${variantItem} is not owned` });
    }

    await loadoutDb.upsertLoadout(wallet, { inventory: current.inventory, activeSkin, activeVariant });
    res.json({ owned: current.owned, activeSkin, activeVariant });
  } catch (error) {
    next(error);
  }
});

export default router;
