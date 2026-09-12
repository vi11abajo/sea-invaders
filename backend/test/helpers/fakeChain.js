// In-memory stand-in for `chain/readers.js` + `chain/txs.js`, driven by a mutable state object
// tests can seed directly. Both modules are mocked to this same file, so they share one state.
import { PublicKey } from '@solana/web3.js';

const FIXED_ENVELOPE = {
  transaction: 'ZmFrZS10cmFuc2FjdGlvbg==', // base64("fake-transaction")
  blockhash: 'FakeBlockhash1111111111111111111111111111',
  lastValidBlockHeight: 5678,
  minContextSlot: 1234,
};

function keyOf(value) {
  if (value == null) return value;
  if (typeof value === 'string') return value;
  if (value instanceof PublicKey) return value.toBase58();
  if (typeof value.toBase58 === 'function') return value.toBase58();
  return String(value);
}

function defaultConfig() {
  return {
    admin: 'Admin1111111111111111111111111111111111111',
    serverAuthority: 'ServerAuthority11111111111111111111111111',
    skrMint: 'SkrMint111111111111111111111111111111111111',
    treasury: 'Treasury111111111111111111111111111111111111',
    ticketPrice: 10_000_000n,
    attemptsPerTicket: 3,
    ticketPoolBps: 9500,
    purchasePoolBps: 9500,
    reviveLadder: [1_000_000n, 2_000_000n, 4_000_000n],
    ebbSeconds: 3600,
    graceSeconds: 900,
    payoutBps: [5000, 3000, 2000],
    paused: false,
  };
}

function defaultPlayer(wallet) {
  return {
    wallet: keyOf(wallet),
    week: 0,
    dayBests: [0, 0, 0, 0, 0, 0, 0],
    weekUpdatedAt: 0,
    ticketDay: 0,
    prevTicketDay: 0,
    attemptsBought: 0,
    tide: 0,
    tideAt: 0,
    inventory: 0n,
    seeker: false,
    lastReplayHash: new Array(32).fill(0),
  };
}

export const state = {
  config: defaultConfig(),
  players: new Map(),
  weekPools: new Map(),
  balances: new Map(),
  txs: new Map(),
};

/** Resets all fake chain state between tests. */
export function reset() {
  state.config = defaultConfig();
  state.players.clear();
  state.weekPools.clear();
  state.balances.clear();
  state.txs.clear();
}

/** Merges `patch` into the current config (or clears it with `null`). */
export function setConfig(patch) {
  state.config = patch === null ? null : { ...defaultConfig(), ...state.config, ...patch };
}

/** Sets (or replaces) a wallet's player account, merged over the default shape. */
export function setPlayer(wallet, patch) {
  const key = keyOf(wallet);
  state.players.set(key, { ...defaultPlayer(key), ...state.players.get(key), ...patch });
  return state.players.get(key);
}

/** Sets (or replaces) a week's pool account, merged over `{ week, vault, top: [], settled: false }`. */
export function setWeekPool(week, patch) {
  const current = state.weekPools.get(week) ?? { week, vault: `Vault${week}`, top: [], settled: false };
  state.weekPools.set(week, { ...current, ...patch });
  return state.weekPools.get(week);
}

/** Sets an owner's SKR token balance (base units). */
export function setBalance(owner, amount) {
  state.balances.set(keyOf(owner), BigInt(amount));
}

/** Sets what `getTransactionStatus(signature)` reports: `true` for confirmed, `false` for failed, unset for missing. */
export function setTxStatus(signature, ok) {
  state.txs.set(signature, { ok });
}

// ---- readers.js ----

export async function getConfig() {
  return state.config;
}

export async function getPlayer(wallet) {
  return state.players.get(keyOf(wallet)) ?? null;
}

export async function getWeekPool(week) {
  return state.weekPools.get(week) ?? null;
}

export async function getVaultBalance(week) {
  const pool = state.weekPools.get(week);
  if (!pool) return 0n;
  return state.balances.get(keyOf(pool.vault)) ?? 0n;
}

export async function getTokenBalance(owner) {
  return state.balances.get(keyOf(owner)) ?? 0n;
}

export async function getTransactionStatus(signature) {
  const tx = state.txs.get(signature);
  if (!tx) return 'missing';
  return tx.ok ? 'confirmed' : 'failed';
}

// ---- txs.js ----

export async function buildCreatePlayerTx() {
  return { ...FIXED_ENVELOPE };
}

export async function buildBuyTicketTx() {
  return { ...FIXED_ENVELOPE };
}

export async function buildTicketTx() {
  return { ...FIXED_ENVELOPE };
}

export async function buildSubmitDailyBestTx() {
  return { ...FIXED_ENVELOPE };
}

export async function buildCreateWeekPoolTx() {
  return { ...FIXED_ENVELOPE };
}

export async function buildSettleWeekTx() {
  return { ...FIXED_ENVELOPE };
}

export async function mintTestTokens(wallet, amount) {
  const key = keyOf(wallet);
  state.balances.set(key, (state.balances.get(key) ?? 0n) + BigInt(amount));
  return { signature: 'FakeMintSignature111111111111111111111111' };
}
