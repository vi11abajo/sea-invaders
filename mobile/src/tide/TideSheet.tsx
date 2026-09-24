import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, View } from 'react-native';
import { CLUSTER } from '../api/config';
import type { ReviveQuote } from '../api/revive';
import { GradientFill } from '../ui/GradientFill';
import { PillButton } from '../ui/PillButton';
import { Sheet } from '../ui/Sheet';
import { SkrAmount } from '../ui/SkrIcon';
import { Toast } from '../ui/Toast';
import { Txt } from '../ui/Txt';
import { COLORS, FONTS, RADIUS, SIGNATURE_GRADIENT, SIZE } from '../ui/tokens';
import { formatSkr, formatSolPrice } from '../wallet/format';
import { ConnectSheet, PurchaseSheets, Spinner } from '../wallet/WalletSheets';
import { PENDING_LONG_MS, useRevive, type TideQuote } from './useRevive';

/** Steps on the on-chain ladder (`Config.revive_ladder`, eight prices): one bar segment each. */
const LADDER_STEPS = 8;
/** The revive spinner's arc: the gradient's purple end. */
const REVIVE_SPINNER = SIGNATURE_GRADIENT.colors[0];

type ToastState = { id: number; text: string; dot: string } | null;

/** `inSeconds` as a countdown: `1 h 40 min`, `1 h 05 min`, `40 min` (never below 1 min). */
function dropsIn(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours} h ${String(rest).padStart(2, '0')} min` : `${rest} min`;
}

interface TideSheetProps {
  /** Revives this level attempt still allows, this one included. */
  revivesLeft: number;
  signedIn: boolean;
  /** True while a wallet sign-in is in flight. */
  connecting: boolean;
  /** A failed sign-in's message; toasted when it appears while the sheet is open. */
  signInError: string | null;
  /** Starts the wallet sign-in, from the Connect sheet. */
  onConnect: () => void;
  /** The chain confirmed the revive: the host revives the run. Called at most once. */
  onRevived: () => void;
  /** End level: the host ends the run as a normal loss. */
  onEndLevel: () => void;
}

/**
 * The Tide, over the paused run after Octopi's last life: the revive price,
 * when it next falls, the ladder, then Revive or End level; while the revive is confirmed, the
 * pending sheet, with Retry / End level after 60 s. The wallet's own sheets (signing, not enough
 * SOL/SKR, Connect) take the sheet's place while they are up. System Back never ends the level.
 */
export function TideSheet({ revivesLeft, signedIn, connecting, signInError, onConnect, onRevived, onEndLevel }: TideSheetProps) {
  const [toast, setToast] = useState<ToastState>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const show = useCallback((text: string, dot: string = COLORS.info) => {
    setToast((t) => ({ id: (t?.id ?? 0) + 1, text, dot }));
  }, []);
  const tide = useRevive({ signedIn, connecting, onRevived, toast: show });
  const { purchase, stage, quote, now, solPrice } = tide;

  // Only a sign-in that fails while the sheet is open; an older error is not replayed.
  const lastSignInError = useRef(signInError);
  useEffect(() => {
    if (signInError !== null && signInError !== lastSignInError.current) show(signInError, COLORS.warning);
    lastSignInError.current = signInError;
  }, [signInError, show]);

  // System Back closes a not-enough-SOL/SKR sheet and is otherwise swallowed: the level only ends
  // through End level. The Connect sheet closes itself (its handler sits above this one), and the
  // held run's GameScreen passes Back down to here. Registered once, under those sheets.
  const purchaseRef = useRef(purchase);
  purchaseRef.current = purchase;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      const { phase, error, reset } = purchaseRef.current;
      if (phase === 'error' && (error?.code === 'no_sol' || error?.code === 'no_skr')) reset();
      return true;
    });
    return () => sub.remove();
  }, []);

  const errorCode = purchase.phase === 'error' ? purchase.error?.code : undefined;
  let sheet: ReactNode;
  if (purchase.phase === 'building' || purchase.phase === 'signing' || errorCode === 'no_sol' || errorCode === 'no_skr') {
    sheet = (
      <PurchaseSheets
        purchase={purchase}
        onFaucet={CLUSTER === 'devnet' ? () => void tide.faucet() : undefined}
        faucetBusy={tide.faucetBusy}
      />
    );
  } else if (stage.kind === 'pending' || purchase.phase === 'confirming') {
    const since = stage.kind === 'pending' ? stage.since : now;
    sheet = <PendingSheet elapsedMs={Math.max(0, now - since)} onRetry={tide.retry} onEndLevel={onEndLevel} />;
  } else if (connectOpen) {
    sheet = (
      <ConnectSheet
        visible
        onContinue={() => {
          setConnectOpen(false);
          onConnect();
        }}
        onClose={() => setConnectOpen(false)}
      />
    );
  } else {
    sheet = (
      <OfferSheet
        quote={quote}
        now={now}
        solPrice={solPrice}
        revivesLeft={revivesLeft}
        connecting={connecting}
        onRevive={tide.revive}
        onRetryQuote={tide.reloadQuote}
        onConnect={() => setConnectOpen(true)}
        onEndLevel={onEndLevel}
      />
    );
  }

  return (
    <>
      {sheet}
      {toast !== null && <Toast key={toast.id} text={toast.text} dot={toast.dot} onHide={() => setToast(null)} />}
    </>
  );
}

interface OfferSheetProps {
  quote: TideQuote;
  now: number;
  /** The SOL a swapped revive costs, when the wallet is short on SKR and this cluster can swap; null otherwise. */
  solPrice: number | null;
  revivesLeft: number;
  connecting: boolean;
  onRevive: () => void;
  onRetryQuote: () => void;
  onConnect: () => void;
  onEndLevel: () => void;
}

/** `THE TIDE` / `Octopi is down`, the price card, the ladder, the note, Revive / End level. */
function OfferSheet({ quote, now, solPrice, revivesLeft, connecting, onRevive, onRetryQuote, onConnect, onEndLevel }: OfferSheetProps) {
  // `Price ladder 25 → 120 SKR · falls back over time`, with the range read from the
  // quote's on-chain ladder (never hardcoded), plus this level's remaining revives.
  const revives = `${revivesLeft} ${revivesLeft === 1 ? 'revive' : 'revives'} left`;
  // `Array.isArray`: an API still answering without the ladder must not break the sheet.
  const ladder = quote.status === 'ready' && Array.isArray(quote.quote.ladderSkr) && quote.quote.ladderSkr.length > 0 ? quote.quote.ladderSkr : null;
  const note = ladder !== null
    ? `Price ladder ${formatSkr(ladder[0]!)} → ${formatSkr(ladder[ladder.length - 1]!)} SKR · falls back over time · ${revives}`
    : `${revives} this level · price falls back over time`;
  let primary: ReactNode;
  if (quote.status === 'signed_out') {
    primary = <PillButton label={connecting ? 'Connecting…' : 'Connect wallet'} onPress={onConnect} disabled={connecting} />;
  } else if (quote.status === 'error') {
    primary = <PillButton label="Try again" onPress={onRetryQuote} />;
  } else if (quote.status === 'ready') {
    // Short on SKR, on a cluster that can swap, the primary is priced in SOL -
    // the auto-swap pays the difference in the same signature.
    const price = solPrice === null ? `${formatSkr(quote.quote.priceSkr)} SKR` : `≈ ${formatSolPrice(solPrice)} SOL`;
    primary = <PillButton label={`Revive · ${price}`} onPress={onRevive} />;
  } else {
    primary = <PillButton label="Revive" disabled />;
  }
  return (
    <Sheet kind="modal">
      <Txt variant="secondary" tone="secondary" style={styles.label}>The Tide</Txt>
      <Txt style={styles.title}>Octopi is down</Txt>
      {quote.status === 'signed_out' ? (
        <Txt variant="body" tone="secondary" style={styles.copy}>
          Revives are paid in SKR from your wallet. Connect one to see the price.
        </Txt>
      ) : (
        <>
          <PriceCard quote={quote} now={now} />
          {/* The Shop's low-SKR note, as its own line under the price card: the card keeps the price
              in SKR and the ladder note keeps its range, so nothing the sheet already said is lost. */}
          {solPrice !== null && (
            <Txt variant="secondary" tone="secondary" style={styles.swapNote}>
              SKR balance is low · the swap runs automatically when you revive
            </Txt>
          )}
          <LadderBar step={quote.status === 'ready' ? quote.quote.effective : null} />
        </>
      )}
      <Txt variant="secondary" tone="tertiary" style={styles.note}>{note}</Txt>
      {primary}
      <PillButton kind="secondary" label="End level" onPress={onEndLevel} />
    </Sheet>
  );
}

/** `Revive now` and the price on the left; `Drops to` and the countdown on the right, hidden at the bottom step. */
function PriceCard({ quote, now }: { quote: Exclude<TideQuote, { status: 'signed_out' }>; now: number }) {
  const ready: ReviveQuote | null = quote.status === 'ready' ? quote.quote : null;
  const next = ready?.nextStep ?? null;
  const secondsLeft = next !== null && quote.status === 'ready' ? (quote.at + next.inSeconds * 1000 - now) / 1000 : 0;
  return (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <Txt variant="secondary" tone="tertiary" style={styles.cardLabel}>Revive now</Txt>
        {ready !== null ? (
          <SkrAmount value={formatSkr(ready.priceSkr)} textStyle={styles.price} size={18} gap={6} />
        ) : quote.status === 'error' ? (
          <Txt variant="body" tone="warning" style={styles.cardError}>{quote.message}</Txt>
        ) : (
          <ActivityIndicator color={COLORS.text} style={styles.priceLoading} />
        )}
      </View>
      {next !== null && (
        <View style={styles.cardRight}>
          <Txt variant="secondary" tone="tertiary" style={styles.cardLabel}>Drops to</Txt>
          <SkrAmount value={`${formatSkr(next.priceSkr)} in ${dropsIn(secondsLeft)}`} textStyle={styles.drop} size={11} color={COLORS.info} gap={4} style={styles.dropRow} />
        </View>
      )}
    </View>
  );
}

/** Eight 4 dp segments; each one up to the current step holds the signature gradient. */
function LadderBar({ step }: { step: number | null }) {
  return (
    <View style={styles.ladder}>
      {Array.from({ length: LADDER_STEPS }, (_, i) => {
        const filled = step !== null && i <= step;
        return (
          <View key={i} style={[styles.segment, filled && styles.segmentFilled]}>
            {filled && <GradientFill radius={2} />}
          </View>
        );
      })}
    </View>
  );
}

/** The purple spinner and the pending clock; after 60 s the note and Retry / End level. */
function PendingSheet({ elapsedMs, onRetry, onEndLevel }: { elapsedMs: number; onRetry: () => void; onEndLevel: () => void }) {
  const long = elapsedMs >= PENDING_LONG_MS;
  return (
    <Sheet kind="modal">
      <View style={styles.pendingHead}>
        <Spinner color={REVIVE_SPINNER} />
        <View style={styles.pendingText}>
          <Txt style={styles.pendingTitle}>Revive pending</Txt>
          <Txt variant="body" tone="secondary">{`Game paused · confirming on Solana · ${Math.floor(elapsedMs / 1000)}s`}</Txt>
        </View>
      </View>
      {long && (
        <>
          <Txt variant="body" tone="secondary" style={styles.copy}>
            Taking longer than usual. You can retry the transaction or end the level; nothing is charged twice.
          </Txt>
          <View style={styles.pair}>
            <View style={styles.half}>
              <PillButton label="Retry" height={SIZE.secondaryButton} onPress={onRetry} />
            </View>
            <View style={styles.half}>
              <PillButton kind="secondary" label="End level" onPress={onEndLevel} />
            </View>
          </View>
        </>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: { textTransform: 'uppercase', letterSpacing: 0.48 },
  title: { fontFamily: FONTS.medium, fontSize: 24, letterSpacing: -0.72, marginTop: -8 },
  copy: { lineHeight: 19 },
  card: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: 14,
    borderRadius: RADIUS.hudCard, backgroundColor: 'rgba(0,0,0,0.35)', borderWidth: 1, borderColor: 'rgba(236,228,253,0.12)',
  },
  cardLeft: { flexShrink: 1 },
  // Either side may wrap on a narrow screen rather than run out of the card.
  cardRight: { alignItems: 'flex-end', flexShrink: 1 },
  cardLabel: { fontSize: 11 },
  cardError: { marginTop: 2 },
  price: { fontFamily: FONTS.mono, fontSize: 22, color: COLORS.text },
  priceLoading: { alignSelf: 'flex-start', marginTop: 4 },
  drop: { fontFamily: FONTS.mono, fontSize: 13, color: COLORS.info, textAlign: 'right' },
  dropRow: { justifyContent: 'flex-end' },
  ladder: { flexDirection: 'row', gap: 3 },
  segment: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.12)' },
  segmentFilled: { backgroundColor: 'transparent' },
  note: { fontSize: 11, marginTop: -6 },
  swapNote: { fontSize: 12, marginTop: -6 },
  pendingHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pendingText: { flex: 1, minWidth: 0 },
  pendingTitle: { fontFamily: FONTS.medium, fontSize: 18, letterSpacing: -0.36 },
  pair: { flexDirection: 'row', gap: 8 },
  half: { flex: 1 },
});
