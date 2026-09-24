import { PublicKey, type Connection } from '@solana/web3.js';
import { useMobileWallet } from '@wallet-ui/react-native-web3js';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { CLUSTER } from '../api/config';
import { requestFaucet } from '../api/daily';
import { buyItem, confirmPurchase, getShop, type ShopInfo, type ShopItem } from '../api/shop';
import { onBackPress } from '../audio/onBackPress';
import { ABILITY } from '../loadout/abilities';
import { WEAR_RULE } from '../loadout/allowed';
import { VARIANT_OCTOPI, variantOfItem } from '../loadout/items';
import { SwirlBackdrop } from '../ui/SwirlBackdrop';
import { BounceCard } from '../ui/BounceCard';
import { PillButton } from '../ui/PillButton';
import { SkrAmount, SkrIcon } from '../ui/SkrIcon';
import { Toast } from '../ui/Toast';
import { Txt } from '../ui/Txt';
import { COLORS, FONTS, MOTION, RADIUS, SIZE } from '../ui/tokens';
import { formatSkr, formatSolBalance, formatSolPrice } from '../wallet/format';
import { DECLINED_TOAST, usePurchase } from '../wallet/usePurchase';
import { PurchaseSheets } from '../wallet/WalletSheets';
import { ItemArt } from './ItemArt';

/**
 * What a champion item does, `label · short`, read from the
 * champion's ability by the variant the item sells; null for an item that sells none. Names and
 * prices come from the backend.
 */
function perkOf(itemId: number): string | null {
  const variant = variantOfItem(itemId);
  const octopi = variant === null ? undefined : VARIANT_OCTOPI[variant];
  if (octopi === undefined) return null;
  const { label, short } = ABILITY[octopi];
  return label === null ? short : `${label} · ${short}`;
}

/** Shop screen sizes, in dp. */
const VARIANT_THUMB = 56;
const SKIN_SWATCH = 64;
const ROW_PILL = 40;
const CARD_PILL = 36;
/** The Shop's rows and cards use the lighter end of the glass range: `rgba(236,228,253,.10)`. */
const SHOP_GLASS = 'rgba(236,228,253,0.10)';

type ToastState = { id: number; text: string; dot: string } | null;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readSolLamports(connection: Connection, address: string): Promise<number> {
  return connection.getBalance(new PublicKey(address), 'confirmed');
}

interface ShopScreenProps {
  /** The signed-in wallet; the Shop is only reachable with a session (Home opens the Connect sheet otherwise). */
  walletAddress: string;
  onBack: () => void;
}

/**
 * The Shop: the SKR/SOL balance, the champions on sale and the Octopi skins, with
 * prices and ownership read from the chain through the backend. A price tap runs the on-chain
 * purchase through `usePurchase` and its sheets; pull down to refresh.
 */
export function ShopScreen({ walletAddress, onBack }: ShopScreenProps) {
  const { connection } = useMobileWallet();
  const purchase = usePurchase();
  const { start, reset } = purchase;
  const [shop, setShop] = useState<ShopInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [solLamports, setSolLamports] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);

  const alive = useRef(true);
  const loaded = useRef(false);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const show = useCallback((text: string, dot: string = COLORS.info) => {
    setToast((t) => ({ id: (t?.id ?? 0) + 1, text, dot }));
  }, []);

  // The catalogue (prices, ownership, SKR) and the SOL balance, fetched together. A failed first
  // load replaces the list with the error and a retry; a failed refresh keeps the list and toasts.
  const load = useCallback(async () => {
    const [info, sol] = await Promise.allSettled([getShop(), readSolLamports(connection, walletAddress)]);
    if (!alive.current) return;
    if (info.status === 'fulfilled') {
      loaded.current = true;
      setShop(info.value);
      setLoadError(null);
    } else if (loaded.current) {
      show(messageOf(info.reason), COLORS.warning);
    } else {
      setLoadError(messageOf(info.reason));
    }
    if (sol.status === 'fulfilled') setSolLamports(sol.value);
  }, [connection, walletAddress, show]);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    if (alive.current) setRefreshing(false);
  }, [load]);

  // Mainnet only: the backend swaps SOL for the missing SKR when the balance cannot cover the
  // price, and ignores the offer when it can. Elsewhere the gate answers and the not-enough-SKR
  // sheet with its devnet faucet is what shows, exactly as before. Offered on availability alone,
  // never gated on the balance on screen - see `PurchasePayload.swapAvailable` for why that is
  // deliberate: the backend decides by the balance it reads from the chain.
  const swapAvailable = shop?.swap.available === true;

  const buy = useCallback(
    async (item: ShopItem) => {
      const outcome = await start('item', {
        what: item.name,
        amountSkr: item.priceSkr,
        swapAvailable,
        prepare: (swap) => buyItem(item.id, swap),
        confirm: (signature) => confirmPurchase(signature, item.id),
      });
      if (!alive.current) return;
      switch (outcome.status) {
        case 'done': {
          const owned = new Set(outcome.result.owned ?? [item.id]);
          setShop((s) => s && { ...s, items: s.items.map((it) => (owned.has(it.id) ? { ...it, owned: true } : it)) });
          reset();
          show('Purchased');
          void load();
          break;
        }
        case 'declined':
          show(DECLINED_TOAST, COLORS.warning);
          break;
        case 'error':
          // Not enough SOL / SKR stay up as their sheets; everything else is a toast.
          if (outcome.error.code !== 'failed') break;
          reset();
          if (outcome.error.apiCode === 'already_owned') show('Already owned');
          else show(outcome.error.message, COLORS.warning);
          void load();
          break;
        case 'abandoned':
          break;
      }
    },
    [start, reset, show, load, swapAvailable],
  );

  const faucet = useCallback(async () => {
    setFaucetBusy(true);
    try {
      const { amountSkr } = await requestFaucet();
      if (!alive.current) return;
      reset();
      show(`+${amountSkr} SKR from the faucet`);
      void load();
    } catch (e) {
      if (alive.current) show(messageOf(e), COLORS.warning);
    } finally {
      if (alive.current) setFaucetBusy(false);
    }
  }, [reset, show, load]);

  // System Back: a purchase being prepared or confirmed keeps the screen (both end on their own
  // timeouts); a no-SOL/no-SKR sheet closes; otherwise back to where the Shop was opened from (Home or
  // the Level start). While the wallet is signing,
  // Back leaves too — the wallet sits on top then, so a Back that reaches the app means its
  // session went stale, and a purchase that does land shows as Owned on the next visit.
  const { phase } = purchase;
  const errorCode = purchase.error?.code ?? null;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (phase === 'building' || phase === 'confirming') return true;
      if (phase === 'error' && (errorCode === 'no_sol' || errorCode === 'no_skr')) {
        reset();
        return true;
      }
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [phase, errorCode, reset, onBack]);

  const shown = useSharedValue(0);
  useEffect(() => {
    shown.value = withTiming(1, { duration: MOTION.riseMs, easing: Easing.out(Easing.cubic) });
  }, [shown]);
  const rise = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ translateY: (1 - shown.value) * MOTION.riseOffset }],
  }));

  const busy = phase === 'building' || phase === 'signing' || phase === 'confirming';

  return (
    <View style={styles.root}>
      <SwirlBackdrop />
      <Animated.View style={[styles.fill, rise]}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void refresh()}
              colors={[COLORS.success]}
              progressBackgroundColor={COLORS.modalSheet}
              tintColor={COLORS.text}
            />
          }
        >
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={onBackPress(onBack)} hitSlop={4} style={styles.back}>
              <Txt variant="button">←</Txt>
            </Pressable>
            <Txt variant="screenTitle" style={styles.title}>Shop</Txt>
            {shop !== null && <BalancePill skr={shop.balanceSkr} solLamports={solLamports} />}
          </View>
          {shop === null ? (
            loadError === null ? (
              <ActivityIndicator color={COLORS.text} style={styles.loading} />
            ) : (
              <View style={styles.failed}>
                <Txt variant="body" tone="warning" style={styles.center}>{loadError}</Txt>
                <PillButton kind="secondary" label="Try again" onPress={() => void load()} />
              </View>
            )
          ) : (
            <Catalogue shop={shop} disabled={busy} onBuy={(item) => void buy(item)} />
          )}
        </ScrollView>
      </Animated.View>
      <PurchaseSheets
        purchase={purchase}
        onFaucet={CLUSTER === 'devnet' ? () => void faucet() : undefined}
        faucetBusy={faucetBusy}
      />
      {toast !== null && <Toast key={toast.id} text={toast.text} dot={toast.dot} onHide={() => setToast(null)} />}
    </View>
  );
}

/** The header's `42 SKR · 0.31 SOL` pill; the SOL part is left out until the RPC has answered. */
function BalancePill({ skr, solLamports }: { skr: number; solLamports: number | null }) {
  return (
    <View style={styles.balance}>
      <SkrAmount value={formatSkr(skr)} textStyle={styles.balanceText} size={11} gap={4} />
      {solLamports !== null && (
        <>
          <Txt style={[styles.balanceText, styles.balanceDot]}>·</Txt>
          <Txt style={styles.balanceText}>{`${formatSolBalance(solLamports)} SOL`}</Txt>
        </>
      )}
    </View>
  );
}

interface CatalogueProps {
  shop: ShopInfo;
  disabled: boolean;
  onBuy: (item: ShopItem) => void;
}

function Catalogue({ shop, disabled, onBuy }: CatalogueProps) {
  const short = (item: ShopItem) => shop.swap.available && !item.owned && item.priceSkr > shop.balanceSkr;
  // An SKR price carries the token mark (`skr: true`); "Owned" and a SOL quote are plain text.
  const priceLabel = (item: ShopItem): { label: string; skr: boolean } => {
    if (item.owned) return { label: 'Owned', skr: false };
    const sol = short(item) ? (item.priceSol ?? null) : null; // `??`: an API without the field reads as no quote
    return sol === null ? { label: formatSkr(item.priceSkr), skr: true } : { label: `≈ ${formatSolPrice(sol)} SOL`, skr: false };
  };
  const variants = shop.items.filter((item) => item.kind === 'variant');
  const skins = shop.items.filter((item) => item.kind === 'skin');
  const skinRows: ShopItem[][] = [];
  for (let i = 0; i < skins.length; i += 2) skinRows.push(skins.slice(i, i + 2));

  if (shop.items.length === 0) {
    return <Txt variant="body" tone="secondary" style={styles.center}>Nothing is on sale right now.</Txt>;
  }
  return (
    <>
      {shop.items.some(short) && (
        <Txt variant="secondary" tone="secondary" style={styles.note}>
          SKR balance is low. Prices show the SOL equivalent; the swap runs automatically in one signature.
        </Txt>
      )}
      {variants.length > 0 && (
        <>
          <Txt variant="secondary" tone="secondary" style={[styles.section, styles.sectionFirst]}>CHAMPIONS</Txt>
          {variants.map((item, i) => {
            const perk = perkOf(item.id);
            return (
              <BounceCard key={item.id} index={i}>
                <View style={styles.row}>
                  <ItemArt itemId={item.id} size={VARIANT_THUMB} />
                  <View style={styles.rowText}>
                    <Txt style={styles.rowName} numberOfLines={1}>{item.name}</Txt>
                    {perk !== null && (
                      <Txt variant="secondary" tone="secondary" numberOfLines={2}>{perk}</Txt>
                    )}
                  </View>
                  <PricePill item={item} {...priceLabel(item)} height={ROW_PILL} disabled={disabled} onBuy={onBuy} />
                </View>
              </BounceCard>
            );
          })}
          <Txt variant="secondary" tone="tertiary" style={styles.note}>{WEAR_RULE}</Txt>
        </>
      )}
      {skins.length > 0 && (
        <>
          <Txt variant="secondary" tone="secondary" style={[styles.section, styles.sectionNext]}>OCTOPI SKINS</Txt>
          {skinRows.map((pair) => (
            <View key={pair[0].id} style={styles.gridRow}>
              {pair.map((item) => (
                <BounceCard key={item.id} index={variants.length + skins.indexOf(item)} style={styles.cardWrap}>
                  <View style={styles.card}>
                    <ItemArt itemId={item.id} size={SKIN_SWATCH} />
                    <Txt style={styles.cardName} numberOfLines={1}>{item.name}</Txt>
                    <PricePill item={item} {...priceLabel(item)} height={CARD_PILL} stretch disabled={disabled} onBuy={onBuy} />
                  </View>
                </BounceCard>
              ))}
              {pair.length === 1 && <View style={styles.cardSpacer} />}
            </View>
          ))}
        </>
      )}
    </>
  );
}

interface PricePillProps {
  item: ShopItem;
  label: string;
  /** The label is an SKR amount: draw the token mark before it. */
  skr: boolean;
  /** 40 dp on a row, 36 dp full width on a skin card; both keep a 48 dp touch target. */
  height: number;
  stretch?: boolean;
  disabled: boolean;
  onBuy: (item: ShopItem) => void;
}

/** The mono price button: white with black text to buy, `.08` white with `.64` text once owned. */
function PricePill({ item, label, skr, height, stretch = false, disabled, onBuy }: PricePillProps) {
  const slop = Math.max(0, (SIZE.minTap - height) / 2);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.owned ? `${item.name} owned` : `Buy ${item.name} for ${label}${skr ? ' SKR' : ''}`}
      accessibilityState={{ disabled: item.owned || disabled }}
      disabled={item.owned || disabled}
      onPress={() => onBuy(item)}
      hitSlop={slop}
      style={({ pressed }) => [
        styles.pill,
        { height },
        stretch && styles.pillStretch,
        item.owned ? styles.pillOwned : styles.pillBuy,
        pressed && styles.pressed,
      ]}
    >
      {skr && <SkrIcon size={height === ROW_PILL ? 11 : 10} color={COLORS.onPrimary} />}
      <Txt
        style={[styles.pillText, { fontSize: height === ROW_PILL ? 13 : 12 }, item.owned ? styles.pillTextOwned : styles.pillTextBuy]}
        numberOfLines={1}
      >
        {label}
      </Txt>
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
  balance: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 32, paddingHorizontal: 12, borderRadius: RADIUS.pill,
    backgroundColor: SHOP_GLASS, borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  balanceText: { fontFamily: FONTS.mono, fontSize: 12, color: COLORS.text },
  balanceDot: { color: COLORS.textTertiary },
  loading: { marginTop: 40 },
  failed: { gap: 14, marginTop: 24 },
  center: { textAlign: 'center' },
  note: { paddingHorizontal: 2 },
  section: { textTransform: 'uppercase', letterSpacing: 0.48 },
  sectionFirst: { marginTop: 4 },
  sectionNext: { marginTop: 6 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, borderRadius: RADIUS.row,
    backgroundColor: SHOP_GLASS, borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontFamily: FONTS.medium, fontSize: 15, color: COLORS.text },
  gridRow: { flexDirection: 'row', gap: 10 },
  cardWrap: { flex: 1 },
  card: {
    flex: 1, alignItems: 'center', gap: 10, padding: 14, borderRadius: RADIUS.row,
    backgroundColor: SHOP_GLASS, borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  cardSpacer: { flex: 1 },
  cardName: { fontFamily: FONTS.medium, fontSize: 14, color: COLORS.text },
  pill: { borderRadius: RADIUS.pill, paddingHorizontal: 14, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center' },
  pillStretch: { alignSelf: 'stretch' },
  pillBuy: { backgroundColor: COLORS.primary },
  pillOwned: { backgroundColor: COLORS.secondary },
  pillText: { fontFamily: FONTS.mono },
  pillTextBuy: { color: COLORS.onPrimary },
  pillTextOwned: { color: COLORS.textSecondary },
  pressed: { opacity: 0.8 },
});
