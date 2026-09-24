import { formatInt, type BoostType, type BossFrame } from '@sea-invaders/core';
import { Image, Pressable, StyleSheet, Text, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { Hearts } from '../ui/Hearts';
import { GradientFill } from '../ui/GradientFill';
import { COLORS, FONTS, RADIUS } from '../ui/tokens';
import { BOSS_HEX } from './bossPalette';
import { BOSS_NAMES } from './bossNames';

/** One icon per `BoostType`, the same art the world drop uses. */
const BOOST_ICON: Record<BoostType, ImageSourcePropType> = {
  RAPID_FIRE: require('../../assets/sprites/boosts/rapidFire.png'),
  ICE_FREEZE: require('../../assets/sprites/boosts/iceFreeze.png'),
  HEALTH_BOOST: require('../../assets/sprites/boosts/healthBoost.png'),
  POINTS_FREEZE: require('../../assets/sprites/boosts/pointsFreeze.png'),
  SHIELD_BARRIER: require('../../assets/sprites/boosts/shieldBarrier.png'),
  AUTO_TARGET: require('../../assets/sprites/boosts/autoTarget.png'),
  INVINCIBILITY: require('../../assets/sprites/boosts/invincibility.png'),
  MULTI_SHOT: require('../../assets/sprites/boosts/multiShot.png'),
  SCORE_MULTIPLIER: require('../../assets/sprites/boosts/scoreMultiplier.png'),
  WAVE_BLAST: require('../../assets/sprites/boosts/waveBlast.png'),
  COIN_SHOWER: require('../../assets/sprites/boosts/coinShower.png'),
  GRAVITY_WELL: require('../../assets/sprites/boosts/gravityWell.png'),
  PIERCING_BULLETS: require('../../assets/sprites/boosts/piercingBullets.png'),
  RANDOM_CHAOS: require('../../assets/sprites/boosts/randomChaos.png'),
  SPEED_TAMER: require('../../assets/sprites/boosts/speedTamer.png'),
};

export interface HudBoost {
  type: BoostType;
  name: string;
  /** Seconds remaining, or -1 for a boost that lasts until consumed (no timer to show). */
  seconds: number;
  /** SPEED_TAMER's stack count, shown instead of the "∞" a -1 `seconds` would otherwise render. */
  count?: number;
}

/** A small tag beside the mode label, e.g. the champion a campaign run is played with. */
export interface HudBadge {
  text: string;
  /** The tag's fill. */
  color: string;
}

/**
 * Boss HP-bar tint per kind (1..10). An alias of `bossPalette.ts`'s
 * `BOSS_HEX`, the single table `draw.ts` also reads — never declared twice.
 * The reef key art borrows it (`campaign/reefBackground.ts`).
 */
export const BOSS_COLOR: readonly string[] = BOSS_HEX;

interface GameHudProps {
  /** Mode label, e.g. "PRACTICE" or "DAILY · SEED #214". */
  mode: string;
  /** A tag beside the mode label (`LEVEL 8` then `AZUL`); none when omitted. */
  badge?: HudBadge;
  score: number;
  lives: number;
  /** The current wave (1-based); the wave pill shows while > 0 and no boss is on the field. */
  wave?: number;
  /** The level's wave count in the campaign; omitted in Daily Run and Practice (open-ended). */
  waves?: number;
  /** Shown only when the core reports a combo. */
  combo?: number;
  /** Shown only when the core reports active boosts. */
  boosts?: HudBoost[];
  /** Octopi's SHIELD_BARRIER hits left; a chip shows only when > 0. */
  shield?: number;
  /** The active boss, when the level has one. */
  boss?: BossFrame | null;
  /** A short line under the HUD, e.g. a pickup name. */
  toast?: string | null;
  hint?: string;
  onPause: () => void;
}

/**
 * Below this window width, in dp, the wave pill drops its `WAVE` word (`3 / 5`, `3`): on a 360 dp
 * phone `WAVE 3 / 5` beside a champion's badge and five hearts would ellipsise.
 */
const COMPACT_WAVE_BELOW = 380;

/** The in-run HUD over the world. Only the pause button takes touches. */
export function GameHud({ mode, badge, score, lives, wave = 0, waves, combo, boosts, shield = 0, boss, toast, hint, onPause }: GameHudProps) {
  const { width } = useWindowDimensions();
  // SHIELD_BARRIER is shown only by the dedicated "Shield ×N" chip below, never as its own "∞" entry.
  const timedBoosts = boosts?.filter((b) => b.type !== 'SHIELD_BARRIER') ?? [];
  const showBoosts = timedBoosts.length > 0;
  const waveCount = waves !== undefined ? `${wave} / ${waves}` : `${wave}`;
  return (
    <View style={styles.root} pointerEvents="box-none">
      <View style={styles.top} pointerEvents="none">
        <View style={[styles.glass, styles.scoreCard]}>
          {badge !== undefined ? (
            <View style={styles.modeRow} accessible accessibilityLabel={`${mode} · ${badge.text}`}>
              <Text style={styles.mode}>{mode}</Text>
              <View style={[styles.tag, { backgroundColor: badge.color }]}>
                <Text style={styles.tagText}>{badge.text}</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.mode}>{mode}</Text>
          )}
          <Text style={styles.score}>{formatInt(score)}</Text>
        </View>
        {wave > 0 && !boss && (
          // The gap between the score card and the hearts carries the wave —
          // `WAVE 3` in Daily Run and Practice, `WAVE 3 / 5` on a campaign level; on a window narrower
          // than `COMPACT_WAVE_BELOW` just `3` / `3 / 5`. Hidden while a boss stands, when the boss bar
          // below says what matters.
          <View style={[styles.glass, styles.pill, styles.wavePill]}>
            <Text style={styles.waveText} numberOfLines={1} accessibilityLabel={`Wave ${waveCount}`}>
              {width < COMPACT_WAVE_BELOW ? waveCount : `WAVE ${waveCount}`}
            </Text>
          </View>
        )}
        <View style={styles.right}>
          <View style={[styles.glass, styles.pill, styles.lives]}>
            <Hearts lives={lives} size={11} gap={2} />
          </View>
          {combo !== undefined && <ComboPill combo={combo} />}
        </View>
      </View>
      <View style={styles.stack} pointerEvents="none">
        {boss != null && <BossBar boss={boss} />}
        {(showBoosts || shield > 0) && (
          <View style={styles.boosts}>
            {timedBoosts.map((b) => (
              <View key={b.type} style={[styles.glass, styles.pill, styles.chip]}>
                <Image source={BOOST_ICON[b.type]} style={styles.chipIcon} resizeMode="contain" />
                <Text style={styles.chipName}>{b.name}</Text>
                <Text style={styles.chipTime}>{b.count !== undefined ? `×${b.count}` : b.seconds < 0 ? '∞' : `${b.seconds}s`}</Text>
              </View>
            ))}
            {shield > 0 && (
              <View style={[styles.glass, styles.pill, styles.chip]}>
                <Image source={BOOST_ICON.SHIELD_BARRIER} style={styles.chipIcon} resizeMode="contain" />
                <Text style={styles.chipName}>Shield</Text>
                <Text style={styles.chipTime}>{`×${shield}`}</Text>
              </View>
            )}
          </View>
        )}
        {toast != null && (
          <Text style={styles.toast} numberOfLines={1}>
            {toast}
          </Text>
        )}
      </View>
      {hint !== undefined && (
        <Text style={styles.hint} pointerEvents="none">
          {hint}
        </Text>
      )}
      <Pressable accessibilityRole="button" accessibilityLabel="Pause" onPress={onPause} style={[styles.glass, styles.pause]}>
        <View style={styles.pauseBar} />
        <View style={styles.pauseBar} />
      </Pressable>
    </View>
  );
}

/** Combo multiplier; from x4 it turns into a gradient pill with black text. */
function ComboPill({ combo }: { combo: number }) {
  const hot = combo >= 4;
  return (
    <View style={[styles.glass, styles.pill, styles.combo]}>
      {hot && <GradientFill radius={RADIUS.pill} />}
      <Text style={[styles.comboText, hot && styles.comboHot]}>{`×${combo}`}</Text>
    </View>
  );
}

/**
 * Above this many shield hit points, the pips give way to a "Shield ×N" count (the Huntsman's
 * defence mirror sets `shieldHp` to 40, which would otherwise spill 40 pips out of the card).
 * Azure's water shield (5) is well under the cap and keeps its pips unchanged.
 */
const SHIELD_PIP_CAP = 10;

/** Name, HP bar with phase notches, shield pips and status tags. */
function BossBar({ boss }: { boss: BossFrame }) {
  const color = BOSS_COLOR[boss.kind - 1] ?? COLORS.text;
  const name = BOSS_NAMES[boss.kind - 1] ?? `Boss ${boss.kind}`;
  const pct = boss.maxHp > 0 ? Math.max(0, Math.min(1, boss.hp / boss.maxHp)) : 0;
  const notchCount = Math.max(0, boss.maxPhases - 1);
  const notches = Array.from({ length: notchCount }, (_, i) => ((i + 1) / boss.maxPhases) * 100);
  return (
    <View style={[styles.glass, styles.bossCard]}>
      <View style={styles.bossHead}>
        <Text style={styles.bossName} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.bossTags}>
          {boss.rage === 1 && (
            <View style={[styles.tag, styles.rageTag]}>
              <Text style={styles.tagText}>RAGE</Text>
            </View>
          )}
          {boss.freeze > 0 && (
            <View style={[styles.tag, styles.freezeTag]}>
              <Text style={styles.tagText}>FROZEN</Text>
            </View>
          )}
        </View>
      </View>
      <View style={styles.bossBarTrack}>
        <View style={[styles.bossBarFill, { width: `${pct * 100}%`, backgroundColor: color }]} />
        {notches.map((left) => (
          <View key={left} style={[styles.bossNotch, { left: `${left}%` }]} />
        ))}
      </View>
      {boss.shieldHp > 0 &&
        (boss.shieldHp > SHIELD_PIP_CAP ? (
          <Text style={styles.chipTime}>{`Shield ×${boss.shieldHp}`}</Text>
        ) : (
          <View style={styles.shieldPips}>
            {Array.from({ length: boss.shieldHp }, (_, i) => (
              <View key={i} style={styles.shieldPip} />
            ))}
          </View>
        ))}
    </View>
  );
}

/** One height for the wave pill and the hearts pill, centred on the score card's own middle. */
const HUD_PILL_HEIGHT = 38;

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // The three top-row pieces sit on one centre line and the two pills
  // share one height, so the row reads as a single bar rather than three loose boxes.
  // With a champion's badge widening the score card and five
  // hearts in the pill, the row ran past the right edge on a 400 dp screen — the hearts pill was
  // pushed off it. The budget, in dp of the window width less 32: the score card 150, up to ~160
  // with a champion's badge (`LEVEL 60` + `CORALUNA`); the wave pill 94 as `WAVE 3 / 5`, 58 as the
  // compact `3 / 5` shown below `COMPACT_WAVE_BELOW`; the hearts pill 30 plus five glyphs (drawn in
  // a system fallback font, width not measured); two 10 dp gaps. The wave pill is the one piece
  // allowed to shrink (and ellipsise) when the rest leave it short; `right` never shrinks, so the
  // hearts always stay on screen.
  top: { position: 'absolute', top: 28, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  glass: { backgroundColor: COLORS.hudGlass, borderWidth: 1, borderColor: COLORS.glassBorder },
  // `minWidth`/`paddingRight`: a seven-digit mono score measured narrower than it rendered and ran
  // past the card's edge.
  scoreCard: { borderRadius: RADIUS.hudCard, paddingHorizontal: 16, paddingVertical: 10, minWidth: 150, justifyContent: 'center' },
  mode: { fontFamily: FONTS.medium, fontSize: 10, letterSpacing: 0.4, color: COLORS.textSecondary },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  score: { fontFamily: FONTS.mono, fontSize: 26, lineHeight: 30, letterSpacing: -0.52, color: COLORS.text, paddingRight: 2 },
  wavePill: { height: HUD_PILL_HEIGHT, justifyContent: 'center', paddingHorizontal: 10, flexShrink: 1, minWidth: 0 },
  waveText: { fontFamily: FONTS.mono, fontSize: 11, letterSpacing: 0.6, color: COLORS.textSecondary },
  right: { alignItems: 'flex-end', justifyContent: 'center', gap: 6, flexShrink: 0 },
  pill: { borderRadius: RADIUS.pill, overflow: 'hidden' },
  lives: { height: HUD_PILL_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 },
  combo: { paddingHorizontal: 10, paddingVertical: 6 },
  comboText: { fontFamily: FONTS.mono, fontSize: 13, color: COLORS.text },
  comboHot: { color: COLORS.onPrimary },
  stack: { position: 'absolute', top: 100, left: 16, right: 16, gap: 8 },
  bossCard: { borderRadius: RADIUS.hudCard, padding: 10, gap: 6 },
  bossHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  bossName: { flex: 1, fontFamily: FONTS.medium, fontSize: 13, color: COLORS.text },
  bossTags: { flexDirection: 'row', gap: 4 },
  /** The HUD's small pill tags: the boss's RAGE / FROZEN and the champion badge. */
  tag: { borderRadius: RADIUS.pill, paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontFamily: FONTS.medium, fontSize: 9, letterSpacing: 0.4, color: COLORS.text },
  rageTag: { backgroundColor: 'rgba(255,51,51,0.35)' },
  freezeTag: { backgroundColor: 'rgba(51,153,255,0.35)' },
  bossBarTrack: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.14)', overflow: 'hidden' },
  bossBarFill: { position: 'absolute', top: 0, bottom: 0, left: 0, borderRadius: 5 },
  bossNotch: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  shieldPips: { flexDirection: 'row', gap: 4 },
  shieldPip: { width: 8, height: 8, borderRadius: 2, backgroundColor: COLORS.info },
  boosts: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { height: 26, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipIcon: { width: 18, height: 18 },
  chipName: { fontFamily: FONTS.regular, fontSize: 11, color: COLORS.text },
  chipTime: { fontFamily: FONTS.mono, fontSize: 11, color: COLORS.textSecondary },
  toast: { fontFamily: FONTS.regular, fontSize: 11, color: 'rgba(255,255,255,0.72)' },
  hint: { position: 'absolute', left: 16, right: 80, bottom: 44, fontFamily: FONTS.regular, fontSize: 11, color: 'rgba(255,255,255,0.55)' },
  pause: {
    position: 'absolute', right: 16, bottom: 28, width: 48, height: 48, borderRadius: 24,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  pauseBar: { width: 4, height: 14, borderRadius: 1, backgroundColor: COLORS.text },
});
