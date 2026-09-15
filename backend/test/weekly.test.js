import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GRACE_SECONDS, dayStart, weekEnd, weekFirstDay } from '../src/services/dailySeed.js';
import * as fakeChain from './helpers/fakeChain.js';

const { runWeekly } = await import('../src/services/weekly.js');

// A week far from 0 so PREV_WEEK/PREV2_WEEK are never negative.
const WEEK = 2965;
const PREV_WEEK = WEEK - 1;
const PREV2_WEEK = WEEK - 2;
const NOW = dayStart(weekFirstDay(WEEK)) + 3600; // one hour into WEEK's Monday

function silentLog() {
  return { log: vi.fn(), error: vi.fn() };
}

function seedSurroundingPools() {
  // Current and next week pools already exist so tests can isolate settlement behavior.
  fakeChain.setWeekPool(WEEK, {});
  fakeChain.setWeekPool(WEEK + 1, {});
}

describe('runWeekly', () => {
  beforeEach(() => {
    fakeChain.reset();
  });

  it('creates only the pools that do not exist yet', async () => {
    fakeChain.setWeekPool(WEEK, {});
    const result = await runWeekly({ now: NOW, chain: fakeChain, log: silentLog() });
    expect(result.createdPools).toEqual([WEEK + 1]);
    expect(fakeChain.state.calls.createWeekPool).toEqual([WEEK + 1]);
    expect(result.settled).toEqual([]);
  });

  it('treats a pool another run created while ours was in flight as done', async () => {
    // A deploy starts the crank process and the API's startup run in the same second: the loser's
    // create_week_pool fails at the System Program (already in use) but the pool is there.
    let racedOnce = false;
    const chain = {
      ...fakeChain,
      sendSigned: async (prepared) => {
        if (racedOnce) return fakeChain.sendSigned(prepared);
        racedOnce = true;
        fakeChain.setWeekPool(WEEK, {});
        throw new Error('Transaction simulation failed: Error processing Instruction 0: custom program error: 0x0');
      },
    };
    const log = silentLog();
    const result = await runWeekly({ now: NOW, chain, log });
    expect(result.createdPools).toEqual([WEEK + 1]);
    expect(log.log).toHaveBeenCalledWith(`Weekly crank: week pool ${WEEK} was created by a concurrent run`);
  });

  it('still fails when a pool create is refused and the pool is not there', async () => {
    const chain = {
      ...fakeChain,
      sendSigned: async () => {
        throw new Error('Transaction simulation failed: Error processing Instruction 0: custom program error: 0x0');
      },
    };
    await expect(runWeekly({ now: NOW, chain, log: silentLog() })).rejects.toThrow('custom program error: 0x0');
  });

  it('creates both the current and next week pools when neither exists', async () => {
    const result = await runWeekly({ now: NOW, chain: fakeChain, log: silentLog() });
    expect(result.createdPools).toEqual([WEEK, WEEK + 1]);
    expect(fakeChain.state.calls.createWeekPool).toEqual([WEEK, WEEK + 1]);
    expect(result.settled).toEqual([]); // the previous week's pool does not exist
  });

  it('settles the previous week exactly once its grace period has passed', async () => {
    seedSurroundingPools();
    fakeChain.setWeekPool(PREV_WEEK, { top: [{ player: 'Wallet1', total: 500, updatedAt: NOW }], settled: false });
    const now = weekEnd(PREV_WEEK) + GRACE_SECONDS + 100;

    const result = await runWeekly({ now, chain: fakeChain, log: silentLog() });

    expect(result.createdPools).toEqual([]);
    expect(result.settled).toEqual([PREV_WEEK]);
    expect(fakeChain.state.calls.settleWeek).toEqual([{ week: PREV_WEEK, winners: ['Wallet1'] }]);
    expect(fakeChain.state.sentTxs).toHaveLength(1); // only the settle tx - pools already existed
  });

  it('does nothing before the grace period elapses', async () => {
    seedSurroundingPools();
    fakeChain.setWeekPool(PREV_WEEK, { top: [{ player: 'Wallet1', total: 500, updatedAt: NOW }], settled: false });
    const now = weekEnd(PREV_WEEK) + GRACE_SECONDS - 1;

    const result = await runWeekly({ now, chain: fakeChain, log: silentLog() });

    expect(result.settled).toEqual([]);
    expect(fakeChain.state.calls.settleWeek).toEqual([]);
    expect(fakeChain.state.sentTxs).toEqual([]);
  });

  it('tolerates an already settled week', async () => {
    seedSurroundingPools();
    fakeChain.setWeekPool(PREV_WEEK, { top: [{ player: 'Wallet1', total: 500, updatedAt: NOW }], settled: true });
    const now = weekEnd(PREV_WEEK) + GRACE_SECONDS + 100;

    const result = await runWeekly({ now, chain: fakeChain, log: silentLog() });

    expect(result.settled).toEqual([]);
    expect(fakeChain.state.calls.settleWeek).toEqual([]);
  });

  it('passes winners to settle_week in the same order as WeekPool.top', async () => {
    seedSurroundingPools();
    fakeChain.setWeekPool(PREV_WEEK, {
      top: [
        { player: 'WalletFirst', total: 900, updatedAt: NOW },
        { player: 'WalletSecond', total: 500, updatedAt: NOW },
        { player: 'WalletThird', total: 100, updatedAt: NOW },
      ],
      settled: false,
    });
    const now = weekEnd(PREV_WEEK) + GRACE_SECONDS + 100;

    await runWeekly({ now, chain: fakeChain, log: silentLog() });

    expect(fakeChain.state.calls.settleWeek).toEqual([
      { week: PREV_WEEK, winners: ['WalletFirst', 'WalletSecond', 'WalletThird'] },
    ]);
  });

  it('surfaces an RPC failure as a thrown error instead of a partial result', async () => {
    fakeChain.setSendSignedError(new Error('rpc unavailable'));
    await expect(runWeekly({ now: NOW, chain: fakeChain, log: silentLog() })).rejects.toThrow('rpc unavailable');
  });

  // I3: the crank used to only ever look at `current - 1`, stranding an older unsettled week
  // forever if a run was missed (VPS down, a persistent RPC failure). It now walks back and
  // settles every finished, unsettled week it finds, oldest first.
  describe('catching up on more than one missed week', () => {
    it('settles a two-weeks-old unsettled pool together with last week\'s, oldest first', async () => {
      seedSurroundingPools();
      fakeChain.setWeekPool(PREV_WEEK, { top: [{ player: 'Wallet1', total: 500, updatedAt: NOW }], settled: false });
      fakeChain.setWeekPool(PREV2_WEEK, { top: [{ player: 'Wallet2', total: 300, updatedAt: NOW }], settled: false });
      const now = weekEnd(PREV_WEEK) + GRACE_SECONDS + 100;

      const result = await runWeekly({ now, chain: fakeChain, log: silentLog() });

      expect(result.settled).toEqual([PREV2_WEEK, PREV_WEEK]);
      expect(fakeChain.state.calls.settleWeek).toEqual([
        { week: PREV2_WEEK, winners: ['Wallet2'] },
        { week: PREV_WEEK, winners: ['Wallet1'] },
      ]);
    });

    it('skips a missing pool and still settles the weeks that do exist', async () => {
      seedSurroundingPools();
      fakeChain.setWeekPool(PREV_WEEK, { top: [{ player: 'Wallet1', total: 500, updatedAt: NOW }], settled: false });
      // PREV2_WEEK has no pool at all - not an error, just skipped.
      const now = weekEnd(PREV_WEEK) + GRACE_SECONDS + 100;

      const result = await runWeekly({ now, chain: fakeChain, log: silentLog() });

      expect(result.settled).toEqual([PREV_WEEK]);
      expect(fakeChain.state.calls.settleWeek).toEqual([{ week: PREV_WEEK, winners: ['Wallet1'] }]);
    });

    it('skips an already-settled older week while settling the rest', async () => {
      seedSurroundingPools();
      fakeChain.setWeekPool(PREV_WEEK, { top: [{ player: 'Wallet1', total: 500, updatedAt: NOW }], settled: false });
      fakeChain.setWeekPool(PREV2_WEEK, { top: [{ player: 'Wallet2', total: 300, updatedAt: NOW }], settled: true });
      const now = weekEnd(PREV_WEEK) + GRACE_SECONDS + 100;

      const result = await runWeekly({ now, chain: fakeChain, log: silentLog() });

      expect(result.settled).toEqual([PREV_WEEK]);
      expect(fakeChain.state.calls.settleWeek).toEqual([{ week: PREV_WEEK, winners: ['Wallet1'] }]);
    });
  });
});
