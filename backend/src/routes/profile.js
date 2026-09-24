// The player's off-chain loadout: which skin/variant is equipped. There is no
// on-chain instruction for equipping - a sold item's ownership is on-chain (`Player.inventory`), a
// boss award follows from the stored campaign progress and the Seeker look from the chain's Seeker
// link - but the active selection only ever lives here, mirrored
// into the mobile app's AsyncStorage.
import express from 'express';
import { SEEKER_SKIN_CODE, SKIN_COUNT, SKIN_ITEM_IDS, VARIANT_INDEX, VARIANT_ITEM_IDS, earnedAwards, isValidProgress } from '@sea-invaders/core';
import { authenticateToken } from '../middleware/auth.js';
import { sessionLimiter } from '../middleware/rateLimit.js';
import * as campaignDb from '../db/campaign.js';
import * as loadoutDb from '../db/loadout.js';
import { getCachedPlayer } from '../services/rankedRuns.js';
import { ownedItemIds, readPlayerShop } from '../services/shop.js';

const router = express.Router();

/** How many variant selectors exist: the base Octopi (0) and every champion (`VARIANT_INDEX` order). */
const VARIANT_COUNT = VARIANT_ITEM_IDS.length;

function isValidSelector(value, count) {
  return Number.isInteger(value) && value >= 0 && value < count;
}

/**
 * Why the wallet `state` describes may not wear skin `code`, or null when it may: a sold
 * look needs its catalogue item, the Seeker look a verified Seeker link, a boss look its level
 * cleared. Anything outside the table (a stray stored value) has no item it could own, so it is
 * refused too.
 */
function skinRefusal({ owned, earned, seekerSkin }, code) {
  if (code === 0) return null;
  const item = SKIN_ITEM_IDS[code];
  if (item !== null) return owned.includes(item) ? null : `Skin item ${item} is not owned`;
  if (code === SEEKER_SKIN_CODE) return seekerSkin ? null : 'Seeker skin needs a verified Seeker';
  return earned.skins.includes(code) ? null : `Skin ${code} is not earned`;
}

/** Why the wallet may not play champion `index` (`VARIANT_INDEX`), or null when it may: a sold one needs its item, Hex and Kakashi their boss cleared. */
function variantRefusal({ owned, earned }, index) {
  if (index === 0) return null;
  const item = VARIANT_ITEM_IDS[index];
  if (item !== null) return owned.includes(item) ? null : `Variant item ${item} is not owned`;
  return earned.variants.includes(index) ? null : `Variant ${index} is not earned`;
}

/**
 * The wallet's live shop inventory, what its stored campaign has earned (awards are derived, never
 * stored), whether it holds a verified Seeker link, and its stored selection. A stored
 * selector that is no longer allowed - a demo campaign reset un-earns a boss award - reads as 0,
 * as does the selection of a wallet that has never set one.
 */
async function currentState(userId, wallet) {
  const [shop, row, progress, player] = await Promise.all([
    readPlayerShop(wallet), loadoutDb.getLoadout(wallet), campaignDb.getProgress(userId), getCachedPlayer(wallet),
  ]);
  // `earnedAwards` grows a thirty-level record to sixty itself, so it earns only what its levels hold.
  // A stored row that fails `isValidProgress` (only reachable via a manual DB edit - every API write
  // validates first, `routes/campaign.js`) counts as no awards instead of throwing.
  const awards = progress && isValidProgress(progress) ? earnedAwards(progress) : { variants: [], skins: [] };
  const allowance = {
    owned: ownedItemIds(shop.inventory),
    earned: { variants: awards.variants.map((variant) => VARIANT_INDEX[variant]), skins: awards.skins },
    // Not the boards' read: the daily board reads the DB mirror (`findSeekerWallets`, `routes/daily.js`
    // -> `db/users.js`), the weekly board an uncached `getPlayer` (`services/records.js`). Only Home's
    // `todayInfo` (`services/rankedRuns.js`) shares this same chain-only, 5 s cached read.
    seekerSkin: Boolean(player?.seeker),
  };
  const storedSkin = row?.activeSkin ?? 0;
  const storedVariant = row?.activeVariant ?? 0;
  return {
    ...allowance,
    inventory: shop.inventory,
    activeSkin: skinRefusal(allowance, storedSkin) === null ? storedSkin : 0,
    activeVariant: variantRefusal(allowance, storedVariant) === null ? storedVariant : 0,
  };
}

/** The shape both `GET` and `PUT` answer with. */
function loadoutBody({ owned, activeSkin, activeVariant, earned, seekerSkin }) {
  return { owned, activeSkin, activeVariant, earned, seekerSkin };
}

router.get('/loadout', authenticateToken, async (req, res, next) => {
  try {
    res.json(loadoutBody(await currentState(req.user.userId, req.user.walletAddress)));
  } catch (error) {
    next(error);
  }
});

router.put('/loadout', authenticateToken, sessionLimiter, async (req, res, next) => {
  try {
    const wallet = req.user.walletAddress;
    const current = await currentState(req.user.userId, wallet);
    // Checked on the raw body value, not a coerced one: `Number(null)`, `Number('')`, `Number(true)`
    // and `Number([1])` are all valid-looking small integers (0, 0, 1, 1) that would otherwise slip
    // through as a real selector.
    const activeSkin = req.body?.activeSkin === undefined ? current.activeSkin : req.body.activeSkin;
    const activeVariant = req.body?.activeVariant === undefined ? current.activeVariant : req.body.activeVariant;

    if (!isValidSelector(activeSkin, SKIN_COUNT) || !isValidSelector(activeVariant, VARIANT_COUNT)) {
      return res.status(400).json({
        error: 'BadRequest',
        message: `activeSkin must be 0..${SKIN_COUNT - 1} and activeVariant must be 0..${VARIANT_COUNT - 1}`,
      });
    }

    // One check per kind, the skin first.
    const refusal = skinRefusal(current, activeSkin) ?? variantRefusal(current, activeVariant);
    if (refusal !== null) {
      return res.status(409).json({ error: 'Loadout', code: 'not_owned', message: refusal });
    }

    // `inventory` is deliberately omitted: it is only the shop's cache column, and writing back the
    // value read at the top of this request could roll back a fresher one a concurrent shop confirm
    // just wrote (`db/loadout.js`'s COALESCE keeps the stored value for any column a patch omits).
    await loadoutDb.upsertLoadout(wallet, { activeSkin, activeVariant });
    res.json(loadoutBody({ ...current, activeSkin, activeVariant }));
  } catch (error) {
    next(error);
  }
});

export default router;
