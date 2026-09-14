// The Tide (design doc §1/§2, `revive`): a rising/ebbing SKR price for continuing mid-level after
// the last life is lost. `effectiveTide` mirrors `programs/.../instructions/ticket.rs::effective_tide`
// exactly (same test cases, ported), so the quote a player sees is the price the program will
// actually charge at the same clock - `revive_ladder` and `tide`/`tide_at` always come from the
// chain, never hardcoded here.
import { getConfig, getConfirmedInstructions, getPlayer, getTokenBalance } from '../chain/readers.js';
import { buildReviveTx } from '../chain/txs.js';
import { hasRevive } from '../chain/verify.js';
import * as loadoutDb from '../db/loadout.js';
import { dayOf, weekOf } from './dailySeed.js';
import { ShopError } from './shop.js';
import { planSwap, swapAvailable, swapEnvelope } from './swap.js';

/**
 * The tide step actually in effect `now`, after ebbing back from `tide` by one step per full
 * `ebbSeconds` since `tideAt` - `tideAt === 0` (never revived) always yields 0 elapsed steps.
 * Integer arithmetic only, truncating toward zero exactly like the program's `i64` division.
 */
export function effectiveTide(tide, tideAt, now, ebbSeconds) {
  const elapsedRaw = tideAt === 0 ? 0 : Math.trunc((now - tideAt) / ebbSeconds);
  const elapsed = Math.max(0, Math.min(tide, elapsedRaw));
  return tide - elapsed;
}

/** `{ tide, effective, priceSkr, nextStep: { priceSkr, inSeconds } | null }` for `player` (`null` = no `Player` PDA yet) against `config`, at `now`. Shared by `quoteRevive` and `issueRevive` so both read the chain exactly once. */
function quoteFromPlayer(player, config, now) {
  const tide = player ? player.tide : 0;
  const tideAt = player ? player.tideAt : 0;
  const ladder = config.reviveLadder;
  const ebbSeconds = config.ebbSeconds;

  const effective = effectiveTide(tide, tideAt, now, ebbSeconds);
  const priceSkr = Number(ladder[effective]) / 1e6;

  // `tide - effective` is the elapsed-steps count `effectiveTide` actually applied (already clamped
  // to `[0, tide]`), so the next boundary is exactly one more full `ebbSeconds` after `tideAt`. Only
  // meaningful once a revive has actually happened (`tideAt !== 0`) - `tide > 0, tideAt === 0` cannot
  // occur on chain (a revive always stamps `tide_at = now`), but a quote for it must still say the
  // price never ebbs, not report a boundary computed from a `tideAt` of 0.
  let nextStep = null;
  if (effective > 0 && tideAt !== 0) {
    const elapsedSteps = tide - effective;
    const boundary = tideAt + (elapsedSteps + 1) * ebbSeconds;
    nextStep = { priceSkr: Number(ladder[effective - 1]) / 1e6, inSeconds: boundary - now };
  }

  // The whole ladder in SKR, so the app can show its range (design: `Price ladder 25 -> 120 SKR`) without hardcoding prices.
  const ladderSkr = ladder.map((v) => Number(v) / 1e6);

  return { tide, effective, priceSkr, nextStep, ladderSkr };
}

/**
 * The revive price for `wallet` at `now`, plus what the Tide sheet needs to decide how to offer it:
 * `balanceSkr` (the wallet's SKR, read from the chain like the Shop's own balance) and
 * `swap: { available }`, the same gate `GET /api/shop` reports. Together they are what turns the
 * primary into `Revive · ≈ X SOL` (design doc §5 "Swap") instead of the SKR price - on devnet the
 * gate is false and nothing about the sheet changes.
 */
export async function quoteRevive({ wallet, now }) {
  const [player, config, balance] = await Promise.all([getPlayer(wallet), getConfig(), getTokenBalance(wallet)]);
  return { ...quoteFromPlayer(player, config, now), balanceSkr: Number(balance) / 1e6, swap: { available: swapAvailable() } };
}

/**
 * Builds the unsigned `revive` transaction at the currently quoted price - `create_player` first
 * when the wallet has no `Player` PDA yet (`revive` reuses `buy_ticket`'s accounts, which require
 * one; see `issueTicket` in `services/records.js`). Throws `not_enough_skr` (with `needSkr`/`haveSkr`)
 * if the wallet's SKR balance is short.
 *
 * With `swap` (the app's `swap: true`) that short balance is paid in SOL instead, on mainnet only:
 * Jupiter swaps exactly the missing SKR inside the same transaction and the envelope gains
 * `swapped`/`swappedSkr`/`inSol`/`maxInLamports` (`swapEnvelope`) - the Shop's `issuePurchase` does
 * the identical thing for an item.
 */
export async function issueRevive({ wallet, now, swap = false }) {
  const [player, balance, config] = await Promise.all([getPlayer(wallet), getTokenBalance(wallet), getConfig()]);
  const quote = quoteFromPlayer(player, config, now);
  const priceBaseUnits = config.reviveLadder[quote.effective];
  let plan = null;
  if (balance < priceBaseUnits) {
    plan = await planSwap({ requested: swap, wallet, price: priceBaseUnits, balance });
    if (plan === null) throw new ShopError('not_enough_skr', 'Not enough SKR to revive', { needSkr: quote.priceSkr, haveSkr: Number(balance) / 1e6 });
  }

  const week = weekOf(dayOf(now));
  const createsPlayer = !player;
  const envelope = await buildReviveTx(wallet, { week, treasury: config.treasury, createPlayer: createsPlayer, swap: plan });
  return { ...envelope, priceSkr: quote.priceSkr, createsPlayer, ...swapEnvelope(plan) };
}

/**
 * Confirms a submitted `revive` transaction: verifies it actually invokes our program's `revive`
 * instruction, signed by `wallet` (global-constraints.md's Phase 3B addition), before refreshing
 * the loadout cache. Re-callable while the transaction is not yet visible (`confirmed: false`).
 */
export async function confirmRevive({ wallet, signature }) {
  const parsed = await getConfirmedInstructions(signature);
  if (parsed.status === 'missing') return { confirmed: false };
  if (parsed.status === 'failed') throw new ShopError('revive_failed', 'The revive transaction failed on chain');
  if (!hasRevive(parsed.instructions, { wallet })) {
    throw new ShopError('invalid_transaction', 'Transaction does not match the revive request');
  }

  const player = await getPlayer(wallet);
  const tide = player ? player.tide : 0;
  const tideAt = player ? player.tideAt : 0;
  await loadoutDb.upsertLoadout(wallet, { tide, tideAt, inventory: player ? player.inventory : 0n });
  return { confirmed: true, ok: true, tide, tideAt };
}
