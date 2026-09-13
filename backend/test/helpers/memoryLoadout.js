/** In-memory stand-in for `db/loadout.js`. */
const rowsByWallet = new Map();

export function reset() {
  rowsByWallet.clear();
}

export async function getLoadout(wallet) {
  return rowsByWallet.get(wallet) ?? null;
}

const DEFAULTS = { inventory: 0n, tide: 0, tideAt: 0, activeSkin: 0, activeVariant: 0 };

export async function upsertLoadout(wallet, patch) {
  const current = rowsByWallet.get(wallet);
  const next = { walletAddress: wallet, ...DEFAULTS, ...current, ...patch };
  rowsByWallet.set(wallet, next);
  return next;
}
