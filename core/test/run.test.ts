import { describe, expect, it } from 'vitest';
import { CORE_VERSION, DAILY_RUN, PRACTICE_RUN, createGame, hashState, step } from '../src';

describe('RunConfig', () => {
  it('bumps the core version', () => {
    expect(CORE_VERSION).toBe(3);
  });

  it('creates daily and practice runs with the new state fields', () => {
    const s = createGame('t', DAILY_RUN);
    expect(s.run).toEqual({ mode: 'daily', lives: 3, features: { boosts: true } });
    expect(s).toMatchObject({ cleared: false, boss: null, drops: [], events: [] });
    expect(s.boosts).toEqual({ active: [], shield: 0, tamerStacks: 0, well: null });
    expect(s.ship.lives).toBe(3);
    expect(createGame('t', { ...PRACTICE_RUN, lives: 5 }).ship.lives).toBe(5);
  });

  it('seeds separate boss and boost streams that differ from the wave stream', () => {
    const s = createGame('t', DAILY_RUN);
    expect([s.rngBoss.a, s.rngBoss.b]).not.toEqual([s.rngWaves.a, s.rngWaves.b]);
    expect([s.rngBoosts.a, s.rngBoosts.b]).not.toEqual([s.rngBoss.a, s.rngBoss.b]);
  });

  it('excludes events from the state hash', () => {
    const a = createGame('t', DAILY_RUN);
    const b = createGame('t', DAILY_RUN);
    step(a, { x: 2812, y: 9650 });
    step(b, { x: 2812, y: 9650 });
    b.events.push({ tick: 1, type: 'wave_cleared' });
    expect(hashState(a)).toBe(hashState(b));
  });
});
