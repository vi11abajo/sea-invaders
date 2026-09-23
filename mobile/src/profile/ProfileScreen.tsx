import { shortAddress } from '@sea-invaders/core';
import { Canvas, Circle, LinearGradient, vec } from '@shopify/react-native-skia';
import { PublicKey } from '@solana/web3.js';
import { useMobileWallet } from '@wallet-ui/react-native-web3js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { ApiError } from '../api/client';
import type { LoadoutChange } from '../api/profile';
import { getShop } from '../api/shop';
import { onBackPress } from '../audio/onBackPress';
import { useAudioSettings } from '../audio/settings';
import { OctopiThumb } from '../game/OctopiArt';
import { BASE_LOOK, CHAMPION_LOOK, lookOfSkin, type Look } from '../game/looks';
import { ABILITY } from '../loadout/abilities';
import { WEAR_RULE, skinHint, variantHint, wornSkin, wornVariant, type Selectors } from '../loadout/allowed';
import { SKIN_NAMES, VARIANT_NAMES, VARIANT_OCTOPI, type SkinIndex, type VariantIndex } from '../loadout/items';
import type { LoadoutState } from '../loadout/useLoadout';
import { ACCENT_BY_VARIANT, accentOfLook } from '../shop/tints';
import { Backdrop } from '../ui/Backdrop';
import { PillButton } from '../ui/PillButton';
import { SeekerBadge } from '../ui/SeekerBadge';
import { SquishSwitch } from '../ui/SquishSwitch';
import { Toast } from '../ui/Toast';
import { Txt } from '../ui/Txt';
import { COLORS, FONTS, MOTION, RADIUS } from '../ui/tokens';
import { formatSkr, formatSolBalance } from '../wallet/format';
import { ConnectSheet, SigningSheet } from '../wallet/WalletSheets';
import type { SeekerState } from './useSeeker';

/** Handoff 09 sizes, in dp. */
const AVATAR = 52;
const TILE_ART = 34;
const TILE_COLUMNS = 4;
const DISCONNECT_HEIGHT = 44;
const EQUIP_HEIGHT = 24;
/** The avatar's `linear-gradient(135deg, #9945FF, #19FB9B)`. */
const AVATAR_GRADIENT = ['#9945FF', '#19FB9B'];
/** The wallet card uses the lighter end of the glass range, `rgba(236,228,253,.10)`, like the Shop's rows. */
const CARD_GLASS = 'rgba(236,228,253,0.10)';
/** Inventory tiles: `rgba(236,228,253,.08)` with a `.12` border. */
const TILE_GLASS = 'rgba(236,228,253,0.08)';
const TILE_BORDER = 'rgba(236,228,253,0.12)';
/** An equipped tile takes the design's selected-tile look from the level sheet's octopi picker (06). */
const TILE_SELECTED_BG = 'rgba(255,255,255,0.14)';
const TILE_SELECTED_BORDER = '#FFFFFF';
/** A locked tile's Octopi, name and ability are drawn at 40 %, like the Level start picker's; its hint stays readable. */
const LOCKED_OPACITY = 0.4;
/** A champion's ability line under its name: up to three lines at a tile's width, so no ability is cut short. */
const DETAIL_LINES = 3;
/** The Skins group's first tile, skin code 0 (design doc §2). */
const OWN_COLOURS = "Octopi's own colours";
/** Shown for a balance that has not been read (or could not be). */
const UNKNOWN = '—';

type ToastState = { id: number; text: string; dot: string } | null;

function messageOf(error: unknown): string {
  if (error instanceof ApiError && error.code === 'not_owned') return 'That item is not in your inventory';
  return error instanceof Error ? error.message : String(error);
}

/** One tile of a group: a champion or a look, its state, and what tapping it does. */
interface Tile {
  key: string;
  look: Look;
  /** The thumb's glow, `#RRGGBB`. */
  accent: string;
  name: string;
  /** A champion's ability in a few words; null for a look. */
  detail: string | null;
  equipped: boolean;
  /** Not wearable yet: dimmed and not pressable. */
  locked: boolean;
  /** Where a locked one is had: "In the Shop", "Beat <boss>" or "Verify Seeker" (design doc §5). */
  hint: string | null;
  /** The loadout change a tap makes; null when there is nothing to do (locked, or the base already on). */
  change: LoadoutChange | null;
}

/**
 * The Champions group (design doc §5): the base Octopi and every champion in `VARIANT_INDEX` order,
 * each in its own art with its ability, whether it is had yet or not. Exactly one is worn; tapping
 * the worn champion takes it off, back to the base Octopi.
 */
function championTiles(worn: VariantIndex, allowed: Selectors): Tile[] {
  return VARIANT_OCTOPI.map((octopi, variant) => {
    const equipped = variant === worn;
    const locked = !allowed.variants.includes(variant);
    return {
      key: `variant-${variant}`,
      look: CHAMPION_LOOK[octopi] ?? BASE_LOOK,
      accent: ACCENT_BY_VARIANT[octopi],
      name: VARIANT_NAMES[octopi],
      detail: ABILITY[octopi].short,
      equipped,
      locked,
      hint: locked ? variantHint(variant) : null,
      change: locked || (equipped && variant === 0) ? null : { activeVariant: equipped ? 0 : variant },
    };
  });
}

/**
 * The Skins group (design doc §5): Octopi's own colours first, then every look by its code, had
 * or not. At most one is worn; tapping the worn look goes back to Octopi's own colours.
 */
function skinTiles(worn: SkinIndex, allowed: Selectors): Tile[] {
  return SKIN_NAMES.map((name, code) => {
    const equipped = code === worn;
    const locked = !allowed.skins.includes(code);
    return {
      key: `skin-${code}`,
      look: lookOfSkin(code),
      accent: accentOfLook(code, 'base'),
      name: code === 0 ? OWN_COLOURS : name,
      detail: null,
      equipped,
      locked,
      hint: locked ? skinHint(code) : null,
      change: locked || (equipped && code === 0) ? null : { activeSkin: equipped ? 0 : code },
    };
  });
}

/** `tiles` in rows of `TILE_COLUMNS`. */
function tileRows(tiles: Tile[]): Tile[][] {
  const rows: Tile[][] = [];
  for (let i = 0; i < tiles.length; i += TILE_COLUMNS) rows.push(tiles.slice(i, i + TILE_COLUMNS));
  return rows;
}

interface ProfileScreenProps {
  /** The signed-in wallet, or null for the "No wallet connected" card. */
  walletAddress: string | null;
  loadout: LoadoutState;
  /** What this player may wear (`allowedSelectors`): the open tiles; the rest are shown locked. */
  allowed: Selectors;
  /** Saves a loadout change; rejects when the backend refuses it or cannot be reached. */
  onEquip: (change: LoadoutChange) => Promise<void>;
  /** Reads the loadout from the backend again: on open and on pull-to-refresh. */
  onReloadLoadout: () => void;
  /** Starts the wallet sign-in; the Connect sheet's "Continue in wallet" calls it. */
  onConnect: () => void;
  /** True while a sign-in is in flight. */
  connecting: boolean;
  /** A failed sign-in's message; toasted when it appears while the Profile is open. */
  signInError: string | null;
  /** Forgets the wallet authorization and the session (the app's sign-out). */
  onDisconnect: () => void;
  onBack: () => void;
  /** The shell's one Seeker status (Phase 3C), shared with Home's wallet pill. */
  seeker: SeekerState;
}

/**
 * The Profile (handoff 09): the wallet card with the Seeker row, the SKR and SOL balances and
 * Disconnect, or the no-wallet card with Connect; then the inventory — every champion and every
 * look, the ones this player may wear equipped from here (without a wallet, the earned awards
 * only). Pull down to refresh the balances and the inventory.
 */
export function ProfileScreen({
  walletAddress, loadout, allowed, onEquip, onReloadLoadout, onConnect, connecting, signInError, onDisconnect, onBack, seeker,
}: ProfileScreenProps) {
  const { connection } = useMobileWallet();
  const audio = useAudioSettings();
  const [skr, setSkr] = useState<number | null>(null);
  const [solLamports, setSolLamports] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [equipping, setEquipping] = useState(false);
  const [connectOpen, setConnectOpen] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

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

  // SKR from the backend's chain read (the Shop's source), SOL from the RPC, fetched together. A
  // balance that fails to load keeps its last value, or the dash.
  const loadBalances = useCallback(async () => {
    if (walletAddress === null) return;
    const [shop, sol] = await Promise.allSettled([
      getShop(),
      connection.getBalance(new PublicKey(walletAddress), 'confirmed'),
    ]);
    if (!alive.current) return;
    if (shop.status === 'fulfilled') setSkr(shop.value.balanceSkr);
    if (sol.status === 'fulfilled') setSolLamports(sol.value);
  }, [walletAddress, connection]);

  useEffect(() => {
    setSkr(null);
    setSolLamports(null);
    void loadBalances();
  }, [loadBalances]);

  // A purchase made in the Shop since the last read shows up as soon as the Profile opens.
  useEffect(() => {
    onReloadLoadout();
  }, [onReloadLoadout]);

  // A Seeker link that landed after the confirm poll timed out shows up as soon as the Profile
  // opens too, same reasoning as the loadout re-read above.
  useEffect(() => {
    seeker.refresh();
  }, [seeker.refresh]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    onReloadLoadout();
    seeker.refresh();
    await loadBalances();
    if (alive.current) setRefreshing(false);
  }, [onReloadLoadout, loadBalances, seeker.refresh]);

  // The prototype's connect/disconnect toasts, on the session actually changing.
  const lastWallet = useRef(walletAddress);
  useEffect(() => {
    if (lastWallet.current === null && walletAddress !== null) show('Wallet connected');
    else if (lastWallet.current !== null && walletAddress === null) show('Wallet disconnected');
    lastWallet.current = walletAddress;
  }, [walletAddress, show]);

  // Only a sign-in that fails while the Profile is open; an older error is not replayed on entry.
  const lastSignInError = useRef(signInError);
  useEffect(() => {
    if (signInError !== null && signInError !== lastSignInError.current) show(signInError, COLORS.warning);
    lastSignInError.current = signInError;
  }, [signInError, show]);

  // The Seeker link's decline/error toast (its own message, e.g. "Signature declined — nothing
  // changed"); a structural outcome (linked, no_token, unavailable) is not toasted - the row's own
  // copy already says so. Same diff-by-reference pattern as `signInError` above.
  const seekerPhase = seeker.phase;
  const lastSeekerMessage = useRef<string | undefined>(undefined);
  useEffect(() => {
    const message = seekerPhase.kind === 'idle' ? seekerPhase.message : undefined;
    if (message !== undefined && message !== lastSeekerMessage.current) show(message, COLORS.warning);
    lastSeekerMessage.current = message;
  }, [seekerPhase, show]);
  const seekerBusy = seekerPhase.kind === 'signing' || seekerPhase.kind === 'confirming';

  const equip = useCallback(
    async (change: LoadoutChange) => {
      setEquipping(true);
      try {
        await onEquip(change);
      } catch (e) {
        if (alive.current) show(messageOf(e), COLORS.warning);
      } finally {
        if (alive.current) setEquipping(false);
      }
    },
    [onEquip, show],
  );

  // System Back closes the Connect sheet first; while a Seeker link is confirming, it stays on the
  // Profile (the same rule `ShopScreen` uses for a purchase's own confirm) since the poll would
  // otherwise keep running behind a screen with nothing to show for it; while it is signing, Back
  // is left to pass through - the wallet sits on top then. Otherwise Back returns Home. Registered
  // once, so it stays under the sheet's own handler however often the shell re-renders.
  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;
  const connectOpenRef = useRef(connectOpen);
  connectOpenRef.current = connectOpen;
  const seekerConfirmingRef = useRef(false);
  seekerConfirmingRef.current = seekerPhase.kind === 'confirming';
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (connectOpenRef.current) setConnectOpen(false);
      else if (seekerConfirmingRef.current) return true;
      else onBackRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);
  const closeConnect = useCallback(() => setConnectOpen(false), []);

  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = withTiming(1, { duration: MOTION.riseMs, easing: Easing.out(Easing.cubic) });
  }, [shown]);
  const rise = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * MOTION.riseOffset }],
  }));

  const signedIn = walletAddress !== null;
  // What is really worn: a selector no longer allowed shows as the base, as everywhere else.
  const champions = championTiles(wornVariant(allowed, loadout.activeVariant), allowed);
  const skins = skinTiles(wornSkin(allowed, loadout.activeSkin), allowed);
  // Signed out, the open tiles are the earned awards, which this phone keeps without a wallet.
  const tileDisabled = equipping;
  const onTile = (change: LoadoutChange) => void equip(change);

  return (
    <View style={styles.root}>
      <Backdrop />
      <Animated.View style={[styles.fill, rise]}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            signedIn ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => void refresh()}
                colors={[COLORS.success]}
                progressBackgroundColor={COLORS.modalSheet}
                tintColor={COLORS.text}
              />
            ) : undefined
          }
        >
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBackPress(onBack)} hitSlop={4} style={styles.back}>
              <Txt variant="button">←</Txt>
            </Pressable>
            <Txt variant="screenTitle" style={styles.title}>Profile</Txt>
          </View>
          {walletAddress !== null ? (
            <View style={styles.card}>
              <View style={styles.identity}>
                <Avatar />
                <View style={styles.identityText}>
                  <Txt style={styles.address} numberOfLines={1}>{shortAddress(walletAddress)}</Txt>
                  <Txt variant="secondary" tone="secondary" numberOfLines={1}>Mobile Wallet Adapter · connected</Txt>
                </View>
              </View>
              <SeekerRow seeker={seeker} busy={seekerBusy} />
              <View style={styles.balances}>
                <Balance label="SKR" value={skr === null ? UNKNOWN : formatSkr(skr)} />
                <Balance label="SOL" value={solLamports === null ? UNKNOWN : formatSolBalance(solLamports)} />
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={onDisconnect}
                hitSlop={2}
                style={({ pressed }) => [styles.disconnect, pressed && styles.pressed]}
              >
                <Txt style={styles.disconnectText}>Disconnect</Txt>
              </Pressable>
            </View>
          ) : (
            <View style={[styles.card, styles.cardNoWallet]}>
              <Txt style={styles.noWalletTitle}>No wallet connected</Txt>
              <Txt variant="body" tone="secondary" style={styles.copy}>
                Campaign and Practice work without one. Connect to play ranked Daily Runs and keep your purchases.
              </Txt>
              <PillButton label="Connect wallet" onPress={() => setConnectOpen(true)} disabled={connecting} />
            </View>
          )}
          <Txt variant="secondary" tone="secondary" style={styles.section}>SOUND &amp; TOUCH</Txt>
          <View style={styles.card}>
            <SettingRow label="Sounds" value={audio.sounds} onChange={audio.setSounds} />
            <View style={styles.settingDivider} />
            <SettingRow label="Music" value={audio.music} onChange={audio.setMusic} />
            <View style={styles.settingDivider} />
            <SettingRow label="Vibration" value={audio.vibration} onChange={audio.setVibration} />
          </View>
          <Txt variant="secondary" tone="secondary" style={styles.section}>INVENTORY</Txt>
          <Txt variant="label" tone="tertiary">CHAMPIONS</Txt>
          <TileGrid tiles={champions} disabled={tileDisabled} onPress={onTile} />
          <Txt variant="secondary" tone="tertiary">{WEAR_RULE}</Txt>
          <Txt variant="label" tone="tertiary" style={styles.group}>SKINS</Txt>
          <TileGrid tiles={skins} disabled={tileDisabled} onPress={onTile} />
          {signedIn && loadout.source !== 'server' && (
            loadout.error !== null ? (
              <Txt variant="secondary" tone="tertiary" style={styles.note}>{`${loadout.error.replace(/\.$/, '')}. Pull down to try again.`}</Txt>
            ) : (
              loadout.source === 'none' && <ActivityIndicator color={COLORS.text} style={styles.loading} />
            )
          )}
        </ScrollView>
      </Animated.View>
      <ConnectSheet
        visible={connectOpen}
        onContinue={() => {
          setConnectOpen(false);
          onConnect();
        }}
        onClose={closeConnect}
      />
      {seekerBusy && (
        <SigningSheet
          title={seekerPhase.kind === 'confirming' ? 'Confirming on Solana' : 'Waiting for signature'}
          what="Verify Seeker"
          amount={null}
          fee={null}
          swap="One wallet signature · network fee and account rent only"
        />
      )}
      {toast !== null && <Toast key={toast.id} text={toast.text} dot={toast.dot} onHide={() => setToast(null)} />}
    </View>
  );
}

/** The 52 dp avatar: a circle in the 135° purple-to-green gradient (top-left to bottom-right). */
function Avatar() {
  return (
    <Canvas style={styles.avatar} pointerEvents="none">
      <Circle cx={AVATAR / 2} cy={AVATAR / 2} r={AVATAR / 2}>
        <LinearGradient start={vec(0, 0)} end={vec(AVATAR, AVATAR)} colors={AVATAR_GRADIENT} />
      </Circle>
    </Canvas>
  );
}

/** One row of the "Sound & touch" card: a label and a switch, following the app's own colours rather than the OS default. */
function SettingRow({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.settingRow}>
      <Txt variant="body">{label}</Txt>
      <SquishSwitch value={value} onValueChange={onChange} />
    </View>
  );
}

/** A balance column: an 11 dp label at .48 over the mono amount. */
function Balance({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.balance}>
      <Txt variant="secondary" tone="tertiary" style={styles.balanceLabel}>{label}</Txt>
      <Txt style={styles.balanceValue} numberOfLines={1}>{value}</Txt>
    </View>
  );
}

/**
 * The Seeker row (handoff 09, design §1): nested in the wallet card between identity and balances.
 * `unknown` (signed out, or the first read has not resolved) renders nothing. `linked` shows the
 * `SEEKER` badge in a dark tile next to its confirmation copy; the other three states share a
 * prompt with the `Verify Seeker` pill - enabled for a first try or a `no_token` retry, disabled
 * while `unavailable` or while a link is already signing/confirming.
 */
function SeekerRow({ seeker, busy }: { seeker: SeekerState; busy: boolean }) {
  if (seeker.status === 'unknown') return null;
  if (seeker.status === 'linked') {
    return (
      <View style={styles.seekerTile}>
        <SeekerBadge />
        <Txt variant="secondary" tone="secondary" style={styles.seekerTileText}>Seeker verified · badge shown on leaderboards</Txt>
      </View>
    );
  }
  const copy = seeker.status === 'no_token'
    ? 'No Seeker Genesis Token found on this wallet.'
    : seeker.status === 'unavailable'
      ? 'Seeker verification is not available right now.'
      : 'Holders of a Seeker Genesis Token get the SEEKER badge on the leaderboards.';
  return (
    <View style={styles.seekerPrompt}>
      <Txt variant="body" tone="secondary" style={styles.copy}>{copy}</Txt>
      <PillButton kind="secondary" label="Verify Seeker" onPress={seeker.link} disabled={busy || seeker.status === 'unavailable'} />
    </View>
  );
}

/** One inventory group as a 4-column grid, the last row padded with spacers so tiles keep their width. */
function TileGrid({ tiles, disabled, onPress }: { tiles: Tile[]; disabled: boolean; onPress: (change: LoadoutChange) => void }) {
  return (
    <View style={styles.grid}>
      {tileRows(tiles).map((row) => (
        <View key={row[0]!.key} style={styles.gridRow}>
          {row.map((tile) => (
            <InventoryTile key={tile.key} tile={tile} disabled={disabled} onPress={onPress} />
          ))}
          {Array.from({ length: TILE_COLUMNS - row.length }, (_, i) => (
            <View key={`spacer-${i}`} style={styles.tileSpacer} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** A tile's spoken label: its name and state, and for a locked one where it is had. */
function tileLabel(tile: Tile): string {
  if (tile.equipped) return `${tile.name}, equipped`;
  if (tile.locked) return [tile.name, 'locked', ...(tile.hint === null ? [] : [tile.hint])].join(', ');
  return `Equip ${tile.name}`;
}

/**
 * An inventory tile (handoff 09: 34 dp art, 11 dp name) with its Equip / Equipped pill, or, locked,
 * dimmed with where it is had in the pill's place (design doc §5). The pill or the hint sits at the
 * tile's foot, so a row of tiles with names and abilities of different lengths still lines up. The
 * whole tile is the button, so the touch target is the tile, well over 48 dp.
 */
function InventoryTile({ tile, disabled, onPress }: { tile: Tile; disabled: boolean; onPress: (change: LoadoutChange) => void }) {
  const { change } = tile;
  const inactive = disabled || change === null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tileLabel(tile)}
      accessibilityState={{ selected: tile.equipped, disabled: inactive }}
      disabled={inactive}
      onPress={() => {
        if (change !== null) onPress(change);
      }}
      style={({ pressed }) => [styles.tile, tile.equipped && styles.tileEquipped, pressed && styles.pressed]}
    >
      <View style={[styles.tileBody, tile.locked && styles.dimmed]}>
        <OctopiThumb look={tile.look} accent={tile.accent} size={TILE_ART} />
        <Txt style={styles.tileName} numberOfLines={2}>{tile.name}</Txt>
        {tile.detail !== null && <Txt style={styles.tileDetail} numberOfLines={DETAIL_LINES}>{tile.detail}</Txt>}
      </View>
      {tile.locked ? (
        <View style={styles.hint}>
          <Txt style={styles.hintText} numberOfLines={2}>{tile.hint ?? ''}</Txt>
        </View>
      ) : (
        <View style={[styles.equip, tile.equipped ? styles.equipOn : styles.equipOff]}>
          <Txt style={[styles.equipText, tile.equipped ? styles.equipTextOn : styles.equipTextOff]} numberOfLines={1}>
            {tile.equipped ? 'Equipped' : 'Equip'}
          </Txt>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.app },
  fill: { flex: 1 },
  content: { paddingTop: 28, paddingHorizontal: 20, paddingBottom: 28, gap: 14 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 },
  back: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.hudGlass, borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  title: { flex: 1, color: COLORS.text },
  card: {
    gap: 14, padding: 20, borderRadius: RADIUS.card,
    backgroundColor: CARD_GLASS, borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  cardNoWallet: { gap: 12 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settingDivider: { height: 1, backgroundColor: 'rgba(236,228,253,0.08)' },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: AVATAR, height: AVATAR },
  identityText: { flex: 1, minWidth: 0 },
  address: { fontFamily: FONTS.mono, fontSize: 16, color: COLORS.text },
  // The Seeker row's `linked` tile: the darker inset used for the signing sheets' amount box
  // (`rgba(0,0,0,.35)` over the card's own lighter glass), so the badge's confirmation reads as a
  // nested state rather than another balance.
  seekerTile: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: RADIUS.tile,
    backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(236,228,253,0.12)',
  },
  seekerTileText: { flex: 1 },
  seekerPrompt: { gap: 10 },
  balances: { flexDirection: 'row', gap: 6 },
  balance: { flex: 1, minWidth: 0 },
  balanceLabel: { fontSize: 11 },
  balanceValue: { fontFamily: FONTS.mono, fontSize: 15, color: COLORS.text },
  disconnect: {
    height: DISCONNECT_HEIGHT, borderRadius: RADIUS.pill, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.secondary,
  },
  disconnectText: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.text },
  noWalletTitle: { fontFamily: FONTS.medium, fontSize: 20, letterSpacing: -0.6, color: COLORS.text },
  copy: { lineHeight: 19 },
  section: { marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.48 },
  group: { marginTop: 8 },
  grid: { gap: 8 },
  gridRow: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1, minWidth: 0, alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 6,
    borderRadius: RADIUS.hudCard, backgroundColor: TILE_GLASS, borderWidth: 1, borderColor: TILE_BORDER,
  },
  tileEquipped: { backgroundColor: TILE_SELECTED_BG, borderColor: TILE_SELECTED_BORDER },
  tileBody: { alignSelf: 'stretch', alignItems: 'center', gap: 6 },
  dimmed: { opacity: LOCKED_OPACITY },
  tileSpacer: { flex: 1 },
  tileName: { fontFamily: FONTS.medium, fontSize: 11, color: COLORS.text, textAlign: 'center' },
  tileDetail: { fontFamily: FONTS.regular, fontSize: 10, color: COLORS.textSecondary, textAlign: 'center' },
  equip: {
    alignSelf: 'stretch', height: EQUIP_HEIGHT, marginTop: 'auto', borderRadius: RADIUS.pill, paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  hint: { alignSelf: 'stretch', minHeight: EQUIP_HEIGHT, marginTop: 'auto', alignItems: 'center', justifyContent: 'center' },
  hintText: { fontFamily: FONTS.medium, fontSize: 10, color: COLORS.textSecondary, textAlign: 'center' },
  equipOn: { backgroundColor: COLORS.primary },
  equipOff: { backgroundColor: COLORS.secondary },
  equipText: { fontFamily: FONTS.medium, fontSize: 11 },
  equipTextOn: { color: COLORS.onPrimary },
  equipTextOff: { color: COLORS.text },
  note: { textAlign: 'center' },
  loading: { marginTop: 4 },
  pressed: { opacity: 0.8 },
});
