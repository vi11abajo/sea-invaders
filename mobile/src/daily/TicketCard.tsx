import { useCallback, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withSpring, withTiming, type WithSpringConfig,
} from 'react-native-reanimated';
import type { Cluster } from '../api/config';
import { PillButton } from '../ui/PillButton';
import { Txt } from '../ui/Txt';
import { COLORS, RADIUS } from '../ui/tokens';

interface TicketCardProps {
  priceSkr: number;
  skrBalance: number;
  cluster: Cluster;
  /** Buys the ticket on-chain; resolves the purchase's outcome so the stub's tear can complete or
   * spring back onto the body. */
  onBuy: () => Promise<boolean>;
  onFaucet: () => void;
  busy?: boolean;
}

/** Holding: the stub lifts a little, as if pinched, before the purchase resolves either way. */
const HOLD_SPRING: WithSpringConfig = { stiffness: 260, damping: 20, mass: 0.8 };
/** Completing: the stub keeps tearing away, then fades. */
const TEAR_TIMING = { duration: 260, easing: Easing.in(Easing.cubic) };
const FADE_TIMING = { duration: 200, easing: Easing.linear };
/** A declined/failed purchase: the stub springs back onto the body. */
const SPRING_BACK: WithSpringConfig = { stiffness: 320, damping: 18, mass: 0.7 };
const STAMP_SPRING: WithSpringConfig = { stiffness: 300, damping: 16, mass: 0.7 };
/** Perforation dots between the ticket's body and its stub. */
const PERFORATION_DOTS = 14;

/**
 * Tear Ticket (React Bits `TearTicket`): the ticket's stub tears off across the purchase. Tickets
 * are bought through `App.tsx`'s own `buyTicket` (prepare -> wallet sign -> poll-confirm; see its
 * comment on `usePurchase.ts` — tickets deliberately do not run through that hook) — unchanged here;
 * this only reads its outcome. A press starts the tear (the stub lifts, held); the purchase promise
 * resolving `true` completes the tear and stamps the body "Bought"; resolving `false` (a decline or
 * failure — the flow's own toast already explains which) springs the stub back into place.
 */
export function TicketCard({ priceSkr, skrBalance, cluster, onBuy, onFaucet, busy = false }: TicketCardProps) {
  const short = skrBalance < priceSkr;
  const buyDisabled = busy || (short && cluster !== 'devnet');
  const [done, setDone] = useState(false);
  const tearY = useSharedValue(0);
  const tearRotate = useSharedValue(0);
  const tearOpacity = useSharedValue(1);
  const stamp = useSharedValue(0);
  const pending = useRef(false);

  const press = useCallback(async () => {
    if (buyDisabled || pending.current || done) return;
    pending.current = true;
    tearY.value = withSpring(6, HOLD_SPRING);
    tearRotate.value = withSpring(2, HOLD_SPRING);
    let ok = false;
    try {
      ok = await onBuy();
    } catch {
      ok = false;
    } finally {
      pending.current = false;
    }
    if (ok) {
      tearY.value = withTiming(40, TEAR_TIMING);
      tearRotate.value = withTiming(8, TEAR_TIMING);
      tearOpacity.value = withDelay(140, withTiming(0, FADE_TIMING));
      stamp.value = withDelay(180, withSpring(1, STAMP_SPRING));
      setDone(true);
    } else {
      tearY.value = withSpring(0, SPRING_BACK);
      tearRotate.value = withSpring(0, SPRING_BACK);
    }
  }, [buyDisabled, done, onBuy, tearY, tearRotate, tearOpacity, stamp]);

  const stubStyle = useAnimatedStyle(() => ({
    opacity: tearOpacity.value,
    transform: [{ translateY: tearY.value }, { rotate: `${tearRotate.value}deg` }],
  }));
  const stampStyle = useAnimatedStyle(() => ({
    opacity: stamp.value,
    transform: [{ scale: 0.7 + stamp.value * 0.3 }],
  }));

  return (
    <View style={styles.root}>
      <View style={styles.ticket}>
        <View style={styles.body}>
          <Txt variant="label" tone="tertiary">Daily Run ticket</Txt>
          <Txt variant="secondary" tone="secondary">{`Balance: ${skrBalance} SKR`}</Txt>
        </View>
        {done && (
          <Animated.View style={[styles.stamp, stampStyle]} pointerEvents="none">
            <Txt variant="label" tone="success">Bought</Txt>
          </Animated.View>
        )}
        <View style={styles.perforation}>
          {Array.from({ length: PERFORATION_DOTS }, (_, i) => <View key={i} style={styles.dot} />)}
        </View>
        <Animated.View style={stubStyle}>
          <PillButton
            label={busy ? 'Buying…' : 'Buy ticket —'}
            skr={busy ? undefined : String(priceSkr)}
            onPress={() => void press()}
            disabled={buyDisabled || done}
          />
        </Animated.View>
      </View>
      {cluster === 'devnet' && short && <PillButton kind="glass" label="Get 100 test SKR" onPress={onFaucet} disabled={busy} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
  ticket: {
    gap: 8, padding: 10, borderRadius: RADIUS.row,
    backgroundColor: 'rgba(236,228,253,0.06)', borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  body: { gap: 2 },
  stamp: { position: 'absolute', right: 10, top: 10 },
  perforation: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center' },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: COLORS.glassBorder },
});
