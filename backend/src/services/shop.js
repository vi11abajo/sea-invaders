// The shop catalogue and item purchases: catalogue prices and item ownership
// always come from the chain (the `Catalog` PDA and `Player.inventory` bitmask) - this module only
// mirrors them for the API and builds/confirms the `purchase` transaction, the same way
// `services/records.js`/`services/tickets.js` do for tickets.
import { ITEM_NAMES } from '@sea-invaders/core';
import { getCatalog, getConfig, getConfirmedInstructions, getPlayer, getTokenBalance } from '../chain/readers.js';
import { buildPurchaseTx } from '../chain/txs.js';
import { hasPurchase } from '../chain/verify.js';
import * as loadoutDb from '../db/loadout.js';
import { dayOf, weekOf } from './dailySeed.js';
import { planSwap, quoteSwapPrice, swapAvailable, swapEnvelope } from './swap.js';

const STATUS = {
  unknown_item: 404, item_inactive: 409, already_owned: 409, not_enough_skr: 409,
  purchase_failed: 409, revive_failed: 409, invalid_transaction: 400,
};

export class ShopError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'ShopError';
    this.code = code;
    this.status = STATUS[code];
    this.extra = extra;
  }
}

const CATALOG_TTL_MS = 60_000;
let catalogCache = null; // { value, expiresAt }

/**
 * The catalogue (the `Catalog` PDA), cached for 60s: `[{ id, kind, name, priceSkr, priceBaseUnits, active }]`.
 * `priceBaseUnits` (the exact on-chain `u64`) is for internal use only (`issuePurchase`'s `max_price`) -
 * routes must strip it before responding, since the `GET /api/shop` response has no such field.
 * Only the name is not the chain's: it comes from the catalogue shared with the app (`ITEM_NAMES`,
 * core/src/catalogue.ts); no price lives in code.
 */
export async function readCatalog() {
  if (catalogCache && catalogCache.expiresAt > Date.now()) return catalogCache.value;
  const catalog = await getCatalog();
  const items = (catalog?.items ?? []).map((item) => ({
    id: item.id,
    kind: item.kind === 0 ? 'variant' : 'skin',
    name: ITEM_NAMES[item.id] ?? `Item ${item.id}`,
    priceSkr: Number(item.price) / 1e6,
    priceBaseUnits: item.price,
    active: item.active,
  }));
  catalogCache = { value: items, expiresAt: Date.now() + CATALOG_TTL_MS };
  return items;
}

/** Clears the cached catalogue (tests only - the on-chain catalogue itself changes rarely, via `set_catalog`). */
export function clearCatalogCache() {
  catalogCache = null;
}

/**
 * `items` with `priceSol`/`maxInLamports` attached from the cached `quoteSwapPrice` (`services/swap.js`) -
 * the Shop's `≈ X SOL` labels, priced with the list itself rather than one `POST /api/swap/quote`
 * per item (final re-review, "New Breakage in the Fix Diff"). Both fields are `null` for every item
 * when the cluster has no Jupiter to quote against (`swapAvailable()` false, e.g. devnet), and `null`
 * for any one item whose quote failed - a failed quote must never fail the Shop list itself.
 *
 * `quoteSwapPrice` already caches and de-dupes by exact price, so items sharing a catalogue price
 * (`quoteSwapPrice`'s in-flight promise is installed synchronously, before this function's first
 * `await`) cost exactly one Jupiter call between them, not one per item.
 */
export async function withSolPrices(items) {
  if (!swapAvailable()) return items.map((item) => ({ ...item, priceSol: null, maxInLamports: null }));
  const quotes = await Promise.all(items.map((item) => quoteSwapPrice({ outSkr: item.priceSkr }).catch(() => null)));
  return items.map((item, i) => ({ ...item, priceSol: quotes[i]?.inSol ?? null, maxInLamports: quotes[i]?.maxInLamports ?? null }));
}

/** A wallet's on-chain shop state, `{ inventory, tide, tideAt }` - zeros for a wallet with no `Player` account yet. */
export async function readPlayerShop(wallet) {
  const player = await getPlayer(wallet);
  if (!player) return { inventory: 0n, tide: 0, tideAt: 0 };
  return { inventory: player.inventory, tide: player.tide, tideAt: player.tideAt };
}

/** The item ids set in `inventory`'s bitmask, ascending (catalog ids stay under `MAX_CATALOG_ITEMS`'s 64-bit budget). */
export function ownedItemIds(inventory) {
  const owned = [];
  for (let id = 0; id < 64; id++) {
    if ((inventory & (1n << BigInt(id))) !== 0n) owned.push(id);
  }
  return owned;
}

/** Finds an active catalog entry by id, or throws `unknown_item`/`item_inactive`. */
async function activeCatalogEntry(itemId) {
  const catalog = await readCatalog();
  const entry = catalog.find((it) => it.id === itemId);
  if (!entry) throw new ShopError('unknown_item', 'Unknown catalog item');
  if (!entry.active) throw new ShopError('item_inactive', 'Item is not active');
  return entry;
}

/**
 * Builds the unsigned `purchase` transaction for `item`, at the price currently on the chain -
 * `create_player` first when the wallet has no `Player` PDA yet (`purchase` requires one, exactly
 * like `buy_ticket`; see `issueTicket` in `services/records.js`). Throws `already_owned` if the
 * wallet already owns it, or `not_enough_skr` (with `needSkr`/`haveSkr`) if its SKR balance is short.
 *
 * The envelope also carries `priceSkr` – the catalogue price this transaction was actually built
 * at – so the signing sheet (`usePurchase`’s `withPrepared`) can correct a stale price fetched
 * before an admin re-price landed, exactly as `issueRevive` already does.
 *
 * With `swap` (the app's `swap: true`) a short balance is paid in SOL instead, on mainnet only:
 * Jupiter swaps exactly the missing SKR inside the same transaction and the
 * envelope gains `swapped`/`swappedSkr`/`inSol`/`maxInLamports` (see `swapEnvelope`). Everywhere
 * else - no `swap`, a cluster with no Jupiter, or a wallet that holds the price already - the
 * behaviour is exactly what it was.
 */
export async function issuePurchase({ wallet, item, now, swap = false }) {
  const itemId = Number(item);
  const [entry, player, balance, config] = await Promise.all([
    activeCatalogEntry(itemId), getPlayer(wallet), getTokenBalance(wallet), getConfig(),
  ]);

  const inventory = player ? player.inventory : 0n;
  if (ownedItemIds(inventory).includes(itemId)) throw new ShopError('already_owned', 'Item already owned');

  let plan = null;
  if (balance < entry.priceBaseUnits) {
    plan = await planSwap({ requested: swap, wallet, price: entry.priceBaseUnits, balance });
    if (plan === null) throw new ShopError('not_enough_skr', 'Not enough SKR to buy this item', { needSkr: entry.priceSkr, haveSkr: Number(balance) / 1e6 });
  }

  const week = weekOf(dayOf(now));
  const createsPlayer = !player;
  const envelope = await buildPurchaseTx(wallet, { itemId, maxPrice: entry.priceBaseUnits, week, treasury: config?.treasury, createPlayer: createsPlayer, swap: plan });
  return { ...envelope, priceSkr: entry.priceSkr, createsPlayer, ...swapEnvelope(plan) };
}

/**
 * Confirms a submitted `purchase` transaction: verifies it actually invokes our program's
 * `purchase` instruction, for `item`, signed by `wallet` (every confirm endpoint verifies program
 * id + instruction + payer) before refreshing
 * the loadout cache. Re-callable while the transaction is not yet visible (`confirmed: false`).
 */
export async function confirmPurchase({ wallet, signature, item }) {
  const parsed = await getConfirmedInstructions(signature);
  if (parsed.status === 'missing') return { confirmed: false };
  if (parsed.status === 'failed') throw new ShopError('purchase_failed', 'The purchase transaction failed on chain');
  if (!hasPurchase(parsed.instructions, { wallet, itemId: Number(item) })) {
    throw new ShopError('invalid_transaction', 'Transaction does not match the requested purchase');
  }

  const player = await getPlayer(wallet);
  const inventory = player ? player.inventory : 0n;
  await loadoutDb.upsertLoadout(wallet, { inventory, tide: player?.tide ?? 0, tideAt: player?.tideAt ?? 0 });
  return { confirmed: true, owned: ownedItemIds(inventory) };
}
