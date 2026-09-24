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
 * whose `week_end + GRACE_SECONDS` has passed. `settle_week` rolls what is left into the next
 * week's vault and needs that pool, so a missing `WeekPool(week + 1)` is created first - it is
 * missing when no crank ran during both weeks (an outage of over a week). A missing pool to settle
 * is skipped (not an error - it may simply predate the feature); an already-settled one is skipped
 * too. Idempotent: a second run with the same `now` and on-chain state does nothing.
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
  const ensured = new Set();

  /** Creates `WeekPool(week)` when it does not exist yet; each week is looked at once per run. */
  const ensurePool = async (week) => {
    if (ensured.has(week)) return;
    ensured.add(week);
    if (await chain.getWeekPool(week)) return;
    const prepared = await chain.buildCreateWeekPoolTx(week);
    try {
      await chain.sendSigned(prepared);
    } catch (error) {
      // Two cranks race on every deploy (the `weekly-crank` process and the API's own startup run
      // start in the same second): when the other one created the pool meanwhile, the System
      // Program refuses ours with "already in use" (custom program error 0x0). The pool existing
      // is all that matters; anything else is a real failure.
      if (!(await chain.getWeekPool(week))) throw error;
      log.log(`Weekly crank: week pool ${week} was created by a concurrent run`);
      return;
    }
    createdPools.push(week);
    log.log(`Weekly crank: created week pool ${week}`);
  };

  await ensurePool(currentWeek);
  await ensurePool(currentWeek + 1);

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
    await ensurePool(week + 1);
    const winners = pool.top.map((entry) => entry.player);
    const prepared = await chain.buildSettleWeekTx(week, winners);
    await chain.sendSigned(prepared);
    settled.push(week);
    log.log(`Weekly crank: settled week ${week}`);
  }

  return { createdPools, settled };
}
