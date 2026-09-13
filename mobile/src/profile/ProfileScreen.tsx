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
import { BASE_OCTOPI_NAME, ITEM_NAMES, skinOfItem, variantOfItem } from '../loadout/items';
import type { LoadoutState } from '../loadout/useLoadout';
import { ItemArt } from '../shop/ItemArt';
import { Backdrop } from '../ui/Backdrop';
import { PillButton } from '../ui/PillButton';
import { Toast } from '../ui/Toast';
import { Txt } from '../ui/Txt';
import { COLORS, FONTS, MOTION, RADIUS } from '../ui/tokens';
import { formatSkr, formatSolBalance } from '../wallet/format';
import { ConnectSheet } from '../wallet/WalletSheets';

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
/** Shown for a balance that has not been read (or could not be). */
const UNKNOWN = '—';

type ToastState = { id: number; text: string; dot: string } | null;

function messageOf(error: unknown): string {
  if (error instanceof ApiError && error.code === 'not_owned') return 'That item is not in your inventory';
  return error instanceof Error ? error.message : String(error);
}

/** One inventory tile: an owned item (or the base Octopi) and what tapping it does. */
interface Tile {
  key: string;
  /** Catalogue item id; null for the base Octopi. */
  itemId: number | null;
  name: string;
  equipped: boolean;
  /** The loadout change a tap makes; null when there is nothing to do (the base Octopi already equipped). */
  change: LoadoutChange | null;
}

/**
 * The base Octopi first (always owned: it is the no-variant choice), then the owned campaign
 * octopi, then the owned skins, in catalogue order. One variant and one skin are equipped at a
 * time; tapping the equipped one takes it off, back to the base.
 */
function inventoryTiles(loadout: LoadoutState): Tile[] {
  const baseEquipped = loadout.activeVariant === 0;
  const tiles: Tile[] = [
    { key: 'base', itemId: null, name: BASE_OCTOPI_NAME, equipped: baseEquipped, change: baseEquipped ? null : { activeVariant: 0 } },
  ];
  for (const id of loadout.owned) {
    const variant = variantOfItem(id);
    if (variant === null) continue;
    const equipped = loadout.activeVariant === variant;
    tiles.push({ key: `item-${id}`, itemId: id, name: ITEM_NAMES[id] ?? `Item ${id}`, equipped, change: { activeVariant: equipped ? 0 : variant } });
  }
  for (const id of loadout.owned) {
    const skin = skinOfItem(id);
    if (skin === null) continue;
    const equipped = loadout.activeSkin === skin;
    tiles.push({ key: `item-${id}`, itemId: id, name: ITEM_NAMES[id] ?? `Item ${id}`, equipped, change: { activeSkin: equipped ? 0 : skin } });
  }
  return tiles;
}

interface ProfileScreenProps {
  /** The signed-in wallet, or null for the "No wallet connected" card. */
  walletAddress: string | null;
  loadout: LoadoutState;
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
}

/**
 * The Profile (handoff 09): the wallet card with the SKR and SOL balances and Disconnect, or the
 * no-wallet card with Connect; then the inventory, where owned items are equipped. The Seeker row
 * belongs to Phase 3C and is not shown. Pull down to refresh the balances and the inventory.
 */
export function ProfileScreen({
  walletAddress, loadout, onEquip, onReloadLoadout, onConnect, connecting, signInError, onDisconnect, onBack,
}: ProfileScreenProps) {
  const { connection } = useMobileWallet();
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

  const refresh = useCallback(async () => {
    setRefreshing(true);
    onReloadLoadout();
    await loadBalances();
    if (alive.current) setRefreshing(false);
  }, [onReloadLoadout, loadBalances]);

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

  // System Back closes the Connect sheet first, otherwise returns Home. Registered once, so it
  // stays under the sheet's own handler however often the shell re-renders.
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

  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = withTiming(1, { duration: MOTION.riseMs, easing: Easing.out(Easing.cubic) });
  }, [shown]);
  const rise = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * MOTION.riseOffset }],
  }));

  const signedIn = walletAddress !== null;
  const tiles = inventoryTiles(loadout);
  const rows: Tile[][] = [];
  for (let i = 0; i < tiles.length; i += TILE_COLUMNS) rows.push(tiles.slice(i, i + TILE_COLUMNS));

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
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={4} style={styles.back}>
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
          <Txt variant="secondary" tone="secondary" style={styles.section}>INVENTORY</Txt>
          <View style={styles.grid}>
            {rows.map((row) => (
              <View key={row[0].key} style={styles.gridRow}>
                {row.map((tile) => (
                  <InventoryTile key={tile.key} tile={tile} disabled={!signedIn || equipping} onPress={(change) => void equip(change)} />
                ))}
                {Array.from({ length: TILE_COLUMNS - row.length }, (_, i) => (
                  <View key={`spacer-${i}`} style={styles.tileSpacer} />
                ))}
              </View>
            ))}
          </View>
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
 * An inventory tile (handoff 09: 34 dp art, 11 dp name) with its Equip / Equipped pill. The whole
 * tile is the button, so the touch target is the tile, well over 48 dp.
 */
function InventoryTile({ tile, disabled, onPress }: { tile: Tile; disabled: boolean; onPress: (change: LoadoutChange) => void }) {
  const { change } = tile;
  const inactive = disabled || change === null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={tile.equipped ? `${tile.name}, equipped` : `Equip ${tile.name}`}
      accessibilityState={{ selected: tile.equipped, disabled: inactive }}
      disabled={inactive}
      onPress={() => {
        if (change !== null) onPress(change);
      }}
      style={({ pressed }) => [styles.tile, tile.equipped && styles.tileEquipped, pressed && styles.pressed]}
    >
      <ItemArt itemId={tile.itemId} size={TILE_ART} />
      <Txt style={styles.tileName} numberOfLines={1}>{tile.name}</Txt>
      <View style={[styles.equip, tile.equipped ? styles.equipOn : styles.equipOff]}>
        <Txt style={[styles.equipText, tile.equipped ? styles.equipTextOn : styles.equipTextOff]} numberOfLines={1}>
          {tile.equipped ? 'Equipped' : 'Equip'}
        </Txt>
      </View>
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
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: AVATAR, height: AVATAR },
  identityText: { flex: 1, minWidth: 0 },
  address: { fontFamily: FONTS.mono, fontSize: 16, color: COLORS.text },
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
  grid: { gap: 8 },
  gridRow: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1, minWidth: 0, alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 6,
    borderRadius: RADIUS.hudCard, backgroundColor: TILE_GLASS, borderWidth: 1, borderColor: TILE_BORDER,
  },
  tileEquipped: { backgroundColor: TILE_SELECTED_BG, borderColor: TILE_SELECTED_BORDER },
  tileSpacer: { flex: 1 },
  tileName: { fontFamily: FONTS.medium, fontSize: 11, color: COLORS.text, textAlign: 'center' },
  equip: {
    alignSelf: 'stretch', height: EQUIP_HEIGHT, borderRadius: RADIUS.pill, paddingHorizontal: 6,
    alignItems: 'center', justifyContent: 'center',
  },
  equipOn: { backgroundColor: COLORS.primary },
  equipOff: { backgroundColor: COLORS.secondary },
  equipText: { fontFamily: FONTS.medium, fontSize: 11 },
  equipTextOn: { color: COLORS.onPrimary },
  equipTextOff: { color: COLORS.text },
  note: { textAlign: 'center' },
  loading: { marginTop: 4 },
  pressed: { opacity: 0.8 },
});
