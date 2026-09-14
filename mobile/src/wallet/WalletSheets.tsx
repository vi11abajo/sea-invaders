import { useEffect } from 'react';
import { BackHandler, StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { PillButton } from '../ui/PillButton';
import { Sheet } from '../ui/Sheet';
import { Txt } from '../ui/Txt';
import { COLORS, FONTS, MOTION, RADIUS } from '../ui/tokens';
import { formatSkr, formatSolAmount, formatSolPrice } from './format';
import type { Purchase } from './usePurchase';

// The wallet sheets of the handoff ("Wallet & error states", screens 11, 13, 16): modal sheets
// (`#141318`, radius 24) over the dimmed scrim, built on `Sheet kind="modal"`.

/** The 28 dp ring spinner (handoff Motion): a 2 dp track at 15 % white with its top arc in `color` (green signing, purple revive), one turn a second. */
export function Spinner({ color = COLORS.success }: { color?: string }) {
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withRepeat(withTiming(1, { duration: MOTION.spinnerMs, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(turn);
  }, [turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  return <Animated.View style={[styles.spinner, { borderTopColor: color }, spin]} />;
}

interface ConnectSheetProps {
  visible: boolean;
  /** Starts the wallet sign-in. The sheet does not close itself: the host hides it. */
  onContinue: () => void;
  onClose: () => void;
}

/** "Connect a wallet" (handoff 16): what a signed-out tap on a wallet-only action opens. System Back closes it. */
export function ConnectSheet({ visible, onContinue, onClose }: ConnectSheetProps) {
  useEffect(() => {
    if (!visible) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!visible) return null;
  return (
    <Sheet kind="modal" onDismiss={onClose}>
      <Txt variant="headline">Connect a wallet</Txt>
      <Txt variant="body" tone="secondary" style={styles.copy}>
        Opens your wallet through Mobile Wallet Adapter. Nothing is signed yet.
      </Txt>
      <PillButton label="Continue in wallet" onPress={onContinue} />
      <PillButton kind="secondary" label="Not now" onPress={onClose} />
    </Sheet>
  );
}

/** A label over a mono value, as in sheet 13's Required / You have tiles; `short` gives the value and border the warning orange. */
function AmountTile({ label, value, short = false }: { label: string; value: string; short?: boolean }) {
  return (
    <View style={[styles.tile, short && styles.tileShort]}>
      <Txt variant="secondary" tone="tertiary" style={styles.tileLabel}>{label}</Txt>
      <Txt variant="mono" tone={short ? 'warning' : 'primary'} style={styles.tileValue} numberOfLines={1}>{value}</Txt>
    </View>
  );
}

/**
 * "Waiting for signature" (handoff 11): spinner, title, what is being paid, and the mono amount +
 * fee row. `swap` adds a second line naming what an auto-swap contributes, under - never instead
 * of - the price, so the SKR the wallet already holds is never hidden. Not dismissible.
 */
function SigningSheet({ title, what, amount, fee, swap }: { title: string; what: string; amount: string; fee: string | null; swap: string | null }) {
  return (
    <Sheet kind="modal">
      <View style={styles.signHead}>
        <Spinner />
        <View style={styles.signText}>
          <Txt style={styles.signTitle}>{title}</Txt>
          <Txt variant="body" tone="secondary">{what}</Txt>
        </View>
      </View>
      <View style={styles.amountBox}>
        <View style={styles.amountRow}>
          <Txt style={styles.amountText} numberOfLines={1}>{amount}</Txt>
          {fee !== null && <Txt style={styles.amountText} numberOfLines={1}>{fee}</Txt>}
        </View>
        {swap !== null && <Txt style={[styles.amountText, styles.amountNote]} numberOfLines={1}>{swap}</Txt>}
      </View>
    </Sheet>
  );
}

/**
 * "Not enough SOL for fees" (handoff 13). The design's "Top up in wallet" only closes the sheet:
 * the app cannot fund a wallet. With `swapping`, `requiredLamports` also covers the SOL the
 * auto-swap spends, so the copy says so rather than calling all of it a network fee.
 */
function NoSolSheet({ requiredLamports, haveLamports, swapping, onClose }: {
  requiredLamports: number; haveLamports: number; swapping: boolean; onClose: () => void;
}) {
  return (
    <Sheet kind="modal" onDismiss={onClose}>
      <Txt variant="headline">{swapping ? 'Not enough SOL' : 'Not enough SOL for fees'}</Txt>
      <Txt variant="body" tone="secondary" style={styles.copy}>
        {swapping
          ? 'This payment swaps SOL for the SKR your wallet is short of, and needs a little more for the network fee.'
          : 'This transaction needs a small amount of SOL for the network fee.'}
      </Txt>
      <View style={styles.tiles}>
        <AmountTile label="Required" value={`${formatSolAmount(requiredLamports, 'up')} SOL`} />
        <AmountTile label="You have" value={`${formatSolAmount(haveLamports, 'down')} SOL`} short />
      </View>
      <PillButton label="Top up in wallet" onPress={onClose} />
      <PillButton kind="secondary" label="Cancel" onPress={onClose} />
    </Sheet>
  );
}

/**
 * The backend's 409 `not_enough_skr`, laid out like sheet 13. The handoff has no SKR-short sheet
 * because it pays the difference with an auto-swap, which only exists on mainnet; `onFaucet`
 * (devnet builds) offers the test faucet the way the ticket card does.
 */
function NoSkrSheet({ needSkr, haveSkr, onFaucet, faucetBusy, onClose }: {
  needSkr: number; haveSkr: number; onFaucet?: () => void; faucetBusy: boolean; onClose: () => void;
}) {
  return (
    <Sheet kind="modal" onDismiss={onClose}>
      <Txt variant="headline">Not enough SKR</Txt>
      <Txt variant="body" tone="secondary" style={styles.copy}>
        This purchase is paid in SKR, and your wallet holds less than the price.
      </Txt>
      <View style={styles.tiles}>
        <AmountTile label="Required" value={`${formatSkr(needSkr)} SKR`} />
        <AmountTile label="You have" value={`${formatSkr(haveSkr)} SKR`} short />
      </View>
      {onFaucet !== undefined && (
        <PillButton label={faucetBusy ? 'Getting test SKR…' : 'Get 100 test SKR'} onPress={onFaucet} disabled={faucetBusy} />
      )}
      <PillButton kind={onFaucet !== undefined ? 'secondary' : 'primary'} label={onFaucet !== undefined ? 'Cancel' : 'Got it'} onPress={onClose} />
    </Sheet>
  );
}

interface PurchaseSheetsProps {
  purchase: Purchase;
  /** Devnet only: mints test SKR; offered by the not-enough-SKR sheet. */
  onFaucet?: () => void;
  /** True while that faucet request runs. */
  faucetBusy?: boolean;
}

/**
 * The sheet a purchase is showing, if any: "Waiting for signature" while it is prepared and signed
 * (titled "Confirming on Solana" once sent), then "Not enough SOL for fees" / "Not enough SKR" when
 * it stopped on either. System Back is the host's to handle (it knows whether a sheet is up).
 */
export function PurchaseSheets({ purchase, onFaucet, faucetBusy = false }: PurchaseSheetsProps) {
  const { phase, order, error, costLamports, reset } = purchase;
  if (order === null) return null;
  if (phase === 'building' || phase === 'signing' || phase === 'confirming') {
    return (
      <SigningSheet
        title={phase === 'confirming' ? 'Confirming on Solana' : 'Waiting for signature'}
        what={order.what}
        // The price is always the price, in SKR. An auto-swap only pays the part of it the wallet
        // cannot cover, and says so on its own line - the rest still comes out of the SKR balance.
        amount={`${formatSkr(order.amountSkr)} SKR`}
        fee={costLamports === null ? null : `fee ≈ ${formatSolAmount(costLamports, 'up')} SOL`}
        swap={order.swappedSkr === undefined || order.swapSol === undefined
          ? null
          : `incl. ${formatSkr(order.swappedSkr)} SKR swapped from ≈ ${formatSolPrice(order.swapSol)} SOL`}
      />
    );
  }
  if (phase === 'error' && error?.code === 'no_sol') {
    return <NoSolSheet requiredLamports={error.requiredLamports} haveLamports={error.haveLamports} swapping={order.swapSol !== undefined} onClose={reset} />;
  }
  if (phase === 'error' && error?.code === 'no_skr') {
    return <NoSkrSheet needSkr={error.needSkr} haveSkr={error.haveSkr} onFaucet={onFaucet} faucetBusy={faucetBusy} onClose={reset} />;
  }
  return null;
}

const styles = StyleSheet.create({
  copy: { lineHeight: 19 },
  spinner: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: 'rgba(255,255,255,0.15)',
  },
  signHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  signText: { flex: 1, minWidth: 0 },
  signTitle: { fontFamily: FONTS.medium, fontSize: 18, letterSpacing: -0.36, color: COLORS.text },
  amountBox: {
    gap: 6, paddingHorizontal: 14, paddingVertical: 12,
    borderRadius: RADIUS.tile, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(236,228,253,0.12)',
  },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  amountText: { fontFamily: FONTS.mono, fontSize: 12, color: 'rgba(255,255,255,0.72)' },
  amountNote: { fontSize: 11, color: 'rgba(255,255,255,0.56)' },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: {
    flex: 1, paddingHorizontal: 14, paddingVertical: 12, borderRadius: RADIUS.tile,
    backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(236,228,253,0.12)',
  },
  tileShort: { borderColor: 'rgba(244,130,82,0.4)' },
  tileLabel: { fontSize: 11 },
  tileValue: { fontSize: 15 },
});
