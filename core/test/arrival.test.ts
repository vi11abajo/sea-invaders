import { describe, expect, it } from 'vitest';
import { ARRIVAL, DAILY_RUN, INITIAL_INPUT, PRACTICE_RUN, createGame, levelById, step } from '../src';

describe('wave arrival (campaign only)', () => {
  it('spawns a level wave above its slots and lands exactly on them after ARRIVAL.ticks', () => {
    const l = levelById(1);
    const s = createGame('arrival-land', { mode: 'campaign', level: l, lives: 5, features: { boosts: false } });
    expect(s.arrival).toBe(ARRIVAL.ticks);
    // The slot each crab is descending to: its current y/homeY plus the drop it was spawned with.
    const slots = s.crabs.map((c) => ({ x: c.x, y: c.y + ARRIVAL.drop, homeY: c.homeY + ARRIVAL.drop }));

    for (let i = 0; i < ARRIVAL.ticks; i++) step(s, INITIAL_INPUT);

    expect(s.arrival).toBe(0);
    expect(s.crabs).toHaveLength(slots.length);
    s.crabs.forEach((c, i) => {
      expect(c.x).toBe(slots[i]!.x);
      expect(c.y).toBe(slots[i]!.y);
      expect(c.homeY).toBe(slots[i]!.homeY);
    });
  });

  it('emits wave_start with the wave number when a level wave begins', () => {
    const l = levelById(1);
    const s = createGame('arrival-event', { mode: 'campaign', level: l, lives: 5, features: { boosts: false } });
    expect(s.events).toContainEqual({ tick: 0, type: 'wave_start', wave: 1 });
  });

  it('fires no crab shot while a wave is arriving', () => {
    const l = levelById(1);
    const s = createGame('arrival-noshots', { mode: 'campaign', level: l, lives: 5, features: { boosts: false } });
    for (let i = 0; i < ARRIVAL.ticks; i++) {
      step(s, INITIAL_INPUT);
      expect(s.enemyShots).toHaveLength(0);
    }
  });

  it('does not march, trigger a diver or test invasion while arriving', () => {
    const l = levelById(1);
    const s = createGame('arrival-nomarch', { mode: 'campaign', level: l, lives: 5, features: { boosts: false } });
    const x0 = s.crabs[0]!.x;
    step(s, INITIAL_INPUT);
    expect(s.crabs[0]!.x).toBe(x0); // x untouched during arrival, only y/homeY move
    expect(s.over).toBe(false);
  });

  it('daily and practice runs never set arrival', () => {
    const daily = createGame('arrival-daily', DAILY_RUN);
    expect(daily.arrival).toBe(0);
    for (let i = 0; i < 60; i++) step(daily, INITIAL_INPUT);
    expect(daily.arrival).toBe(0);

    const practice = createGame('arrival-practice', PRACTICE_RUN);
    expect(practice.arrival).toBe(0);
    for (let i = 0; i < 60; i++) step(practice, INITIAL_INPUT);
    expect(practice.arrival).toBe(0);
  });
});
