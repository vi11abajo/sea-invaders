import { describe, expect, it } from 'vitest';
import { BOOSTS, DAILY_RUN, DROP, INITIAL_INPUT, PRACTICE_RUN, activateBoost, createGame, hitCrabs, isActive, rollDrop, step, updateBoosts } from '../src';

describe('boost drops', () => {
  it('drops 7% of kills with the legacy rarity split', () => {
    const s = createGame('d', DAILY_RUN);
    const counts = { common: 0, rare: 0, epic: 0, legendary: 0 };
    let drops = 0;
    for (let i = 0; i < 100_000; i++) {
      s.drops = [];
      rollDrop(s, 1000, 1000);
      if (s.drops.length) { drops += 1; counts[BOOSTS[s.drops[0]!.boost].rarity] += 1; }
    }
    expect(drops / 100_000).toBeGreaterThan(0.065); expect(drops / 100_000).toBeLessThan(0.075);
    expect(counts.common / drops).toBeGreaterThan(0.47); expect(counts.legendary / drops).toBeLessThan(0.045);
  });
  it('never drops when boosts are off', () => {
    const s = createGame('d', { ...PRACTICE_RUN, features: { boosts: false } });
    for (let i = 0; i < 1000; i++) rollDrop(s, 1000, 1000);
    expect(s.drops).toHaveLength(0);
  });
  it('falls, expires and is picked up by the ship', () => {
    const s = createGame('d', DAILY_RUN);
    s.drops.push({ x: 2812, y: 9000, boost: 'RAPID_FIRE', ttl: DROP.ttl });
    updateBoosts(s);
    expect(s.drops[0]!.y).toBe(9060);
    s.drops[0]!.ttl = 1; updateBoosts(s); expect(s.drops).toHaveLength(0);
    s.drops.push({ x: s.ship.x, y: s.ship.y, boost: 'RAPID_FIRE', ttl: 100 });
    updateBoosts(s);
    expect(s.drops).toHaveLength(0);
    expect(isActive(s, 'RAPID_FIRE')).toBe(true);
    expect(s.events.at(-1)).toMatchObject({ type: 'boost_pickup', boost: 'RAPID_FIRE' });
  });
  it('timers count down and expire with an event; a second pickup resets the timer', () => {
    const s = createGame('d', DAILY_RUN);
    activateBoost(s, 'RAPID_FIRE');
    for (let i = 0; i < 300; i++) updateBoosts(s);
    expect(s.boosts.active[0]!.ticksLeft).toBe(300);
    activateBoost(s, 'RAPID_FIRE');
    expect(s.boosts.active[0]!.ticksLeft).toBe(600);
    for (let i = 0; i < 600; i++) updateBoosts(s);
    expect(isActive(s, 'RAPID_FIRE')).toBe(false);
    expect(s.events.at(-1)).toMatchObject({ type: 'boost_expire', boost: 'RAPID_FIRE' });
  });
  it('uses the boosts stream, not the wave or fire streams', () => {
    const a = createGame('d', DAILY_RUN), b = createGame('d', DAILY_RUN);
    for (let i = 0; i < 50; i++) rollDrop(a, 0, 0);
    expect([b.rngWaves.a, b.rngFire.a]).toEqual([a.rngWaves.a, a.rngFire.a]);
  });
});
