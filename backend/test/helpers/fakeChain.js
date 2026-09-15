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

/**
 * The seven catalog items of design doc §1, all active, in the raw shape `chain/readers.js#getCatalog`
 * returns (`kind` 0 = variant, 1 = skin; `price` in base units) - a reasonable default so most tests
 * need not build their own catalog.
 */
function defaultCatalog() {
  return [
    { id: 0, kind: 0, price: 40_000_000n, active: true }, // Harpoon
    { id: 1, kind: 0, price: 60_000_000n, active: true }, // Anchor
    { id: 2, kind: 0, price: 90_000_000n, active: true }, // Trident
    { id: 3, kind: 1, price: 25_000_000n, active: true }, // Lime
    { id: 4, kind: 1, price: 25_000_000n, active: true }, // Lilac
    { id: 5, kind: 1, price: 35_000_000n, active: true }, // Ember
    { id: 6, kind: 1, price: 50_000_000n, active: true }, // Abyss
  ];
}

export const state = {
  config: defaultConfig(),
  players: new Map(),
  weekPools: new Map(),
  balances: new Map(),
  txs: new Map(),
  confirmedTxs: new Map(),
  catalog: defaultCatalog(),
  seekerLinks: new Map(),
  calls: { createWeekPool: [], settleWeek: [], getWeekPool: [], buildPurchaseTx: [], buildReviveTx: [], buildLinkSeekerTx: [] },
  sentTxs: [],
  sendSignedError: null,
  solBalance: 1_000_000_000n, // 1 SOL - plenty, so the faucet's balance check passes by default
  mintTestTokensError: null,
};

/** Resets all fake chain state between tests. */
export function reset() {
  state.config = defaultConfig();
  state.players.clear();
  state.weekPools.clear();
  state.balances.clear();
  state.txs.clear();
  state.confirmedTxs.clear();
  state.catalog = defaultCatalog();
  state.seekerLinks.clear();
  state.calls = { createWeekPool: [], settleWeek: [], getWeekPool: [], buildPurchaseTx: [], buildReviveTx: [], buildLinkSeekerTx: [] };
  state.sentTxs = [];
  state.sendSignedError = null;
  state.solBalance = 1_000_000_000n;
  state.mintTestTokensError = null;
}

/** Merges `patch` into the current config (or clears it with `null`). */
export function setConfig(patch) {
  state.config = patch === null ? null : { ...defaultConfig(), ...state.config, ...patch };
}

/** Replaces the fake catalog (or clears it with `null`, as if `init_catalog` never ran). */
export function setCatalog(items) {
  state.catalog = items;
}

/** Sets what `getConfirmedInstructions(signature)` reports: `{ status: 'confirmed', instructions }`, `{ status: 'failed' }`, or unset for `{ status: 'missing' }`. */
export function setConfirmedTx(signature, value) {
  state.confirmedTxs.set(signature, value);
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

/** Links an SGT mint on chain, as `link_seeker` would: `getSeekerLink(mint)` then reports `player`. */
export function setSeekerLink(sgtMint, player) {
  const mint = keyOf(sgtMint);
  state.seekerLinks.set(mint, { sgtMint: mint, player: keyOf(player), linkedAt: 1_700_000_000, bump: 254 });
  return state.seekerLinks.get(mint);
}

/** Sets an owner's SKR token balance (base units). */
export function setBalance(owner, amount) {
  state.balances.set(keyOf(owner), BigInt(amount));
}

/** Sets what `getTransactionStatus(signature)` reports: `true` for confirmed, `false` for failed, unset for missing. */
export function setTxStatus(signature, ok) {
  state.txs.set(signature, { ok });
}

/** Makes the next `sendSigned` call(s) throw `error` instead of "sending" the transaction. */
export function setSendSignedError(error) {
  state.sendSignedError = error;
}

/** Sets what `getSolBalance` reports for any pubkey (lamports). */
export function setSolBalance(lamports) {
  state.solBalance = BigInt(lamports);
}

/** Makes the next `mintTestTokens` call throw `error` instead of "minting". */
export function setMintTestTokensError(error) {
  state.mintTestTokensError = error;
}

// ---- readers.js ----

export async function getConfig() {
  return state.config;
}

export async function getPlayer(wallet) {
  return state.players.get(keyOf(wallet)) ?? null;
}

export async function getWeekPool(week) {
  state.calls.getWeekPool.push(week);
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

export async function getCatalog() {
  if (!state.catalog) return null;
  return { admin: 'Admin1111111111111111111111111111111111111', items: state.catalog, count: state.catalog.length, bump: 255 };
}

export async function getConfirmedInstructions(signature) {
  return state.confirmedTxs.get(signature) ?? { status: 'missing' };
}

export async function getSeekerLink(sgtMint) {
  return state.seekerLinks.get(keyOf(sgtMint)) ?? null;
}

export async function getSolBalance() {
  return state.solBalance;
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

export async function buildPurchaseTx(wallet, args) {
  state.calls.buildPurchaseTx.push({ wallet: keyOf(wallet), ...args, treasury: args?.treasury ? keyOf(args.treasury) : args?.treasury });
  return { ...FIXED_ENVELOPE };
}

export async function buildReviveTx(wallet, args) {
  state.calls.buildReviveTx.push({ wallet: keyOf(wallet), ...args, treasury: args?.treasury ? keyOf(args.treasury) : args?.treasury });
  return { ...FIXED_ENVELOPE };
}

export async function buildSubmitDailyBestTx() {
  return { ...FIXED_ENVELOPE };
}

export async function buildLinkSeekerTx(wallet, args) {
  state.calls.buildLinkSeekerTx.push({ wallet: keyOf(wallet), ...args, sgtMint: keyOf(args?.sgtMint) });
  return { ...FIXED_ENVELOPE };
}

export async function buildCreateWeekPoolTx(week) {
  state.calls.createWeekPool.push(week);
  return { ...FIXED_ENVELOPE };
}

export async function buildSettleWeekTx(week, winners) {
  state.calls.settleWeek.push({ week, winners: winners.map(keyOf) });
  return { ...FIXED_ENVELOPE };
}

/** Fake stand-in for `chain/txs.js`'s `sendSigned`: records the envelope it "sent" and returns a fake signature. */
export async function sendSigned(prepared) {
  if (state.sendSignedError) throw state.sendSignedError;
  state.sentTxs.push(prepared);
  return `FakeSendSignature${state.sentTxs.length}`;
}

export async function mintTestTokens(wallet, amount) {
  if (state.mintTestTokensError) throw state.mintTestTokensError;
  const key = keyOf(wallet);
  state.balances.set(key, (state.balances.get(key) ?? 0n) + BigInt(amount));
  return { signature: 'FakeMintSignature111111111111111111111111' };
}
