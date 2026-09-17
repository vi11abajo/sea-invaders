import {
  Blur, Canvas, Circle, ColorMatrix, DashPathEffect, Group, Image, Paint, Path, Skia,
  type SkImage,
} from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  Easing, interpolate, useAnimatedStyle, useSharedValue, withRepeat, withTiming,
} from 'react-native-reanimated';
import {
  currentLevelId, formatInt, levelById, LEVELS_PER_REEF, livesForEntry, REEFS, TYPE_COLOUR,
  type CampaignProgress,
} from '@sea-invaders/core';
import { hapticLight, hapticTap } from '../audio/haptics';
import { onBackPress } from '../audio/onBackPress';
import { playSfx } from '../audio/sfx';
import { BOSS_NAMES } from '../game/bossNames';
import { useSprites, type Sprites } from '../game/sprites';
import { ArtSlot } from '../ui/ArtSlot';
import { PillButton } from '../ui/PillButton';
import { Sheet } from '../ui/Sheet';
import { Txt } from '../ui/Txt';
import { COLORS, MOTION, RADIUS } from '../ui/tokens';
import {
  BOSS_ABILITY, REEF_ACCENT, REEF_LEGENDS, REEF_NAMES, REEF_NEW_KIND, levelState, reefNewEnemyCopy,
  reefProgress, type LevelState,
} from './reefs';
import { ReefBackdrop } from './ReefBackdrop';
import { REEF_KEY_ART_BACKGROUND, REEF_KEY_ART_PATH, REEF_KEY_ART_TEXT_SHADOW } from './reefBackground';

// The header reads "REEF n OF 6": a literal 6, not core's `REEFS` (5) — it counts the mock's
// six-reef table (reef 6 is the unbuilt "coming" placeholder in the rail), spec §"Campaign map".
const REEFS_SHOWN = 6;

/** The design reference box the node centres below are laid out in; both axes scale to the real map box. */
const DESIGN_BOX = { width: 368, height: 604 };
const NODE_SIZE = 52;
const NODE_RADIUS = 16;
const BOSS_SIZE = 96;
const BOSS_RADIUS = 26;
/** Node top-left corners, level 1 (bottom) -> boss (top), `CampaignMap.dc.html`'s `POS` table. */
const NODE_POS: readonly { x: number; y: number }[] = [
  { x: 54, y: 500 }, { x: 158, y: 412 }, { x: 68, y: 322 }, { x: 196, y: 240 }, { x: 96, y: 150 }, { x: 226, y: 34 },
];
const DASH_INTERVALS = [2, 9];
const DASH_PERIOD = DASH_INTERVALS[0] + DASH_INTERVALS[1];
const DASH_DURATION_MS = 2400;
/** The connector's stroke and opacity: the design's on the gradient world, a little bolder on the key art. */
const pathLook = REEF_KEY_ART_BACKGROUND ? REEF_KEY_ART_PATH : { strokeWidth: 2, opacity: 0.55 };


/** The map's seabed dome and flora sit this far above the screen's bottom edge, clear of the bottom panel. */
const MAP_FLOOR_BOTTOM = 150;

/** Saturation-0 colour matrix: a locked boss sprite (node, rail chip) draws through this. */
const GREYSCALE_MATRIX = [
  0.2126, 0.7152, 0.0722, 0, 0,
  0.2126, 0.7152, 0.0722, 0, 0,
  0.2126, 0.7152, 0.0722, 0, 0,
  0, 0, 0, 1, 0,
];


type SheetState = { kind: 'level'; id: number } | { kind: 'boss'; reef: number };

interface CampaignScreenProps {
  progress: CampaignProgress;
  /** The reef to open on; defaults to the reef currently being played. */
  initialReef?: number;
  onPlay: (id: number, practice: boolean) => void;
  onBack: () => void;
}

/** The campaign map: one world per reef, a dotted level path up to the boss, and a reef rail. */
export function CampaignScreen({ progress, initialReef, onPlay, onBack }: CampaignScreenProps) {
  const sprites = useSprites();
  const [reef, setReef] = useState(initialReef ?? progress.reef);

  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = withTiming(1, { duration: MOTION.riseMs, easing: Easing.out(Easing.cubic) });
  }, [shown]);
  const rise = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * MOTION.riseOffset }],
  }));

  const [sheet, setSheet] = useState<SheetState | null>(null);
  const bossSprite = sprites?.bosses[reef - 1]?.[0] ?? null;

  // System back: closes an open level/boss sheet first; only leaves to Home once none is open.
  // Local to this screen (like every other screen's own handler in this app) — App.tsx registers
  // no global BackHandler, so there is nothing here to conflict with.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheet !== null) setSheet(null);
      else onBack();
      return true;
    });
    return () => sub.remove();
  }, [sheet, onBack]);

  return (
    <Animated.View style={[styles.root, rise]}>
      <ReefContent
        key={reef}
        reef={reef}
        progress={progress}
        sprites={sprites}
        bossSprite={bossSprite}
        onBack={onBack}
        onSelectReef={setReef}
        onOpenLevel={(id) => setSheet({ kind: 'level', id })}
        onOpenBoss={() => setSheet({ kind: 'boss', reef })}
        onPlay={onPlay}
      />
      {sheet !== null &&
        (sheet.kind === 'boss' ? (
          <BossSheet reef={sheet.reef} progress={progress} sprites={sprites} onPlay={onPlay} onClose={() => setSheet(null)} />
        ) : (
          <LevelSheetView id={sheet.id} progress={progress} sprites={sprites} onPlay={onPlay} onClose={() => setSheet(null)} />
        ))}
    </Animated.View>
  );
}

interface ReefContentProps {
  reef: number;
  progress: CampaignProgress;
  sprites: Sprites | null;
  bossSprite: SkImage | null;
  onBack: () => void;
  onSelectReef: (reef: number) => void;
  onOpenLevel: (id: number) => void;
  onOpenBoss: () => void;
  onPlay: (id: number, practice: boolean) => void;
}

/** One reef's map, remounted (via the `key={reef}` above) on every reef switch — a quick 150 ms fade-in stands in for a cross-fade. */
function ReefContent({ reef, progress, sprites, bossSprite, onBack, onSelectReef, onOpenLevel, onOpenBoss, onPlay }: ReefContentProps) {
  const fade = useSharedValue(0);
  useEffect(() => {
    fade.value = withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) });
  }, [fade]);
  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  return (
    <Animated.View style={[styles.fill, fadeStyle]}>
      <ReefBackdrop reef={reef} bossSprite={bossSprite} floorBottom={MAP_FLOOR_BOTTOM} />
      <View style={styles.column}>
        <Header reef={reef} progress={progress} onBack={onBack} />
        <PathLayer reef={reef} progress={progress} bossSprite={bossSprite} onOpenLevel={onOpenLevel} onOpenBoss={onOpenBoss} />
      </View>
      <BottomPanel reef={reef} progress={progress} sprites={sprites} onPlay={onPlay} onOpenLevelSheet={onOpenLevel} onSelectReef={onSelectReef} />
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

function Header({ reef, progress, onBack }: { reef: number; progress: CampaignProgress; onBack: () => void }) {
  const rp = reefProgress(progress, reef);
  const lives = livesForEntry(progress);

  return (
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBackPress(onBack)} hitSlop={4} style={styles.back}>
        <Txt variant="button">←</Txt>
      </Pressable>
      <View style={styles.headerText}>
        <Txt variant="monoSmall" tone="secondary" style={[styles.kicker, REEF_KEY_ART_TEXT_SHADOW]} numberOfLines={1}>
          {`REEF ${reef} OF ${REEFS_SHOWN} · ${rp.cleared} of ${LEVELS_PER_REEF} cleared`}
        </Txt>
        <Txt variant="headline" numberOfLines={1} style={REEF_KEY_ART_TEXT_SHADOW}>
          {REEF_NAMES[reef - 1]}
        </Txt>
      </View>
      <View style={styles.livesPill} accessible accessibilityLabel={`${Math.max(0, Math.min(5, lives))} of 5 reef lives`}>
        {Array.from({ length: 5 }, (_, i) => (
          <View key={i} style={[styles.lifeDot, { backgroundColor: i < lives ? COLORS.success : 'rgba(255,255,255,0.22)' }]} />
        ))}
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Path: the dashed connector and the six nodes
// ---------------------------------------------------------------------------

interface PathLayerProps {
  reef: number;
  progress: CampaignProgress;
  bossSprite: SkImage | null;
  onOpenLevel: (id: number) => void;
  onOpenBoss: () => void;
}

function PathLayer({ reef, progress, bossSprite, onOpenLevel, onOpenBoss }: PathLayerProps) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setBox({ width, height });
  };

  const accent = REEF_ACCENT[reef - 1]!;
  const first = (reef - 1) * LEVELS_PER_REEF + 1;
  const scaleX = box !== null ? box.width / DESIGN_BOX.width : 1;
  const scaleY = box !== null ? box.height / DESIGN_BOX.height : 1;

  // Centres, scaled to the real box — built once per layout, not per frame.
  const path = useMemo(() => {
    const p = Skia.Path.Make();
    NODE_POS.forEach((pos, i) => {
      const size = i === 5 ? BOSS_SIZE : NODE_SIZE;
      const cx = pos.x * scaleX + size / 2;
      const cy = pos.y * scaleY + size / 2;
      if (i === 0) p.moveTo(cx, cy);
      else p.lineTo(cx, cy);
    });
    return p;
  }, [scaleX, scaleY]);

  const phase = useSharedValue(0);
  useEffect(() => {
    phase.value = withRepeat(withTiming(-DASH_PERIOD * 2, { duration: DASH_DURATION_MS, easing: Easing.linear }), -1, false);
  }, [phase]);

  return (
    <View style={styles.pathBox} onLayout={onLayout}>
      {box !== null && (
        <>
          <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
            <Path path={path} style="stroke" strokeWidth={pathLook.strokeWidth} strokeCap="round" color={accent} opacity={pathLook.opacity}>
              <DashPathEffect intervals={DASH_INTERVALS} phase={phase} />
            </Path>
          </Canvas>
          {NODE_POS.map((pos, i) => {
            const id = first + i;
            const isBoss = i === 5;
            const size = isBoss ? BOSS_SIZE : NODE_SIZE;
            return (
              <PathNode
                key={id}
                reef={reef}
                index={i + 1}
                isBoss={isBoss}
                size={size}
                left={pos.x * scaleX}
                top={pos.y * scaleY}
                accent={accent}
                state={levelState(progress, id)}
                best={progress.best[id - 1] ?? 0}
                bossSprite={isBoss ? bossSprite : null}
                onPress={() => (isBoss ? onOpenBoss() : onOpenLevel(id))}
              />
            );
          })}
        </>
      )}
    </View>
  );
}

interface PathNodeProps {
  reef: number;
  index: number;
  isBoss: boolean;
  size: number;
  left: number;
  top: number;
  accent: string;
  state: LevelState;
  best: number;
  bossSprite: SkImage | null;
  onPress: () => void;
}

function PathNode({ reef, index, isBoss, size, left, top, accent, state, best, bossSprite, onPress }: PathNodeProps) {
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (state !== 'current') {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(withTiming(0.25, { duration: 800, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [state, pulse]);
  // Matches `CampaignMap.dc.html`'s `ringPulse`: opacity 1->.25 and scale 1->1.12 move together.
  const ringStyle = useAnimatedStyle(() => ({
    opacity: state === 'current' ? pulse.value : 0,
    transform: [{ scale: interpolate(pulse.value, [0.25, 1], [1.12, 1]) }],
  }));

  const locked = state === 'locked';
  const radius = isBoss ? BOSS_RADIUS : NODE_RADIUS;
  const borderColor = state === 'locked' ? 'rgba(236,228,253,0.14)' : accent;
  const borderWidth = state === 'current' ? 1.5 : 1;
  const bg = state === 'cleared' ? 'rgba(18,18,18,0.55)' : state === 'current' ? 'rgba(18,18,18,0.72)' : 'rgba(8,8,10,0.6)';
  const spriteBox = size * 0.86;

  const label = isBoss ? undefined : `${reef}-${index}`;
  const a11yLabel = isBoss
    ? `Reef ${reef} boss, ${BOSS_NAMES[reef - 1]}${locked ? ', locked' : state === 'cleared' ? ', cleared' : ''}`
    : `Level ${reef}-${index}${locked ? ', locked' : state === 'cleared' ? `, cleared, best ${formatInt(best)}` : ''}`;

  return (
    <View style={[styles.nodeWrap, { left, top, width: size }]} pointerEvents="box-none">
      {state === 'current' && <NodeGlow size={size} color={accent} />}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityState={{ disabled: locked }}
        disabled={locked}
        onPress={() => {
          playSfx('node_tap');
          hapticTap();
          onPress();
        }}
        style={[
          styles.node,
          { width: size, height: size, borderRadius: radius, borderWidth, borderColor, backgroundColor: bg },
        ]}
      >
        {isBoss ? (
          bossSprite !== null ? (
            <Canvas style={{ width: spriteBox, height: spriteBox }}>
              <Image image={bossSprite} x={0} y={0} width={spriteBox} height={spriteBox} fit="contain">
                {locked && <ColorMatrix matrix={GREYSCALE_MATRIX} />}
              </Image>
            </Canvas>
          ) : (
            <ArtSlot size={size * 0.7} label="Boss" />
          )
        ) : (
          <Txt variant="mono" style={[styles.nodeLabel, locked && styles.nodeLabelLocked]}>
            {label}
          </Txt>
        )}
        {state === 'current' && (
          <Animated.View pointerEvents="none" style={[styles.ring, { borderRadius: radius + 5, borderColor: accent }, ringStyle]} />
        )}
      </Pressable>
      {state === 'cleared' && !isBoss && (
        <Txt variant="monoSmall" tone="secondary">
          {formatInt(best)}
        </Txt>
      )}
      {isBoss && (
        <Txt variant="secondary" numberOfLines={1} style={[styles.bossName, { color: locked ? 'rgba(255,255,255,0.5)' : accent }]}>
          {BOSS_NAMES[reef - 1]}
        </Txt>
      )}
    </View>
  );
}

/** A soft blurred glow behind the current node, approximating the design's `box-shadow 0 0 26px`. */
function NodeGlow({ size, color }: { size: number; color: string }) {
  const pad = 30;
  const box = size + pad * 2;
  return (
    <Canvas style={[styles.glow, { width: box, height: box, left: -pad, top: -pad }]} pointerEvents="none">
      <Group layer={<Paint><Blur blur={13} mode="decal" /></Paint>}>
        <Circle cx={box / 2} cy={box / 2} r={size / 2} color={color} opacity={0.4} />
      </Group>
    </Canvas>
  );
}

// ---------------------------------------------------------------------------
// Bottom panel: CTA + reef rail
// ---------------------------------------------------------------------------

interface BottomPanelProps {
  reef: number;
  progress: CampaignProgress;
  sprites: Sprites | null;
  onPlay: (id: number, practice: boolean) => void;
  onOpenLevelSheet: (id: number) => void;
  onSelectReef: (reef: number) => void;
}

function BottomPanel({ reef, progress, sprites, onPlay, onOpenLevelSheet, onSelectReef }: BottomPanelProps) {
  const rp = reefProgress(progress, reef);
  const first = (reef - 1) * LEVELS_PER_REEF + 1;

  let kicker: string;
  let title: string;
  let ctaLabel: string;
  let ctaDisabled = false;
  let ctaOnPress = () => {};

  if (rp.current) {
    const id = currentLevelId(progress);
    const index = id - first + 1;
    kicker = 'Next level';
    title = index === LEVELS_PER_REEF ? BOSS_NAMES[reef - 1]! : `${REEF_NAMES[reef - 1]} · ${reef}-${index}`;
    ctaLabel = 'Play';
    ctaOnPress = () => onPlay(id, false);
  } else if (rp.reefCleared) {
    kicker = reef === REEFS ? 'Campaign complete' : 'Reef cleared';
    title = 'Replay any level, unranked';
    ctaLabel = 'Replay';
    ctaOnPress = () => onOpenLevelSheet(first);
  } else {
    kicker = 'Locked';
    title = `Clear reef ${reef - 1} first`;
    ctaLabel = 'Locked';
    ctaDisabled = true;
  }

  return (
    <View style={styles.panel}>
      <View style={styles.ctaRow}>
        <View style={styles.ctaText}>
          <Txt variant="secondary" tone="secondary" numberOfLines={1}>
            {kicker}
          </Txt>
          <Txt variant="button" numberOfLines={1}>
            {title}
          </Txt>
        </View>
        <PillButton label={ctaLabel} height={52} onPress={ctaOnPress} disabled={ctaDisabled} />
      </View>
      <ReefRail reef={reef} progress={progress} sprites={sprites} onSelect={onSelectReef} />
    </View>
  );
}

function ReefRail({ reef, progress, sprites, onSelect }: {
  reef: number; progress: CampaignProgress; sprites: Sprites | null; onSelect: (reef: number) => void;
}) {
  return (
    <View style={styles.rail}>
      {Array.from({ length: REEFS_SHOWN }, (_, i) => {
        if (i === REEFS) return <UnknownReefChip key="unknown" />;
        const n = i + 1;
        const active = n === reef;
        const reachable = !reefProgress(progress, n).locked;
        const accent = REEF_ACCENT[i]!;
        const sprite = sprites?.bosses[i]?.[0] ?? null;
        return (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={`Reef ${n}, ${REEF_NAMES[i]}`}
            onPress={() => {
              hapticLight();
              onSelect(n);
            }}
            style={[
              styles.railChip,
              active ? { borderColor: accent, backgroundColor: 'rgba(236,228,253,0.14)' } : styles.railChipInactive,
              !reachable && !active && styles.railChipDim,
            ]}
          >
            {sprite !== null ? (
              <Canvas style={styles.railIcon}>
                <Image image={sprite} x={0} y={0} width={32} height={32} fit="contain">
                  {!reachable && <ColorMatrix matrix={GREYSCALE_MATRIX} />}
                </Image>
              </Canvas>
            ) : (
              <ArtSlot size={32} />
            )}
            <Txt variant="monoSmall" style={{ color: active ? COLORS.text : 'rgba(255,255,255,0.6)' }}>
              {String(n)}
            </Txt>
            {active && <View style={[styles.railUnderline, { backgroundColor: accent }]} />}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Rail chip 6: no sixth reef exists in the game yet — a stylised "?" that does nothing when tapped. */
function UnknownReefChip() {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Reef 6, coming soon"
      accessibilityState={{ disabled: true }}
      disabled
      style={[styles.railChip, styles.railChipInactive]}
    >
      <View style={styles.unknownGlyphBox}>
        <Txt variant="button" style={styles.unknownGlyph}>
          ?
        </Txt>
      </View>
      <Txt variant="monoSmall" tone="secondary">
        6
      </Txt>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

const SHEET_SPRITE_BOX = 60;

function SheetHead({ sprite, kicker, title, subtitle }: { sprite: SkImage | null; kicker: string; title: string; subtitle: string }) {
  return (
    <View style={styles.sheetHead}>
      <View style={styles.sheetTile}>
        {sprite !== null ? (
          <Canvas style={{ width: SHEET_SPRITE_BOX, height: SHEET_SPRITE_BOX }}>
            <Image image={sprite} x={0} y={0} width={SHEET_SPRITE_BOX} height={SHEET_SPRITE_BOX} fit="contain" />
          </Canvas>
        ) : (
          <ArtSlot size={SHEET_SPRITE_BOX} />
        )}
      </View>
      <View style={styles.sheetHeadText}>
        <Txt variant="monoSmall" tone="secondary" style={styles.sheetKicker}>
          {kicker}
        </Txt>
        <Txt variant="headline" numberOfLines={1}>
          {title}
        </Txt>
        <Txt variant="secondary" tone="secondary" numberOfLines={2}>
          {subtitle}
        </Txt>
      </View>
    </View>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tile}>
      <Txt variant="secondary" tone="tertiary" style={styles.tileLabel}>
        {label}
      </Txt>
      <Txt variant="mono" style={styles.tileValue}>
        {value}
      </Txt>
    </View>
  );
}

/** Owner request 2026-09-13: the reef legends return as an info panel inside the level/boss sheet. */
type SheetView = 'main' | 'info';

/** A round "i" toggle pinned to the sheet card's own top-left corner, over the tile — visible in both sheet views. */
function InfoButton({ onPress, active }: { onPress: () => void; active: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Level info"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={styles.infoButton}
      hitSlop={6}
    >
      <Txt variant="body" tone="secondary">
        i
      </Txt>
    </Pressable>
  );
}

interface InfoRowSpec {
  label: string;
  value: string;
}

function InfoRow({ label, value }: InfoRowSpec) {
  return (
    <View style={styles.infoRow}>
      <Txt variant="secondary" tone="secondary">
        {label}
      </Txt>
      <Txt variant="mono" style={styles.tileValue}>
        {value}
      </Txt>
    </View>
  );
}

/** The reef-legend info view, shared by the level and boss sheets (only the row data differs). */
function ReefInfoView({ reef, rows, onBack }: { reef: number; rows: readonly InfoRowSpec[]; onBack: () => void }) {
  return (
    <>
      <Txt variant="monoSmall" tone="secondary" style={styles.sheetKicker}>
        {`REEF ${reef} · ${REEF_NAMES[reef - 1].toUpperCase()}`}
      </Txt>
      <Txt variant="headline">About this reef</Txt>
      <Txt variant="body" tone="secondary">
        {REEF_LEGENDS[reef - 1]}
      </Txt>
      <View style={styles.infoRows}>
        {rows.map((row) => (
          <InfoRow key={row.label} label={row.label} value={row.value} />
        ))}
      </View>
      <PillButton label="Back to level" height={56} onPress={onBack} />
    </>
  );
}

interface LevelSheetProps {
  id: number;
  progress: CampaignProgress;
  sprites: Sprites | null;
  onPlay: (id: number, practice: boolean) => void;
  onClose: () => void;
}

function LevelSheetView({ id, progress, sprites, onPlay, onClose }: LevelSheetProps) {
  const level = useMemo(() => levelById(id), [id]);
  const reef = level.reef;
  // The shared rule, not a raw `cleared[]` read: a reef loss can reset `currentLevelId` onto an
  // already-`cleared` level, and this level must still read (and play) as the level to start next.
  const practice = levelState(progress, id) === 'cleared';
  const best = progress.best[id - 1] ?? 0;
  const newKind = REEF_NEW_KIND[reef - 1]!;
  const crabSprite = sprites?.crabs[TYPE_COLOUR[newKind.kind]] ?? null;
  const [view, setView] = useState<SheetView>('main');
  const toggleInfo = () => setView((v) => (v === 'main' ? 'info' : 'main'));

  return (
    <Sheet kind="modal">
      <InfoButton onPress={toggleInfo} active={view === 'info'} />
      {view === 'info' ? (
        <ReefInfoView
          reef={reef}
          onBack={() => setView('main')}
          rows={[
            { label: 'Level', value: `${reef}-${level.index}` },
            { label: 'Waves', value: String(level.waves) },
            { label: 'New enemy', value: `${newKind.name} crab` },
            { label: 'Best', value: best > 0 ? formatInt(best) : '—' },
            { label: 'Reef lives', value: String(livesForEntry(progress)) },
          ]}
        />
      ) : (
        <>
          <SheetHead
            sprite={crabSprite}
            kicker={`LEVEL ${reef}-${level.index}`}
            title={`${REEF_NAMES[reef - 1]} · level ${level.index}`}
            subtitle={`New enemy this reef: ${reefNewEnemyCopy(reef)}`}
          />
          <View style={styles.tiles}>
            <StatTile label="Waves" value={String(level.waves)} />
            <StatTile label="Enemy" value={newKind.name} />
            <StatTile label="Best" value={best > 0 ? formatInt(best) : '—'} />
          </View>
          <PillButton label={practice ? 'Replay · unranked' : 'Start level'} height={56} onPress={() => onPlay(id, practice)} />
          <PillButton label="Back to map" kind="secondary" height={48} onPress={onClose} />
        </>
      )}
    </Sheet>
  );
}

interface BossSheetProps {
  reef: number;
  progress: CampaignProgress;
  sprites: Sprites | null;
  onPlay: (id: number, practice: boolean) => void;
  onClose: () => void;
}

function BossSheet({ reef, progress, sprites, onPlay, onClose }: BossSheetProps) {
  const id = reef * LEVELS_PER_REEF;
  const practice = levelState(progress, id) === 'cleared';
  const bossSprite = sprites?.bosses[reef - 1]?.[0] ?? null;
  const lives = livesForEntry(progress);
  const ability = BOSS_ABILITY[reef - 1];
  const [view, setView] = useState<SheetView>('main');
  const toggleInfo = () => setView((v) => (v === 'main' ? 'info' : 'main'));

  return (
    <Sheet kind="modal">
      <InfoButton onPress={toggleInfo} active={view === 'info'} />
      {view === 'info' ? (
        <ReefInfoView
          reef={reef}
          onBack={() => setView('main')}
          rows={[
            { label: 'Boss', value: BOSS_NAMES[reef - 1] },
            { label: 'Phases', value: String(reef) },
            { label: 'Ability', value: ability },
            { label: 'Reef lives', value: String(lives) },
          ]}
        />
      ) : (
        <>
          <SheetHead
            sprite={bossSprite}
            kicker={`REEF ${reef} BOSS`}
            title={BOSS_NAMES[reef - 1]}
            subtitle={`${reef} ${reef === 1 ? 'phase' : 'phases'} · ability: ${ability}`}
          />
          <View style={styles.tiles}>
            <StatTile label="Phases" value={String(reef)} />
            <StatTile label="Ability" value={ability} />
            <StatTile label="Lives" value={String(lives)} />
          </View>
          <PillButton label={practice ? 'Replay boss' : 'Fight boss'} height={56} onPress={() => onPlay(id, practice)} />
          <PillButton label="Back to map" kind="secondary" height={48} onPress={onClose} />
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.app, overflow: 'hidden' },
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  column: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingTop: 28, paddingBottom: 12,
  },
  back: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.hudGlass, borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  headerText: { flex: 1, minWidth: 0 },
  kicker: { fontSize: 10, letterSpacing: 0.8 },
  livesPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: 32, paddingHorizontal: 10, borderRadius: RADIUS.pill,
    backgroundColor: COLORS.hudGlass, borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  lifeDot: { width: 8, height: 8, borderRadius: 4 },
  pathBox: { flex: 1, marginHorizontal: 16 },
  nodeWrap: { position: 'absolute', alignItems: 'center', gap: 6 },
  node: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  nodeLabel: { fontSize: 14, color: COLORS.text },
  nodeLabelLocked: { color: 'rgba(255,255,255,0.38)' },
  ring: { position: 'absolute', top: -5, left: -5, right: -5, bottom: -5, borderWidth: 2 },
  bossName: {
    maxWidth: 130, textShadowColor: 'rgba(0,0,0,0.8)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 },
  },
  glow: { position: 'absolute' },
  panel: {
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 20, gap: 12,
    borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: 'rgba(12,12,14,0.84)',
    borderTopWidth: 1, borderColor: COLORS.glassBorder,
  },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  ctaText: { flex: 1, minWidth: 0 },
  rail: { flexDirection: 'row', gap: 8 },
  railChip: {
    flex: 1, height: 64, borderRadius: 16, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    gap: 2, overflow: 'hidden',
  },
  railChipInactive: { borderColor: 'rgba(236,228,253,0.12)', backgroundColor: 'rgba(236,228,253,0.05)' },
  railChipDim: { opacity: 0.55 },
  railIcon: { width: 32, height: 32 },
  railUnderline: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3 },
  unknownGlyphBox: {
    width: 30, height: 30, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(40,224,185,0.4)',
    backgroundColor: 'rgba(40,224,185,0.1)', alignItems: 'center', justifyContent: 'center',
  },
  unknownGlyph: { color: '#28E0B9', fontSize: 18 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  sheetTile: {
    width: 72, height: 72, borderRadius: 18, backgroundColor: 'rgba(236,228,253,0.08)', borderWidth: 1,
    borderColor: 'rgba(236,228,253,0.14)', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  sheetHeadText: { flex: 1, minWidth: 0, gap: 2 },
  sheetKicker: { fontSize: 11, letterSpacing: 0.66 },
  tiles: { flexDirection: 'row', gap: 6 },
  tile: { flex: 1, padding: 10, borderRadius: RADIUS.tile, backgroundColor: 'rgba(236,228,253,0.08)' },
  tileLabel: { fontSize: 10 },
  tileValue: { fontSize: 14, color: COLORS.text },
  // Sheet.tsx's `modal` style insets its content by paddingVertical:22/paddingHorizontal:20 — these
  // negative offsets land the button 12 dp from the sheet card's own true top/left edges.
  infoButton: {
    position: 'absolute', top: 12 - 22, left: 12 - 20, zIndex: 2,
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: 'rgba(236,228,253,0.16)',
  },
  infoRows: { gap: 2 },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: 'rgba(236,228,253,0.08)',
  },
});
