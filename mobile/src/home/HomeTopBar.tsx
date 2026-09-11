import { formatInt, shortAddress } from '@sea-invaders/core';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GradientFill } from '../ui/GradientFill';
import { COLORS, FONTS, RADIUS, REEF_LIFE, SIZE } from '../ui/tokens';
import type { WalletInfo } from './model';

const AVATAR_GRADIENT = ['#9945FF', '#19FB9B'] as const;
const CAMPAIGN_GRADIENT = ['#43B4CA', '#19FB9B'] as const;
/** 40 dp pills get 4 dp of slop on each side, so the touch target is 48 dp. */
const PILL_SLOP = 4;

export type Feature = 'campaign' | 'shop' | 'ranks' | 'profile';

interface HomeTopBarProps {
  wallet: WalletInfo | null;
  onWallet: () => void;
  onShop: () => void;
}

/** Wallet pill on the left (or "Connect wallet"), SKR balance with a top-up button on the right. */
export function HomeTopBar({ wallet, onWallet, onShop }: HomeTopBarProps) {
  return (
    <View style={styles.bar}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={wallet ? 'Profile' : 'Connect wallet'}
        onPress={onWallet}
        hitSlop={PILL_SLOP}
        style={[styles.glass, styles.pill, wallet ? styles.walletPill : styles.connectPill]}
      >
        {wallet ? (
          <>
            <View style={styles.avatar}>
              <GradientFill radius={14} colors={AVATAR_GRADIENT} />
            </View>
            <Text style={styles.address}>{shortAddress(wallet.address)}</Text>
            {wallet.seeker && (
              <View style={styles.seeker}>
                <Text style={styles.seekerText}>SEEKER</Text>
              </View>
            )}
          </>
        ) : (
          <Text style={styles.connect}>Connect wallet</Text>
        )}
      </Pressable>
      {wallet && (
        <Pressable accessibilityRole="button" accessibilityLabel="Top up SKR" onPress={onShop} hitSlop={PILL_SLOP} style={[styles.glass, styles.pill, styles.skrPill]}>
          <Text style={styles.skr}>{`${formatInt(wallet.skr)} SKR`}</Text>
          <View style={styles.plus}>
            <Text style={styles.plusText}>+</Text>
          </View>
        </Pressable>
      )}
    </View>
  );
}

/** Home's navigation: four round glass buttons with labels. Campaign carries the current level as a badge. */
export function FeatureRow({ campaignBadge, onPress }: { campaignBadge: number | null; onPress: (f: Feature) => void }) {
  return (
    <View style={styles.features}>
      <FeatureButton label="Campaign" badge={campaignBadge} onPress={() => onPress('campaign')}>
        <View style={styles.iconCampaign}>
          <GradientFill radius={4} colors={CAMPAIGN_GRADIENT} />
        </View>
      </FeatureButton>
      <FeatureButton label="Shop" onPress={() => onPress('shop')}>
        <View style={styles.iconShop} />
      </FeatureButton>
      <FeatureButton label="Ranks" onPress={() => onPress('ranks')}>
        <View style={styles.iconRanks} />
      </FeatureButton>
      <FeatureButton label="Profile" onPress={() => onPress('profile')}>
        <View style={styles.iconProfile}>
          <GradientFill radius={8} colors={AVATAR_GRADIENT} />
        </View>
      </FeatureButton>
    </View>
  );
}

function FeatureButton({ label, badge = null, onPress, children }: {
  label: string; badge?: number | null; onPress: () => void; children: ReactNode;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.feature}>
      <View style={[styles.glass, styles.featureIcon]}>
        {children}
        {badge !== null && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={styles.featureLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  glass: { backgroundColor: COLORS.hudGlass, borderWidth: 1, borderColor: COLORS.glassBorder },
  pill: { height: SIZE.compactPill, borderRadius: RADIUS.pill, flexDirection: 'row', alignItems: 'center' },
  walletPill: { paddingLeft: 6, paddingRight: 12, gap: 8 },
  connectPill: { paddingHorizontal: 14 },
  avatar: { width: SIZE.avatar, height: SIZE.avatar },
  address: { fontFamily: FONTS.mono, fontSize: 12, color: COLORS.text },
  seeker: { borderRadius: RADIUS.pill, paddingHorizontal: 5, paddingVertical: 2, backgroundColor: '#FFFFFF' },
  seekerText: { fontFamily: FONTS.semibold, fontSize: 8, letterSpacing: 0.48, color: '#000000' },
  connect: { fontFamily: FONTS.medium, fontSize: 13, color: COLORS.text },
  skrPill: { paddingLeft: 14, paddingRight: 6, gap: 10 },
  skr: { fontFamily: FONTS.mono, fontSize: 13, color: COLORS.text },
  plus: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  plusText: { fontFamily: FONTS.medium, fontSize: 16, lineHeight: 18, color: '#000000' },
  features: { flexDirection: 'row' },
  feature: { flex: 1, alignItems: 'center', gap: 6 },
  featureIcon: { width: SIZE.featureIcon, height: SIZE.featureIcon, borderRadius: SIZE.featureIcon / 2, alignItems: 'center', justifyContent: 'center' },
  iconCampaign: { width: 16, height: 16 },
  iconShop: { width: 16, height: 16, borderRadius: 8, backgroundColor: REEF_LIFE.lilac },
  iconRanks: { width: 16, height: 16, borderRadius: 2, borderWidth: 1.5, borderColor: '#FFFFFF' },
  iconProfile: { width: 16, height: 16 },
  badge: {
    position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9,
    backgroundColor: COLORS.success, alignItems: 'center', justifyContent: 'center',
  },
  badgeText: { fontFamily: FONTS.mono, fontSize: 10, color: '#000000' },
  featureLabel: { fontFamily: FONTS.regular, fontSize: 11, color: 'rgba(255,255,255,0.72)' },
});
