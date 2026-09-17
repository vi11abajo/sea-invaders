import { describe, expect, it } from 'vitest';
import {
  ARRIVAL, DAILY_RUN, INITIAL_INPUT, PRACTICE_RUN, createGame, formationPositions, levelById, step,
} from '../src';

describe('wave arrival (campaign only)', () => {
  it('spawns a level wave above its slots and lands exactly on them after ARRIVAL.ticks', () => {
    const l = levelById(1);
    const s = createGame('arrival-land', { mode: 'campaign', level: l, lives: 5, features: { boosts: false }, octopi: 'base' });
    expect(s.arrival).toBe(ARRIVAL.ticks);
    // The slot each crab is descending to: its current y plus the drop it was spawned with.
    const slots = s.crabs.map((c) => ({ x: c.x, y: c.y + ARRIVAL.drop }));

    for (let i = 0; i < ARRIVAL.ticks; i++) step(s, INITIAL_INPUT);

    expect(s.arrival).toBe(0);
    expect(s.crabs).toHaveLength(slots.length);
    s.crabs.forEach((c, i) => {
      expect(c.x).toBe(slots[i]!.x);
      expect(c.y).toBe(slots[i]!.y);
    });
  });

  it('emits wave_start with the wave number when a level wave begins', () => {
    const l = levelById(1);
    const s = createGame('arrival-event', { mode: 'campaign', level: l, lives: 5, features: { boosts: false }, octopi: 'base' });
    expect(s.events).toContainEqual({ tick: 0, type: 'wave_start', wave: 1 });
  });

  it('fires no crab shot while a wave is arriving', () => {
    const l = levelById(1);
    const s = createGame('arrival-noshots', { mode: 'campaign', level: l, lives: 5, features: { boosts: false }, octopi: 'base' });
    for (let i = 0; i < ARRIVAL.ticks; i++) {
      step(s, INITIAL_INPUT);
      expect(s.enemyShots).toHaveLength(0);
    }
  });

  it('does not march or test invasion while arriving', () => {
    const l = levelById(1);
    const s = createGame('arrival-nomarch', { mode: 'campaign', level: l, lives: 5, features: { boosts: false }, octopi: 'base' });
    const x0 = s.crabs[0]!.x;
    step(s, INITIAL_INPUT);
    expect(s.crabs[0]!.x).toBe(x0); // x untouched during arrival, only y moves
    expect(s.over).toBe(false);
  });

  it('a wave spawned mid-level by nextWave also gets its full 30 descent ticks', () => {
    const l = levelById(1); // 2 waves
    const s = createGame('arrival-midlevel', { mode: 'campaign', level: l, lives: 5, features: { boosts: false }, octopi: 'base' });
    s.crabs = []; // clear wave 1 so this tick's end-of-step nextWave spawns wave 2
    step(s, INITIAL_INPUT);
    expect(s.wave).toBe(2);
    expect(s.arrival).toBe(ARRIVAL.ticks); // the full 30, not 29 — nothing was eaten by the transition tick

    // The slots wave 2's formation targets: every wave of a level spawns the same template.
    const slots = formationPositions(l.formation);
    expect(s.crabs).toHaveLength(slots.length);

    for (let i = 0; i < ARRIVAL.ticks; i++) step(s, INITIAL_INPUT);

    expect(s.arrival).toBe(0);
    s.crabs.forEach((c, i) => {
      expect(c.x).toBe(slots[i]!.x);
      expect(c.y).toBe(slots[i]!.y);
    });

    // The 31st step now marches sideways instead of continuing to descend.
    const x0 = s.crabs[0]!.x;
    const y0 = s.crabs[0]!.y;
    step(s, INITIAL_INPUT);
    expect(s.crabs[0]!.x).not.toBe(x0);
    expect(s.crabs[0]!.y).toBe(y0); // one march step, well short of the next wall/step-down
  });

  it('a wave wiped mid-arrival on the level\'s last wave leaves no stale arrival countdown once the level clears', () => {
    const l = levelById(1); // 2 waves, no boss
    const s = createGame('arrival-wipe-cleared', { mode: 'campaign', level: l, lives: 5, features: { boosts: false }, octopi: 'base' });
    s.wave = l.waves; // pretend the last wave is under way
    s.arrival = 15; // still mid-arrival
    s.crabs = []; // wiped (e.g. by WAVE_BLAST)
    step(s, INITIAL_INPUT);
    expect(s.cleared).toBe(true);
    expect(s.arrival).toBe(0);
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
