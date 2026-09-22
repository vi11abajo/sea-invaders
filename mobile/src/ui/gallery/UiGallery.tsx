import { InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans/600SemiBold';
import { formatCountdown, formatInt, shortAddress } from '@sea-invaders/core';
import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { HomeScreen } from '../../home/HomeScreen';
import { demoHomeModel, type HomeModel } from '../../home/model';
import { ArtSlot } from '../ArtSlot';
import { Backdrop } from '../Backdrop';
import { BlurText } from '../BlurText';
import { BounceCard } from '../BounceCard';
import { CountUp, formatIntWorklet } from '../CountUp';
import { EntranceRow } from '../EntranceRow';
import { Glass } from '../Glass';
import { GradientFill } from '../GradientFill';
import { GradientText } from '../GradientText';
import { PillButton } from '../PillButton';
import { RubberSegment } from '../RubberSegment';
import { SeekerBadge } from '../SeekerBadge';
import { ShinyText } from '../ShinyText';
import { StarBorder } from '../StarBorder';
import { SquishSwitch } from '../SquishSwitch';
import { Txt } from '../Txt';
import { useAppFonts } from '../fonts';
import { COLORS, RADIUS, REEF_LIFE, SIGNATURE_GRADIENT, TYPE, type WorldTheme } from '../tokens';

const SAMPLE_ADDRESS = '7xKpQm9vLrT2hW8sNc4yBd6fGj1eZa5uXo3fQ';

/** Developer screen showing every design-system part on the device. Opened by seainvaders://ui. */
export function UiGallery() {
  const ready = useAppFonts();
  const { width } = useWindowDimensions();
  const [theme, setTheme] = useState<WorldTheme>('night');
  const [home, setHome] = useState<HomeModel | null>(null);
  const [squish, setSquish] = useState(true);
  const [segment, setSegment] = useState<'today' | 'week'>('today');
  const [blurKey, setBlurKey] = useState(0);
  const [entranceKey, setEntranceKey] = useState(0);
  const [countValue, setCountValue] = useState(1000);

  // System back closes the Home demo; otherwise it does what it normally does.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (home === null) return false;
      setHome(null);
      return true;
    });
    return () => sub.remove();
  }, [home]);

  if (!ready) return <View style={styles.root} />;
  if (home !== null) {
    return (
      <HomeScreen
        model={home}
        onPractice={() => setHome(null)}
        onDaily={() => {}}
        onCampaign={() => {}}
        onLeaderboard={() => {}}
        onShop={() => {}}
        onProfile={() => {}}
        onWallet={() => {}}
        onBuyTicket={() => Promise.resolve(false)}
        onFaucet={() => Promise.resolve()}
      />
    );
  }
  return (
    <View style={styles.root}>
      <Backdrop theme={theme} floorGlow />
      <ScrollView contentContainerStyle={styles.content}>
        <Txt variant="label" tone="tertiary">Design system · UI-1</Txt>
        <Txt variant="sheetTitle">Sea Invaders</Txt>

        <Section title="Screens">
          <PillButton label="Home · demo data" kind="secondary" onPress={() => setHome(demoHomeModel(Date.now()))} />
        </Section>

        <Section title="World theme">
          <View style={styles.row}>
            <PillButton label="Night Reef" kind={theme === 'night' ? 'primary' : 'secondary'} height={40} onPress={() => setTheme('night')} />
            <PillButton label="Day Reef" kind={theme === 'day' ? 'primary' : 'secondary'} height={40} onPress={() => setTheme('day')} />
          </View>
        </Section>

        <Section title="Signature gradient">
          <View style={styles.gradientBar}>
            <GradientFill radius={RADIUS.tile} />
          </View>
          <Txt variant="monoSmall" tone="secondary">{SIGNATURE_GRADIENT.colors.join(' ')}</Txt>
        </Section>

        <Section title="Type">
          <Txt variant="screenTitle">Screen title 17</Txt>
          <Txt variant="headline">2 of 3 attempts</Txt>
          <Txt variant="body">Body 13. Same seed for everyone. Three attempts a day.</Txt>
          <Txt variant="secondary" tone="secondary">Secondary 12 at 64%</Txt>
          <Txt variant="label" tone="tertiary">Label 11 uppercase</Txt>
          <Txt variant="heroNumber">{formatInt(18920)}</Txt>
          <Txt variant="mono" tone="success">{`new in ${formatCountdown(18764)} · ${shortAddress(SAMPLE_ADDRESS)}`}</Txt>
          <GradientText text={`${formatInt(12480)} SKR`} size={30} />
          <GradientText text={formatInt(18020)} size={72} />
        </Section>

        <Section title="Buttons">
          <PillButton label="Play Daily Run" height={64} />
          <PillButton label="Buy ticket — 10 SKR" />
          <PillButton label="Practice" kind="secondary" />
          <PillButton label="Resume" kind="glass" />
          <PillButton label="Play Daily Run" disabled />
          <View style={styles.row}>
            <PillButton label="90 SKR" height={40} />
            <PillButton label="Owned" kind="secondary" height={40} disabled />
          </View>
        </Section>

        <Section title="Squish Switch">
          <View style={styles.row}>
            <SquishSwitch value={squish} onValueChange={setSquish} />
            <Txt variant="body" tone="secondary">{squish ? 'On' : 'Off'}</Txt>
          </View>
        </Section>

        <Section title="Rubber Segment">
          <RubberSegment
            items={[{ value: 'today', label: 'Today' }, { value: 'week', label: 'Week' }] as const}
            value={segment}
            onChange={setSegment}
          />
        </Section>

        <Section title="Blur Text">
          <BlurText key={blurKey} variant="headline" text="Storm Tyrant" />
          <PillButton label="Replay" kind="secondary" height={36} onPress={() => setBlurKey((k) => k + 1)} />
        </Section>

        <Section title="Shiny Text">
          <ShinyText text="CAMPAIGN COMPLETE" fontSource={InstrumentSans_600SemiBold} size={16} color={COLORS.textSecondary} />
        </Section>

        <Section title="Star Border">
          <StarBorder style={styles.starBorderDemo} periodMs={4000}>
            <Txt variant="label" tone="secondary">Orbiting glow</Txt>
          </StarBorder>
        </Section>

        <Section title="Animated List / Bounce Cards">
          <View key={entranceKey} style={styles.entranceDemo}>
            {['Reef 1', 'Reef 2', 'Reef 3'].map((label, i) => (
              <EntranceRow key={label} index={i} style={styles.entranceRow}>
                <Txt variant="body">{label}</Txt>
              </EntranceRow>
            ))}
            <View style={styles.row}>
              {['A', 'B', 'C'].map((label, i) => (
                <BounceCard key={label} index={i} style={styles.bounceCard}>
                  <Txt variant="body">{label}</Txt>
                </BounceCard>
              ))}
            </View>
          </View>
          <PillButton label="Replay" kind="secondary" height={36} onPress={() => setEntranceKey((k) => k + 1)} />
        </Section>

        <Section title="Count Up · retext (SKR balance, result score)">
          <CountUp value={countValue} format={formatIntWorklet} style={TYPE.heroNumber} />
        </Section>

        <Section title="Count Up · throttled (result score's gradient, the pool's sheen)">
          <CountUp value={countValue} duration={800} mode="throttled" format={formatInt}>
            {(text) => <GradientText text={text} size={30} />}
          </CountUp>
          <PillButton label="Add 4,231" kind="secondary" height={36} onPress={() => setCountValue((v) => v + 4231)} />
        </Section>

        <Section title="Surfaces">
          <Glass style={styles.card}>
            <Txt variant="label" tone="tertiary">Daily run · seed #214</Txt>
            <Txt variant="headline">2 of 3 attempts</Txt>
            <View style={styles.row}>
              <Stat label="Today" value={formatInt(18920)} />
              <Stat label="Week · #37" value={formatInt(41300)} />
            </View>
          </Glass>
          <Glass tone="hud" radius={RADIUS.hudCard} style={styles.card}>
            <Txt variant="label" tone="secondary">Daily · seed #214</Txt>
            <Txt variant="heroNumber">{formatInt(42343)}</Txt>
          </Glass>
          <SeekerBadge />
        </Section>

        <Section title="Reef life (never chrome)">
          <View style={styles.row}>
            {Object.values(REEF_LIFE).map((c) => (
              <View key={c} style={[styles.swatch, { backgroundColor: c }]} />
            ))}
          </View>
        </Section>

        <Section title="Owner art slots">
          <View style={styles.row}>
            <ArtSlot size={Math.round(width * 0.4)} label="Octopi" />
            <ArtSlot size={36} label="crab" />
          </View>
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Txt variant="label" tone="tertiary">{title}</Txt>
      {children}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Txt variant="secondary" tone="secondary">{label}</Txt>
      <Txt variant="mono">{value}</Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.app },
  content: { padding: 16, paddingTop: 56, paddingBottom: 48, gap: 8 },
  section: { marginTop: 24, gap: 12 },
  gradientBar: { height: 48, borderRadius: RADIUS.tile, overflow: 'hidden' },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  card: { padding: 16, gap: 8 },
  stat: { minWidth: 120, gap: 2 },
  swatch: { width: 40, height: 40, borderRadius: 8 },
  starBorderDemo: {
    alignSelf: 'flex-start', borderRadius: RADIUS.pill, paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: COLORS.hudGlass, borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  entranceDemo: { gap: 8 },
  entranceRow: {
    padding: 12, borderRadius: RADIUS.row, backgroundColor: COLORS.hudGlass, borderWidth: 1, borderColor: COLORS.glassBorder,
  },
  bounceCard: {
    flex: 1, alignItems: 'center', padding: 12, borderRadius: RADIUS.tile,
    backgroundColor: COLORS.hudGlass, borderWidth: 1, borderColor: COLORS.glassBorder,
  },
});
