import { FIELD_W } from '../../config';
import type { Rng } from '../../rng';
import { castExplosive, castMeteor, castRing, castStraight, muzzle } from '../boss';
import type { BossHooks } from './index';

/** Solar's ability timer: 12-18 s. */
function abilityTimer(rng: Rng): number {
  return 720 + rng.nextInt(361);
}

/** Cast ids >= this offset encode a meteor-shower drop's spawn x (spec §4.1 `meteor`, §4.2 row 3). */
const METEOR_CAST_OFFSET = 1_000_000;

/**
 * Solar Kraken (`crabBossYellow`, kind 3, spec §4.2 row 3): straight shots sped up 22% in phase 1,
 * an 8-shot ring sped up 11% in phase 2, and 5 explosive shots in phase 3. Its meteor shower drops
 * 8-12 meteors from above the field, each preceded by a 60-tick warning at a random x.
 */
export const SOLAR_HOOKS: BossHooks = {
  attack(s, b) {
    const m = muzzle(b);
    if (b.phase === 1) castStraight(s, m.x, m.y, 1220);
    else if (b.phase === 2) castRing(s, m.x, m.y, 8, 1110, 0);
    else castExplosive(s, m.x, m.y, 5);
  },
  ability(s, b) {
    const n = 8 + s.rngBoss.nextInt(5);
    for (let i = 0; i < n; i++) {
      const x = 300 + s.rngBoss.nextInt(FIELD_W - 600 + 1);
      b.pending.push(60, METEOR_CAST_OFFSET + x);
      s.events.push({ tick: s.tick, type: 'meteor_warning', x });
    }
    s.events.push({ tick: s.tick, type: 'boss_ability', name: 'meteor' });
  },
  initialAbilityTimer: abilityTimer,
  nextAbilityTimer: abilityTimer,
  cast(s, _b, id) {
    if (id >= METEOR_CAST_OFFSET) castMeteor(s, id - METEOR_CAST_OFFSET, -200, 800);
  },
};
