import type { CrabType, Formation, LevelSpec } from '@sea-invaders/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler, Pressable, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { ApiError } from '../api/client';
import { onBackPress } from '../audio/onBackPress';
import { ActiveOctopi } from '../game/OctopiArt';
import { VARIANT_OCTOPI, type VariantIndex } from '../loadout/items';
import type { LoadoutApi } from '../loadout/useLoadout';
import { PillButton } from '../ui/PillButton';
import { Sheet } from '../ui/Sheet';
import { Toast } from '../ui/Toast';
import { Txt } from '../ui/Txt';
import { COLORS, RADIUS } from '../ui/tokens';
import { BOSS_NAMES } from '../game/bossNames';
import { ConnectSheet } from '../wallet/WalletSheets';
import { ReefBackdrop } from './ReefBackdrop';
import { FIRST_VETERAN_REEF, REEF_NAMES, reefNewEnemyCopy } from './reefs';
import { VariantPicker } from './VariantPicker';

const FORMATION_NAMES: Record<Formation, string> = {
  classic: 'Classic', fish: 'Fish', diamond: 'Diamond', ring: 'Ring',
  jellyfish: 'Jellyfish', octopus: 'Octopus', shell: 'Shell', wreck: 'Wreck',
  trident: 'Trident', anchor: 'Anchor', turtle: 'Turtle', crown: 'Crown', starfish: 'Starfish',
  whirlpool: 'Whirlpool', claws: 'Claws', manta: 'Manta', spearhead: 'Spearhead',
};

/**
 * The mark a living formation's name carries on the Level start screen (ruling R55): `whirlpool`
 * rotates, `claws` splits, `manta` reforms into the `spearhead` template it falls back to (all three,
 * `sim/living.ts`). Every other formation marches as a plain block and gets none.
 */
const LIVING_MARK: Partial<Record<Formation, string>> = {
  whirlpool: '⟳',
  claws: '⇄',
  manta: '▸ Spearhead',
};

/** A formation's display name with its living mark after it, exactly as ruling R55 spells them. */
function formationLabel(f: Formation): string {
  const mark = LIVING_MARK[f];
  return mark === undefined ? FORMATION_NAMES[f] : `${FORMATION_NAMES[f]} ${mark}`;
}

const CRAB_NAMES: Record<CrabType, string> = {
  normal: 'Normal', armored: 'Armored', swift: 'Swift', heavy: 'Heavy', elder: 'Elder',
  warden: 'Warden', herald: 'Herald', bubbler: 'Bubbler', bombardier: 'Bombardier', patriarch: 'Patriarch',
};

/**
 * The picked octopi in the world (handoff 06): 84 dp, its top at y 470 of the 400x890 frame (the
 * Seeker's dp), drifting up 10 dp and back every 3 s. A taller sheet lifts it to sit `PREVIEW_GAP`
 * above the sheet; with no room left under the level's heading it is not shown.
 */
const PREVIEW_SIZE = 84;
const PREVIEW_TOP = 470;
const PREVIEW_GAP = 24;
const DRIFT_MS = 3000;
const DRIFT_DP = 10;

type ToastState = { id: number; text: string; dot: string } | null;

function messageOf(error: unknown): string {
  if (error instanceof ApiError && error.code === 'not_owned') return 'That item is not in your inventory';
  return error instanceof Error ? error.message : String(error);
}

interface LevelIntroProps {
  level: LevelSpec;
  practice: boolean;
  /** Lives the run will start with, the picked octopi's extra life included. */
  lives: number;
  /** The loadout: the picker shows its variant, and equips the one tapped. */
  loadout: LoadoutApi;
  /** False when signed out: only the base Octopi can be picked, and a locked tile asks to connect. */
  signedIn: boolean;
  /** True while a wallet sign-in is in flight. */
  connecting: boolean;
  /** A failed sign-in's message; toasted when it appears while this screen is open. */
  signInError: string | null;
  /** Starts the wallet sign-in; the Connect sheet's "Continue in wallet" calls it. */
  onConnect: () => void;
  /** Opens the Shop: a locked tile, signed in. */
  onOpenShop: () => void;
  onPlay: () => void;
  onBack: () => void;
}

/**
 * The Level start screen (handoff 06): what the level is, the octopi picker and Start level. The
 * picked octopi is the loadout's variant, so the choice is kept for the next level too.
 */
export function LevelIntro({
  level, practice, lives, loadout, signedIn, connecting, signInError, onConnect, onOpenShop, onPlay, onBack,
}: LevelIntroProps) {
  const reefName = REEF_NAMES[level.reef - 1];
  const { equip, refresh } = loadout;
  const [connectOpen, setConnectOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  // Where the heading ends and the sheet begins, measured, so the preview never sits under either.
  const [headBottom, setHeadBottom] = useState<number | null>(null);
  const [sheetTop, setSheetTop] = useState<number | null>(null);

  const drift = useSharedValue(0);
  useEffect(() => {
    drift.value = withRepeat(withTiming(-DRIFT_DP, { duration: DRIFT_MS / 2, easing: Easing.inOut(Easing.sin) }), -1, true);
  }, [drift]);
  const driftStyle = useAnimatedStyle(() => ({ transform: [{ translateY: drift.value }] }));

  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const show = useCallback((text: string, dot: string = COLORS.info) => {
    setToast((t) => ({ id: (t?.id ?? 0) + 1, text, dot }));
  }, []);

  // A purchase made in the Shop since the last read shows up as soon as this screen opens.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Only a sign-in that fails while this screen is open; an older error is not replayed on entry.
  const lastSignInError = useRef(signInError);
  useEffect(() => {
    if (signInError !== null && signInError !== lastSignInError.current) show(signInError, COLORS.warning);
    lastSignInError.current = signInError;
  }, [signInError, show]);

  // Equipping shows at once; a save the backend refuses puts the last confirmed octopi back.
  const pick = useCallback(
    (variant: VariantIndex) => {
      equip({ activeVariant: variant }).catch((e: unknown) => {
        if (alive.current) show(messageOf(e), COLORS.warning);
      });
    },
    [equip, show],
  );

  const locked = () => {
    if (signedIn) onOpenShop();
    else if (!connecting) setConnectOpen(true);
  };

  // System Back closes the Connect sheet first, otherwise returns to the map. Registered once, so it
  // stays under the sheet's own handler however often the parent re-renders.
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const connectOpenRef = useRef(connectOpen);
  connectOpenRef.current = connectOpen;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (connectOpenRef.current) setConnectOpen(false);
      else onBackRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);
  const closeConnect = useCallback(() => setConnectOpen(false), []);

  const previewTop = sheetTop === null ? null : Math.min(PREVIEW_TOP, sheetTop - PREVIEW_SIZE - PREVIEW_GAP);
  const showPreview = previewTop !== null && headBottom !== null && previewTop - DRIFT_DP >= headBottom;

  return (
    <View style={styles.root}>
      <ReefBackdrop reef={level.reef} />
      <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBackPress(onBack)} hitSlop={4} style={styles.back}>
        <Txt variant="button">←</Txt>
      </Pressable>
      <View style={styles.head} onLayout={(e) => setHeadBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}>
        <Txt variant="label" tone="secondary">{`Level ${level.id} · ${reefName}`}</Txt>
        {practice && (
          <View style={styles.practiceTag}>
            <Txt variant="label" tone="onPrimary">Practice</Txt>
          </View>
        )}
      </View>
      {showPreview && (
        <Animated.View style={[styles.preview, { top: previewTop }, driftStyle]} pointerEvents="none">
          {/* The run's look: the equipped skin, else the picked octopi's colour. */}
          <ActiveOctopi size={PREVIEW_SIZE} octopi={VARIANT_OCTOPI[loadout.loadout.activeVariant]} />
        </Animated.View>
      )}
      <Sheet onLayout={(e) => setSheetTop(e.nativeEvent.layout.y)}>
        {level.boss !== undefined ? (
          <>
            <Txt variant="headline">{BOSS_NAMES[level.boss - 1]}</Txt>
            <Txt variant="body" tone="secondary">{`${level.boss} phase${level.boss > 1 ? 's' : ''}`}</Txt>
          </>
        ) : (
          <>
            <Txt variant="headline">{level.formations.map(formationLabel).join(' → ')}</Txt>
            <Txt variant="body" tone="secondary">{`${level.waves} wave${level.waves === 1 ? '' : 's'}`}</Txt>
            <View style={styles.chips}>
              {[...new Set(level.kinds)].map((kind) => (
                <View key={kind} style={styles.chip}>
                  <Txt variant="secondary">{CRAB_NAMES[kind]}</Txt>
                </View>
              ))}
            </View>
          </>
        )}
        {/* Reefs 6-10 only (ruling R55): names the reef's veteran the same way the map's level sheet
            already names it for reefs 1-5 (`reefNewEnemyCopy`, `REEF_NEW_KIND`) — no new copy style. */}
        {level.reef >= FIRST_VETERAN_REEF && (
          <Txt variant="body" tone="secondary">{`New enemy this reef: ${reefNewEnemyCopy(level.reef)}`}</Txt>
        )}
        <Txt variant="body" tone="secondary">{`Lives to play with: ${lives}`}</Txt>
        <VariantPicker selected={loadout.loadout.activeVariant} owned={loadout.loadout.owned} onPick={pick} onLocked={locked} />
        <PillButton label="Start level" onPress={onPlay} />
      </Sheet>
      <ConnectSheet
        visible={connectOpen}
        onContinue={() => {
          setConnectOpen(false);
          onConnect();
        }}
        onClose={closeConnect}
      />
      {toast !== null && <Toast key={toast.id} text={toast.text} dot={toast.dot} onHide={() => setToast(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.app },
  back: {
    position: 'absolute', top: 28, left: 16, width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.hudGlass, borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  head: { position: 'absolute', top: 120, left: 0, right: 0, alignItems: 'center', gap: 10 },
  preview: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  practiceTag: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: RADIUS.pill, backgroundColor: COLORS.success },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: RADIUS.pill,
    backgroundColor: COLORS.hudGlass, borderWidth: 1, borderColor: COLORS.glassBorder,
  },
});
