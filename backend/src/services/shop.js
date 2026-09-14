// The shop catalogue (design doc §1) and item purchases: catalogue prices and item ownership
// always come from the chain (the `Catalog` PDA and `Player.inventory` bitmask) - this module only
// mirrors them for the API and builds/confirms the `purchase` transaction, the same way
// `services/records.js`/`services/tickets.js` do for tickets.
import { getCatalog, getConfig, getConfirmedInstructions, getPlayer, getTokenBalance } from '../chain/readers.js';
import { buildPurchaseTx } from '../chain/txs.js';
import { hasPurchase } from '../chain/verify.js';
import * as loadoutDb from '../db/loadout.js';
import { dayOf, weekOf } from './dailySeed.js';
import { planSwap } from './swap.js';

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

/** Item id -> display name (design doc §1). Everything else about an item - kind, price, whether it is active - comes from the chain. */
const ITEM_NAMES = { 0: 'Harpoon', 1: 'Anchor', 2: 'Trident', 3: 'Lime', 4: 'Lilac', 5: 'Ember', 6: 'Abyss' };

const CATALOG_TTL_MS = 60_000;
let catalogCache = null; // { value, expiresAt }

/**
 * The catalogue (the `Catalog` PDA), cached for 60s: `[{ id, kind, name, priceSkr, priceBaseUnits, active }]`.
 * `priceBaseUnits` (the exact on-chain `u64`) is for internal use only (`issuePurchase`'s `max_price`) -
 * routes must strip it before responding, since spec §3's `GET /api/shop` shape has no such field.
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
 * With `swap` (the app's `swap: true`) a short balance is paid in SOL instead, on mainnet only
 * (design doc §5 "Swap"): Jupiter swaps exactly the missing SKR inside the same transaction and the
 * envelope gains `swapped: true` and `inSol`. Everywhere else - no `swap`, a cluster with no
 * Jupiter, or a wallet that holds the price already - the behaviour is exactly what it was.
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
  return { ...envelope, createsPlayer, ...(plan === null ? {} : { swapped: true, inSol: plan.inSol }) };
}

/**
 * Confirms a submitted `purchase` transaction: verifies it actually invokes our program's
 * `purchase` instruction, for `item`, signed by `wallet` (global-constraints.md's Phase 3B
 * addition - every confirm endpoint verifies program id + instruction + payer) before refreshing
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
