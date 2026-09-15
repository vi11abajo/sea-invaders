// Account readers. Amounts come back from the coder as `BN` - converted to
// `bigint`/`number` here so nothing outside `chain/` ever sees a `BN`.
import { PublicKey } from '@solana/web3.js';
import { getAccount, TokenAccountNotFoundError } from '@solana/spl-token';
import { program as buildProgram } from './program.js';
import { connection as defaultConnection } from './connection.js';
import { chainConfig } from './config.js';
import { catalogPda, configPda, playerPda, seekerLinkPda, weekPda, ata } from './pdas.js';
import { flattenInstructions } from './flatten.js';

const toBigInt = (bn) => BigInt(bn.toString());
const toNumber = (bn) => Number(bn.toString());

/** The singleton `config` account, or `null` if it has not been created yet. */
export async function getConfig(connection = defaultConnection()) {
  const acct = await buildProgram(connection).account.config.fetchNullable(configPda());
  if (!acct) return null;
  return {
    admin: acct.admin.toBase58(),
    serverAuthority: acct.serverAuthority.toBase58(),
    skrMint: acct.skrMint.toBase58(),
    treasury: acct.treasury.toBase58(),
    ticketPrice: toBigInt(acct.ticketPrice),
    attemptsPerTicket: acct.attemptsPerTicket,
    ticketPoolBps: acct.ticketPoolBps,
    purchasePoolBps: acct.purchasePoolBps,
    reviveLadder: acct.reviveLadder.map(toBigInt),
    ebbSeconds: acct.ebbSeconds,
    graceSeconds: acct.graceSeconds,
    payoutBps: acct.payoutBps,
    paused: acct.paused,
  };
}

/** A wallet's `player` account, or `null` if it has not been created yet. */
export async function getPlayer(wallet, connection = defaultConnection()) {
  const acct = await buildProgram(connection).account.player.fetchNullable(playerPda(wallet));
  if (!acct) return null;
  return {
    wallet: acct.wallet.toBase58(),
    week: acct.week,
    dayBests: [...acct.dayBests],
    weekUpdatedAt: toNumber(acct.weekUpdatedAt),
    ticketDay: acct.ticketDay,
    prevTicketDay: acct.prevTicketDay,
    attemptsBought: acct.attemptsBought,
    tide: acct.tide,
    tideAt: toNumber(acct.tideAt),
    inventory: toBigInt(acct.inventory),
    seeker: acct.seeker,
    lastReplayHash: Array.from(acct.lastReplayHash),
  };
}

/** A Seeker Genesis Token mint's `seeker_link` account, or `null` while that mint has never been linked - the chain's own answer to "is this token already somebody's?". */
export async function getSeekerLink(sgtMint, connection = defaultConnection()) {
  const acct = await buildProgram(connection).account.seekerLink.fetchNullable(seekerLinkPda(sgtMint));
  if (!acct) return null;
  return {
    sgtMint: acct.sgtMint.toBase58(),
    player: acct.player.toBase58(),
    linkedAt: toNumber(acct.linkedAt),
    bump: acct.bump,
  };
}

/**
 * The `seeker_link` account for whichever Seeker Genesis Token `wallet`'s player linked, found by
 * scanning `SeekerLink` accounts (81 bytes: 8-byte discriminator, `sgt_mint` pubkey at 8, `player`
 * pubkey at 40, `linked_at` i64 at 72, `bump` u8 at 80 - verified against `chain/idl/sea_invaders.json`)
 * for one whose `player` field matches. Used only to backfill the mirror (`services/seeker.js#readSeeker`)
 * when the chain already says `Player.seeker` but no mint was ever recorded - a link that landed on
 * chain but whose confirm never ran (poll timeout, app killed). Seeds are per-mint, not per-player, so
 * this is the one lookup that has to scan rather than derive a PDA; the first match, mapped like
 * `getSeekerLink`, or `null` when the player has no `seeker_link` at all.
 */
export async function getSeekerLinkByPlayer(wallet, connection = defaultConnection()) {
  const walletKey = wallet instanceof PublicKey ? wallet : new PublicKey(wallet);
  const accounts = await buildProgram(connection).account.seekerLink.all([
    { dataSize: 81 },
    { memcmp: { offset: 40, bytes: walletKey.toBase58() } },
  ]);
  const acct = accounts[0]?.account;
  if (!acct) return null;
  return {
    sgtMint: acct.sgtMint.toBase58(),
    player: acct.player.toBase58(),
    linkedAt: toNumber(acct.linkedAt),
    bump: acct.bump,
  };
}

/** The singleton `catalog` account, or `null` if it has not been created yet. `items` is trimmed to `count` entries. */
export async function getCatalog(connection = defaultConnection()) {
  const acct = await buildProgram(connection).account.catalog.fetchNullable(catalogPda());
  if (!acct) return null;
  return {
    admin: acct.admin.toBase58(),
    items: acct.items.slice(0, acct.count).map((item) => ({
      id: item.id,
      kind: item.kind,
      price: toBigInt(item.price),
      active: item.active,
    })),
    count: acct.count,
    bump: acct.bump,
  };
}

/** A week's `week_pool` account, or `null` if it has not been created yet. `top` is trimmed to `top_len` entries. */
export async function getWeekPool(week, connection = defaultConnection()) {
  const acct = await buildProgram(connection).account.weekPool.fetchNullable(weekPda(week));
  if (!acct) return null;
  return {
    week: acct.week,
    vault: acct.vault.toBase58(),
    top: acct.top.slice(0, acct.topLen).map((entry) => ({
      player: entry.player.toBase58(),
      total: toNumber(entry.total),
      updatedAt: toNumber(entry.updatedAt),
    })),
    settled: acct.settled,
  };
}

/** The SKR balance (base units) of a week's pool vault; `0n` if the vault does not exist yet. */
export async function getVaultBalance(week, connection = defaultConnection()) {
  return getTokenBalance(weekPda(week), connection);
}

/** The SKR balance (base units) of `owner`'s associated token account; `0n` if it does not exist. */
export async function getTokenBalance(owner, connection = defaultConnection()) {
  const { skrMint } = chainConfig();
  try {
    const account = await getAccount(connection, ata(owner, skrMint));
    return account.amount;
  } catch (err) {
    if (err instanceof TokenAccountNotFoundError) return 0n;
    throw err;
  }
}

/** SOL balance (lamports) of `pubkey` (a `PublicKey` or base58 string). */
export async function getSolBalance(pubkey, connection = defaultConnection()) {
  const key = pubkey instanceof PublicKey ? pubkey : new PublicKey(pubkey);
  const lamports = await connection.getBalance(key);
  return BigInt(lamports);
}

/** `'confirmed'` once the transaction landed successfully, `'failed'` once it landed but errored, `'missing'` while it is not yet visible to the RPC node (the caller retries). */
export async function getTransactionStatus(signature, connection = defaultConnection()) {
  const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
  if (!tx) return 'missing';
  return tx.meta?.err ? 'failed' : 'confirmed';
}

/**
 * Fetches a confirmed transaction and flattens its instructions to `{ programId, accountKeys, data }`
 * (base58 keys, a raw `Buffer` of instruction data) - the shape `chain/verify.js` inspects to check
 * program id, instruction discriminator, args and payer before a `confirm*` endpoint touches its
 * cache or DB (see the design doc §6 / global-constraints.md's Phase 3B additions). Same
 * missing/failed/confirmed states as `getTransactionStatus`. Resolves address-lookup-table accounts
 * via `meta.loadedAddresses` so a v0 tx that used one (e.g. the swap-composed transaction) still
 * flattens correctly, not just the always-static tickets/purchase/revive transactions.
 */
export async function getConfirmedInstructions(signature, connection = defaultConnection()) {
  const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
  if (!tx) return { status: 'missing' };
  if (tx.meta?.err) return { status: 'failed' };
  const message = tx.transaction.message;
  const keys = message.getAccountKeys({ accountKeysFromLookups: tx.meta.loadedAddresses });
  return { status: 'confirmed', instructions: flattenInstructions(message, keys) };
}
