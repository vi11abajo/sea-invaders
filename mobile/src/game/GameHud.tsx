import { formatInt, type BoostType, type BossFrame } from '@sea-invaders/core';
import { Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { Hearts } from '../ui/Hearts';
import { GradientFill } from '../ui/GradientFill';
import { COLORS, FONTS, RADIUS } from '../ui/tokens';
import { BOSS_NAMES } from './bossNames';

/** One icon per `BoostType`, the same art the world drop uses (spec M1). */
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

/** A small tag beside the mode label, e.g. the campaign octopi a run is played with. */
export interface HudBadge {
  text: string;
  /** The tag's fill. */
  color: string;
}

/** Boss HP-bar tint per kind (1..5): spec §4.2 palette. */
const BOSS_COLOR = ['#33cc66', '#3366ff', '#ffdd33', '#ff3333', '#9966ff'];

interface GameHudProps {
  /** Mode label, e.g. "PRACTICE" or "DAILY · SEED #214". */
  mode: string;
  /** A tag beside the mode label (`LEVEL 8` then `HARPOON`); none when omitted. */
  badge?: HudBadge;
  score: number;
  lives: number;
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

/** The in-run HUD over the world. Only the pause button takes touches. */
export function GameHud({ mode, badge, score, lives, combo, boosts, shield = 0, boss, toast, hint, onPause }: GameHudProps) {
  // SHIELD_BARRIER is shown only by the dedicated "Shield ×N" chip below, never as its own "∞" entry.
  const timedBoosts = boosts?.filter((b) => b.type !== 'SHIELD_BARRIER') ?? [];
  const showBoosts = timedBoosts.length > 0;
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
        <View style={styles.right}>
          <View style={[styles.glass, styles.pill, styles.lives]}>
            <Hearts lives={lives} size={14} />
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

/** Name, HP bar with phase notches, shield pips and status tags: spec §4.3. */
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
      {boss.shieldHp > 0 && (
        <View style={styles.shieldPips}>
          {Array.from({ length: boss.shieldHp }, (_, i) => (
            <View key={i} style={styles.shieldPip} />
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  top: { position: 'absolute', top: 28, left: 16, right: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  glass: { backgroundColor: COLORS.hudGlass, borderWidth: 1, borderColor: COLORS.glassBorder },
  scoreCard: { borderRadius: RADIUS.hudCard, paddingHorizontal: 14, paddingVertical: 10 },
  mode: { fontFamily: FONTS.medium, fontSize: 10, letterSpacing: 0.4, color: COLORS.textSecondary },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  score: { fontFamily: FONTS.mono, fontSize: 26, lineHeight: 30, letterSpacing: -0.52, color: COLORS.text },
  right: { alignItems: 'flex-end', gap: 6 },
  pill: { borderRadius: RADIUS.pill, overflow: 'hidden' },
  lives: { flexDirection: 'row', paddingHorizontal: 10, paddingVertical: 8 },
  combo: { paddingHorizontal: 10, paddingVertical: 6 },
  comboText: { fontFamily: FONTS.mono, fontSize: 13, color: COLORS.text },
  comboHot: { color: COLORS.onPrimary },
  stack: { position: 'absolute', top: 100, left: 16, right: 16, gap: 8 },
  bossCard: { borderRadius: RADIUS.hudCard, padding: 10, gap: 6 },
  bossHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  bossName: { flex: 1, fontFamily: FONTS.medium, fontSize: 13, color: COLORS.text },
  bossTags: { flexDirection: 'row', gap: 4 },
  /** The HUD's small pill tags: the boss's RAGE / FROZEN and the octopi badge. */
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
