// Tickets (buying an attempt on-chain), records (submitting a verified server best on-chain) and
// the week view. Chain reads/writes go through `chain/readers.js` / `chain/txs.js` so tests can
// swap in `test/helpers/fakeChain.js`.
import { getConfig, getPlayer, getTransactionStatus, getVaultBalance, getWeekPool } from '../chain/readers.js';
import { buildTicketTx, buildSubmitDailyBestTx } from '../chain/txs.js';
import * as recordsDb from '../db/records.js';
import * as rankedRunsDb from '../db/rankedRuns.js';
import { findUsersByWallets } from '../db/users.js';
import { dayOf, weekEnd, weekOf, weekdayOf, isDayOpen } from './dailySeed.js';
import { RankedRunError } from './rankedRuns.js';

/** `create_player` (first ticket only) + `buy_ticket` for the current week, as one unsigned v0 tx. */
export async function issueTicket({ wallet, now }) {
  const day = dayOf(now);
  const week = weekOf(day);
  const [player, config] = await Promise.all([getPlayer(wallet), getConfig()]);
  const createsPlayer = !player;
  const envelope = await buildTicketTx(wallet, { createPlayer: createsPlayer, week, treasury: config?.treasury });
  return { ...envelope, createsPlayer };
}

/** Turns an 8-byte hex state hash (`state_hash`, 16 hex chars) into the 32-byte array the program expects. */
function replayHashBytes(stateHash) {
  const bytes = new Uint8Array(32);
  if (stateHash) Uint8Array.from(Buffer.from(stateHash, 'hex')).forEach((b, i) => { bytes[i] = b; });
  return bytes;
}

/**
 * Builds the dual-signed `submit_daily_best` tx recording the caller's best verified run for
 * `day` on-chain. Re-callable any number of times (fresh blockhash each call) while the day is open.
 */
export async function issueRecord({ userId, wallet, day, now }) {
  if (!isDayOpen(day, now)) throw new RankedRunError('day_closed', 'The day window for this run has closed');

  const best = await rankedRunsDb.bestForDay(userId, day);
  if (!best) throw new RankedRunError('no_verified_run', 'No verified run for this day');

  const player = await getPlayer(wallet);
  if (!player) throw new RankedRunError('no_player_account', 'Player account does not exist yet');

  if (player.ticketDay !== day && player.prevTicketDay !== day) {
    throw new RankedRunError('no_ticket', 'No ticket bought for this day');
  }

  const weekday = weekdayOf(day);
  const onChainBest = player.week === weekOf(day) ? player.dayBests[weekday] : 0;
  if (onChainBest >= best.score) throw new RankedRunError('already_recorded', 'On-chain best already at or above the server best');

  const run = await rankedRunsDb.getRun(best.runId);
  const envelope = await buildSubmitDailyBestTx(wallet, { day, score: best.score, replayHash: replayHashBytes(run?.stateHash) });
  return { ...envelope, day, score: best.score };
}

/** Confirms a submitted `submit_daily_best` tx and mirrors it into `ranked_records`. */
export async function confirmRecord({ userId, wallet, day, signature }) {
  const status = await getTransactionStatus(signature);
  if (status !== 'confirmed') return { confirmed: false };

  const player = await getPlayer(wallet);
  const weekday = weekdayOf(day);
  const onChainBest = player && player.week === weekOf(day) ? player.dayBests[weekday] : 0;

  const best = await rankedRunsDb.bestForDay(userId, day);
  const serverBest = best ? best.score : 0;
  if (!player || onChainBest < serverBest) return { confirmed: false };

  await recordsDb.upsertRecord({ userId, day, score: onChainBest, signature });
  return { confirmed: true, score: onChainBest };
}

/** The current week's leaderboard: `WeekPool.top` annotated with usernames, day-by-day scores and the payout forecast. */
export async function weekView({ week, now }) {
  const [pool, vaultBalance, config] = await Promise.all([getWeekPool(week), getVaultBalance(week), getConfig()]);
  const poolSkr = Number(vaultBalance) / 1e6;
  const endsAt = weekEnd(week);

  if (!pool) {
    return { week, endsAt, poolSkr, entries: [], settled: false };
  }

  const wallets = pool.top.map((entry) => entry.player);
  const users = await findUsersByWallets(wallets);
  const usernameByWallet = new Map(users.map((u) => [u.wallet_address, u.username]));
  const payoutBps = config ? config.payoutBps : [];

  const entries = await Promise.all(pool.top.map(async (entry, i) => {
    const player = await getPlayer(entry.player);
    const days = player && player.week === week ? player.dayBests : new Array(7).fill(0);
    const bps = BigInt(payoutBps[i] ?? 0);
    const forecastSkr = Number((vaultBalance * bps) / 10_000n) / 1e6;
    return { rank: i + 1, walletAddress: entry.player, username: usernameByWallet.get(entry.player) ?? null, total: entry.total, days, forecastSkr };
  }));

  return { week, endsAt, poolSkr, entries, settled: pool.settled };
}
