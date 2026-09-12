import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dayOf, dayStart, GRACE_SECONDS, weekEnd, weekOf, weekdayOf } from '../src/services/dailySeed.js';
import * as fakeChain from './helpers/fakeChain.js';
import * as memory from './helpers/memoryRankedRuns.js';
import * as memoryRecords from './helpers/memoryRecords.js';
import * as memoryUsers from './helpers/memoryUsers.js';

vi.mock('../src/db/rankedRuns.js', () => import('./helpers/memoryRankedRuns.js'));
vi.mock('../src/db/records.js', () => import('./helpers/memoryRecords.js'));
vi.mock('../src/db/users.js', () => import('./helpers/memoryUsers.js'));
vi.mock('../src/chain/readers.js', () => import('./helpers/fakeChain.js'));
vi.mock('../src/chain/txs.js', () => import('./helpers/fakeChain.js'));

const { issueTicket, issueRecord, confirmRecord, weekView, clearWeekViewCache } = await import('../src/services/records.js');
const { RankedRunError } = await import('../src/services/rankedRuns.js');

const NOON = Date.UTC(2026, 8, 11, 12) / 1000;
const DAY = dayOf(NOON);
const WEEK = weekOf(DAY);
const WEEKDAY = weekdayOf(DAY);
const user = memory.TEST_USER;
const WALLET = user.wallet_address;

async function seedVerifiedRun(score) {
  await memory.insertRun({ id: 'run-1', userId: user.id, day: DAY });
  await memory.finishRun('run-1', { score, finishedAt: NOON + 10, stateHash: 'abcdef0123456789', status: 'verified' });
}

describe('issueTicket', () => {
  beforeEach(() => {
    memory.reset();
    fakeChain.reset();
  });

  it('flags createsPlayer true when no player account exists yet', async () => {
    const result = await issueTicket({ wallet: WALLET, now: NOON });
    expect(result).toMatchObject({ transaction: expect.any(String), minContextSlot: 1234, createsPlayer: true });
  });

  it('flags createsPlayer false once the player account exists', async () => {
    fakeChain.setPlayer(WALLET, {});
    const result = await issueTicket({ wallet: WALLET, now: NOON });
    expect(result.createsPlayer).toBe(false);
  });
});

describe('issueRecord', () => {
  beforeEach(() => {
    memory.reset();
    fakeChain.reset();
  });

  it('throws day_closed once the day window has closed', async () => {
    await expect(issueRecord({ userId: user.id, wallet: WALLET, day: DAY, now: dayStart(DAY + 1) + GRACE_SECONDS })).rejects.toMatchObject({ code: 'day_closed', status: 400 });
  });

  it('throws no_verified_run when the server has no best for the day', async () => {
    await expect(issueRecord({ userId: user.id, wallet: WALLET, day: DAY, now: NOON })).rejects.toMatchObject({ code: 'no_verified_run', status: 404 });
  });

  it('throws no_player_account when the wallet has no player account yet', async () => {
    await seedVerifiedRun(500);
    await expect(issueRecord({ userId: user.id, wallet: WALLET, day: DAY, now: NOON })).rejects.toMatchObject({ code: 'no_player_account', status: 404 });
  });

  it('throws no_ticket when neither ticket_day nor prev_ticket_day matches the day', async () => {
    await seedVerifiedRun(500);
    fakeChain.setPlayer(WALLET, { ticketDay: DAY - 10, prevTicketDay: DAY - 11 });
    await expect(issueRecord({ userId: user.id, wallet: WALLET, day: DAY, now: NOON })).rejects.toMatchObject({ code: 'no_ticket', status: 409 });
  });

  it('accepts a ticket bought yesterday (prev_ticket_day) as well as today', async () => {
    await seedVerifiedRun(500);
    fakeChain.setPlayer(WALLET, { ticketDay: DAY + 1, prevTicketDay: DAY });
    const result = await issueRecord({ userId: user.id, wallet: WALLET, day: DAY, now: NOON });
    expect(result).toMatchObject({ day: DAY, score: 500, transaction: expect.any(String), minContextSlot: 1234 });
  });

  it('throws already_recorded when the on-chain best already matches or beats the server best', async () => {
    await seedVerifiedRun(500);
    const dayBests = [0, 0, 0, 0, 0, 0, 0];
    dayBests[WEEKDAY] = 500;
    fakeChain.setPlayer(WALLET, { ticketDay: DAY, week: WEEK, dayBests });
    await expect(issueRecord({ userId: user.id, wallet: WALLET, day: DAY, now: NOON })).rejects.toMatchObject({ code: 'already_recorded', status: 409 });
  });

  it('treats a stale on-chain week as zero for the already_recorded comparison', async () => {
    await seedVerifiedRun(500);
    const staleBests = [900, 900, 900, 900, 900, 900, 900]; // leftover from a previous week
    fakeChain.setPlayer(WALLET, { ticketDay: DAY, week: WEEK - 1, dayBests: staleBests });
    const result = await issueRecord({ userId: user.id, wallet: WALLET, day: DAY, now: NOON });
    expect(result.score).toBe(500);
  });

  it('is re-callable while the day stays open (fresh envelope each time)', async () => {
    await seedVerifiedRun(500);
    fakeChain.setPlayer(WALLET, { ticketDay: DAY });
    const first = await issueRecord({ userId: user.id, wallet: WALLET, day: DAY, now: NOON });
    const second = await issueRecord({ userId: user.id, wallet: WALLET, day: DAY, now: NOON + 5 });
    expect(first).toMatchObject({ day: DAY, score: 500 });
    expect(second).toMatchObject({ day: DAY, score: 500 });
  });
});

describe('confirmRecord', () => {
  beforeEach(() => {
    memory.reset();
    memoryRecords.reset();
    fakeChain.reset();
  });

  it('returns confirmed:false while the transaction is not yet visible', async () => {
    const result = await confirmRecord({ userId: user.id, wallet: WALLET, day: DAY, signature: 'missing-sig' });
    expect(result).toEqual({ confirmed: false });
  });

  it('throws record_failed (terminal) for a failed transaction instead of confirmed:false', async () => {
    fakeChain.setTxStatus('failed-sig', false);
    await expect(confirmRecord({ userId: user.id, wallet: WALLET, day: DAY, signature: 'failed-sig' })).rejects.toMatchObject({ code: 'record_failed', status: 409 });
  });

  it('returns confirmed:false when the on-chain best has not caught up to the server best yet', async () => {
    await seedVerifiedRun(500);
    fakeChain.setTxStatus('sig', true);
    fakeChain.setPlayer(WALLET, { week: WEEK, dayBests: [0, 0, 0, 0, 0, 0, 0] });
    const result = await confirmRecord({ userId: user.id, wallet: WALLET, day: DAY, signature: 'sig' });
    expect(result).toEqual({ confirmed: false });
  });

  it('confirms and mirrors the record into ranked_records once the chain reflects the score', async () => {
    await seedVerifiedRun(500);
    fakeChain.setTxStatus('sig', true);
    const dayBests = [0, 0, 0, 0, 0, 0, 0];
    dayBests[WEEKDAY] = 500;
    fakeChain.setPlayer(WALLET, { week: WEEK, dayBests });

    const result = await confirmRecord({ userId: user.id, wallet: WALLET, day: DAY, signature: 'sig' });
    expect(result).toEqual({ confirmed: true, score: 500 });

    const stored = await memoryRecords.getRecord(user.id, DAY);
    expect(stored).toMatchObject({ userId: user.id, day: DAY, score: 500, signature: 'sig' });
  });

  it('upserts on a second confirm for the same (user, day) when the score improves', async () => {
    await memory.insertRun({ id: 'run-1', userId: user.id, day: DAY });
    await memory.finishRun('run-1', { score: 500, finishedAt: NOON + 10, stateHash: 'abcdef0123456789', status: 'verified' });
    fakeChain.setTxStatus('sig-a', true);
    const dayBests = [0, 0, 0, 0, 0, 0, 0];
    dayBests[WEEKDAY] = 500;
    fakeChain.setPlayer(WALLET, { week: WEEK, dayBests });
    await confirmRecord({ userId: user.id, wallet: WALLET, day: DAY, signature: 'sig-a' });

    // A later, better run for the same day raises both the server best and the on-chain record.
    await memory.insertRun({ id: 'run-2', userId: user.id, day: DAY });
    await memory.finishRun('run-2', { score: 700, finishedAt: NOON + 20, stateHash: 'fedcba9876543210', status: 'verified' });
    const higherBests = [0, 0, 0, 0, 0, 0, 0];
    higherBests[WEEKDAY] = 700;
    fakeChain.setPlayer(WALLET, { week: WEEK, dayBests: higherBests });
    fakeChain.setTxStatus('sig-b', true);
    const result = await confirmRecord({ userId: user.id, wallet: WALLET, day: DAY, signature: 'sig-b' });
    expect(result).toEqual({ confirmed: true, score: 700 });
    const stored = await memoryRecords.getRecord(user.id, DAY);
    expect(stored).toMatchObject({ score: 700, signature: 'sig-b' });
  });

  it('never lowers the mirrored record: a later confirm reporting a lower score leaves the higher one in place', async () => {
    await seedVerifiedRun(500);
    fakeChain.setTxStatus('sig-high', true);
    const highBests = [0, 0, 0, 0, 0, 0, 0];
    highBests[WEEKDAY] = 500;
    fakeChain.setPlayer(WALLET, { week: WEEK, dayBests: highBests });
    const first = await confirmRecord({ userId: user.id, wallet: WALLET, day: DAY, signature: 'sig-high' });
    expect(first).toEqual({ confirmed: true, score: 500 });

    // Simulate the server's verified best for the day being corrected down after the fact (e.g. an
    // anti-cheat review) with a matching lower on-chain record - the mirror must not follow it down.
    await memory.finishRun('run-1', { score: 300 });
    fakeChain.setTxStatus('sig-low', true);
    const lowBests = [0, 0, 0, 0, 0, 0, 0];
    lowBests[WEEKDAY] = 300;
    fakeChain.setPlayer(WALLET, { week: WEEK, dayBests: lowBests });

    const second = await confirmRecord({ userId: user.id, wallet: WALLET, day: DAY, signature: 'sig-low' });
    expect(second).toEqual({ confirmed: true, score: 500 });

    const stored = await memoryRecords.getRecord(user.id, DAY);
    expect(stored).toMatchObject({ score: 500, signature: 'sig-high' });
  });

  it("the db mirror (memoryRecords) itself never lowers an existing record's score or signature", async () => {
    await memoryRecords.upsertRecord({ userId: user.id, day: DAY, score: 500, signature: 'sig-high' });
    await memoryRecords.upsertRecord({ userId: user.id, day: DAY, score: 300, signature: 'sig-low' });
    const stored = await memoryRecords.getRecord(user.id, DAY);
    expect(stored).toMatchObject({ score: 500, signature: 'sig-high' });
  });
});

describe('weekView', () => {
  beforeEach(() => {
    memory.reset();
    memoryUsers.reset();
    fakeChain.reset();
    clearWeekViewCache();
  });

  it('returns an empty view before the week pool exists', async () => {
    const result = await weekView({ week: WEEK, now: NOON });
    expect(result).toEqual({ week: WEEK, endsAt: weekEnd(WEEK), poolSkr: 0, entries: [], settled: false });
  });

  it('renders top entries with usernames, day-by-day scores and the payout forecast', async () => {
    fakeChain.setConfig({ payoutBps: [5000, 3000, 2000] });
    fakeChain.setWeekPool(WEEK, { vault: 'Vault1', top: [{ player: WALLET, total: 777, updatedAt: NOON }], settled: false });
    fakeChain.setBalance('Vault1', 20_000_000n);
    fakeChain.setPlayer(WALLET, { week: WEEK, dayBests: [1, 2, 3, 4, 5, 6, 7] });

    const result = await weekView({ week: WEEK, now: NOON });
    expect(result).toEqual({
      week: WEEK,
      endsAt: weekEnd(WEEK),
      poolSkr: 20,
      settled: false,
      entries: [{ rank: 1, walletAddress: WALLET, username: user.username, total: 777, days: [1, 2, 3, 4, 5, 6, 7], forecastSkr: 10 }],
    });
  });

  it("zeroes a top entry's days when the player's on-chain record is from a different week", async () => {
    fakeChain.setWeekPool(WEEK, { vault: 'Vault1', top: [{ player: WALLET, total: 777, updatedAt: NOON }], settled: false });
    fakeChain.setBalance('Vault1', 0n);
    fakeChain.setPlayer(WALLET, { week: WEEK - 1, dayBests: [1, 2, 3, 4, 5, 6, 7] });

    const result = await weekView({ week: WEEK, now: NOON });
    expect(result.entries[0].days).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it('exposes RankedRunError codes it may reuse', () => {
    expect(new RankedRunError('no_verified_run', 'x')).toMatchObject({ status: 404 });
    expect(new RankedRunError('already_recorded', 'x')).toMatchObject({ status: 409 });
    expect(new RankedRunError('no_ticket', 'x')).toMatchObject({ status: 409 });
    expect(new RankedRunError('no_player_account', 'x')).toMatchObject({ status: 404 });
    expect(new RankedRunError('record_failed', 'x')).toMatchObject({ status: 409 });
  });

  it('caches the computed view for 30s: two calls within the TTL hit the fake chain once', async () => {
    fakeChain.setWeekPool(WEEK, { vault: 'Vault1', top: [], settled: false });

    const first = await weekView({ week: WEEK, now: NOON });
    const second = await weekView({ week: WEEK, now: NOON });

    expect(second).toEqual(first);
    expect(fakeChain.state.calls.getWeekPool).toEqual([WEEK]);
  });

  it('a successful confirmRecord clears the cache for the confirmed day\'s week', async () => {
    fakeChain.setWeekPool(WEEK, { vault: 'Vault1', top: [], settled: false });
    await weekView({ week: WEEK, now: NOON });
    expect(fakeChain.state.calls.getWeekPool).toEqual([WEEK]);

    await seedVerifiedRun(500);
    fakeChain.setTxStatus('sig', true);
    const dayBests = [0, 0, 0, 0, 0, 0, 0];
    dayBests[WEEKDAY] = 500;
    fakeChain.setPlayer(WALLET, { week: WEEK, dayBests });
    await confirmRecord({ userId: user.id, wallet: WALLET, day: DAY, signature: 'sig' });

    await weekView({ week: WEEK, now: NOON });
    expect(fakeChain.state.calls.getWeekPool).toEqual([WEEK, WEEK]);
  });
});
