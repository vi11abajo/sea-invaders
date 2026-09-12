import { StyleSheet, View } from 'react-native';
import type { Cluster } from '../api/config';
import { PillButton } from '../ui/PillButton';
import { Txt } from '../ui/Txt';

interface TicketCardProps {
  priceSkr: number;
  skrBalance: number;
  cluster: Cluster;
  onBuy: () => void;
  onFaucet: () => void;
  busy?: boolean;
}

/**
 * The ticket purchase prompt shown once today's free attempts run out: buys an extra ranked
 * attempt for `priceSkr` SKR, with a devnet-only faucet pill when the wallet is short on funds.
 * No card chrome of its own — meant to sit inside an existing card or sheet.
 */
export function TicketCard({ priceSkr, skrBalance, cluster, onBuy, onFaucet, busy = false }: TicketCardProps) {
  const short = skrBalance < priceSkr;
  const buyDisabled = busy || (short && cluster !== 'devnet');
  return (
    <View style={styles.root}>
      <Txt variant="secondary" tone="tertiary">{`Balance: ${skrBalance} SKR`}</Txt>
      <PillButton label={busy ? 'Buying…' : `Buy ticket — ${priceSkr} SKR`} onPress={onBuy} disabled={buyDisabled} />
      {cluster === 'devnet' && <PillButton kind="glass" label="Get 100 test SKR" onPress={onFaucet} disabled={busy} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 8 },
});
