// Weekly crank: creates the upcoming week pools and settles the finished week. Chain reads/writes
// go through `chain/readers.js` + `chain/txs.js` so tests can swap in `test/helpers/fakeChain.js`.
import * as chainReaders from '../chain/readers.js';
import * as chainTxs from '../chain/txs.js';
import { GRACE_SECONDS, dayOf, weekEnd, weekOf } from './dailySeed.js';

const defaultChain = { ...chainReaders, ...chainTxs };

/**
 * Ensures `WeekPool(current)` and `WeekPool(current + 1)` exist (server authority pays), then
 * settles `WeekPool(current - 1)` once its grace period has passed, if it exists and is not
 * already settled. Idempotent: a second run with the same `now` and on-chain state does nothing.
 *
 * @param {object} args
 * @param {number} args.now - Unix seconds.
 * @param {typeof defaultChain} [args.chain] - Injectable for tests; defaults to the real chain modules.
 * @param {Console} [args.log] - Injectable for tests; defaults to `console`.
 * @returns {Promise<{ createdPools: number[], settled: number | null }>}
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

  let settled = null;
  const prevWeek = currentWeek - 1;
  if (prevWeek >= 0 && now >= weekEnd(prevWeek) + GRACE_SECONDS) {
    const prevPool = await chain.getWeekPool(prevWeek);
    if (prevPool && !prevPool.settled) {
      const winners = prevPool.top.map((entry) => entry.player);
      const prepared = await chain.buildSettleWeekTx(prevWeek, winners);
      await chain.sendSigned(prepared);
      settled = prevWeek;
      log.log(`Weekly crank: settled week ${prevWeek}`);
    }
  }

  return { createdPools, settled };
}
