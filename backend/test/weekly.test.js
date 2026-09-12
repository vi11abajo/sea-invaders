import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GRACE_SECONDS, dayStart, weekEnd, weekFirstDay } from '../src/services/dailySeed.js';
import * as fakeChain from './helpers/fakeChain.js';

const { runWeekly } = await import('../src/services/weekly.js');

// A week far from 0 so `prevWeek` (WEEK - 1) is never negative.
const WEEK = 2965;
const PREV_WEEK = WEEK - 1;
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
    expect(result.settled).toBeNull();
  });

  it('creates both the current and next week pools when neither exists', async () => {
    const result = await runWeekly({ now: NOW, chain: fakeChain, log: silentLog() });
    expect(result.createdPools).toEqual([WEEK, WEEK + 1]);
    expect(fakeChain.state.calls.createWeekPool).toEqual([WEEK, WEEK + 1]);
    expect(result.settled).toBeNull(); // the previous week's pool does not exist
  });

  it('settles the previous week exactly once its grace period has passed', async () => {
    seedSurroundingPools();
    fakeChain.setWeekPool(PREV_WEEK, { top: [{ player: 'Wallet1', total: 500, updatedAt: NOW }], settled: false });
    const now = weekEnd(PREV_WEEK) + GRACE_SECONDS + 100;

    const result = await runWeekly({ now, chain: fakeChain, log: silentLog() });

    expect(result.createdPools).toEqual([]);
    expect(result.settled).toBe(PREV_WEEK);
    expect(fakeChain.state.calls.settleWeek).toEqual([{ week: PREV_WEEK, winners: ['Wallet1'] }]);
    expect(fakeChain.state.sentTxs).toHaveLength(1); // only the settle tx - pools already existed
  });

  it('does nothing before the grace period elapses', async () => {
    seedSurroundingPools();
    fakeChain.setWeekPool(PREV_WEEK, { top: [{ player: 'Wallet1', total: 500, updatedAt: NOW }], settled: false });
    const now = weekEnd(PREV_WEEK) + GRACE_SECONDS - 1;

    const result = await runWeekly({ now, chain: fakeChain, log: silentLog() });

    expect(result.settled).toBeNull();
    expect(fakeChain.state.calls.settleWeek).toEqual([]);
    expect(fakeChain.state.sentTxs).toEqual([]);
  });

  it('tolerates an already settled week', async () => {
    seedSurroundingPools();
    fakeChain.setWeekPool(PREV_WEEK, { top: [{ player: 'Wallet1', total: 500, updatedAt: NOW }], settled: true });
    const now = weekEnd(PREV_WEEK) + GRACE_SECONDS + 100;

    const result = await runWeekly({ now, chain: fakeChain, log: silentLog() });

    expect(result.settled).toBeNull();
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
});
