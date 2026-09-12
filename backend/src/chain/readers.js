// Account readers. Amounts come back from the coder as `BN` - converted to
// `bigint`/`number` here so nothing outside `chain/` ever sees a `BN`.
import { getAccount, TokenAccountNotFoundError } from '@solana/spl-token';
import { program as buildProgram } from './program.js';
import { connection as defaultConnection } from './connection.js';
import { chainConfig } from './config.js';
import { configPda, playerPda, weekPda, ata } from './pdas.js';

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

/** `'confirmed'` once the transaction landed successfully, `'failed'` once it landed but errored, `'missing'` while it is not yet visible to the RPC node (the caller retries). */
export async function getTransactionStatus(signature, connection = defaultConnection()) {
  const tx = await connection.getTransaction(signature, { maxSupportedTransactionVersion: 0, commitment: 'confirmed' });
  if (!tx) return 'missing';
  return tx.meta?.err ? 'failed' : 'confirmed';
}
