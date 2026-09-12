// Weekly crank: creates the upcoming week pools and settles the finished week. Chain reads/writes
// go through `chain/readers.js` + `chain/txs.js` so tests can swap in `test/helpers/fakeChain.js`.
import * as chainReaders from '../chain/readers.js';
import * as chainTxs from '../chain/txs.js';
import { GRACE_SECONDS, dayOf, weekEnd, weekOf } from './dailySeed.js';

const defaultChain = { ...chainReaders, ...chainTxs };

// How far back the crank will look for an unsettled week it missed (e.g. the VPS was down
// over a week, or a persistent RPC failure aborted earlier runs). Bounded so a permanently
// broken week (one that will never settle, e.g. its pool was never funded) cannot make every
// run walk back indefinitely.
const MAX_WEEKS_BACK = 4;

/**
 * Ensures `WeekPool(current)` and `WeekPool(current + 1)` exist (server authority pays), then
 * settles every finished, unsettled week it can find looking back from `current - 1` to
 * `current - MAX_WEEKS_BACK` (oldest first): a pool that exists, is not already settled, and
 * whose `week_end + GRACE_SECONDS` has passed. A missing pool is skipped (not an error - it
 * may simply predate the feature); an already-settled one is skipped too. Idempotent: a second
 * run with the same `now` and on-chain state does nothing.
 *
 * @param {object} args
 * @param {number} args.now - Unix seconds.
 * @param {typeof defaultChain} [args.chain] - Injectable for tests; defaults to the real chain modules.
 * @param {Console} [args.log] - Injectable for tests; defaults to `console`.
 * @returns {Promise<{ createdPools: number[], settled: number[] }>}
 */
export async function runWeekly({ now, chain = defaultChain, log = console }) {
  const currentWeek = weekOf(dayOf(now));
  const createdPools = [];

  for (const week of [currentWeek, currentWeek + 1]) {
    const pool = await chain.getWeekPool(week);
    if (pool) continue;
    const prepared = await chain.buildCreateWeekPoolTx(week);
    await chain.sendSigned(prepared);
    createdPools.push(week);
    log.log(`Weekly crank: created week pool ${week}`);
  }

  const settled = [];
  const oldestWeek = Math.max(0, currentWeek - MAX_WEEKS_BACK);
  for (let week = oldestWeek; week <= currentWeek - 1; week++) {
    if (now < weekEnd(week) + GRACE_SECONDS) continue;
    const pool = await chain.getWeekPool(week);
    if (!pool) {
      log.log(`Weekly crank: week ${week} has no pool - skipping`);
      continue;
    }
    if (pool.settled) continue;
    const winners = pool.top.map((entry) => entry.player);
    const prepared = await chain.buildSettleWeekTx(week, winners);
    await chain.sendSigned(prepared);
    settled.push(week);
    log.log(`Weekly crank: settled week ${week}`);
  }

  return { createdPools, settled };
}
