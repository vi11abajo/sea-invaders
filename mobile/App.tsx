import { LEVEL_COUNT, earnedAwards, levelById, newProgress } from '@sea-invaders/core';
import { MobileWalletProvider } from '@wallet-ui/react-native-web3js';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { WalletDeclined, pollUntilConfirmed, sendWithBlockhashRetry, useSignAndSend } from './src/api/chain';
import { APP_IDENTITY, CHAIN, RPC_URL } from './src/api/config';
import { confirmTicket, requestFaucet, requestTicket } from './src/api/daily';
import { useSession } from './src/api/useSession';
import { hapticError, hapticSuccess } from './src/audio/haptics';
import { playMusic, startAmbience, stopAmbience } from './src/audio/music';
import { playSfx, preloadSfx } from './src/audio/sfx';
import { CampaignLevelScreen } from './src/campaign/CampaignLevelScreen';
import { CampaignScreen } from './src/campaign/CampaignScreen';
import { useCampaignSync } from './src/campaign/sync';
import { useCampaign } from './src/campaign/useCampaign';
import { DailyRunScreen } from './src/daily/DailyRunScreen';
import { LeaderboardScreen } from './src/daily/LeaderboardScreen';
import { GameScreen } from './src/game/GameScreen';
import { EquippedOctopiContext, SkinContext } from './src/game/skins';
import { Splash } from './src/ui/Splash';
import { HomeScreen } from './src/home/HomeScreen';
import { useHomeModel } from './src/home/useHomeModel';
import { allowedSelectors, withServedAwards, wornSkin, wornVariant, type Selectors } from './src/loadout/allowed';
import { VARIANT_OCTOPI } from './src/loadout/items';
import { useLoadout, type LoadoutApi } from './src/loadout/useLoadout';
import { ProfileScreen } from './src/profile/ProfileScreen';
import { useSeeker, type SeekerState } from './src/profile/useSeeker';
import { SelfTestScreen } from './src/selftest/SelfTestScreen';
import { ShopScreen } from './src/shop/ShopScreen';
import { Backdrop } from './src/ui/Backdrop';
import { useAppFonts } from './src/ui/fonts';
import { UiGallery } from './src/ui/gallery/UiGallery';

type Route = 'app' | 'selftest' | 'ui' | { kind: 'level'; id: number; tide: boolean };
type Screen =
  | 'home' | 'practice' | 'daily' | 'leaderboard' | 'shop' | 'profile'
  | { kind: 'campaign'; initialReef?: number }
  // `lives`: the hearts a practice walk-on carries into this level from the one just cleared.
  // `qaTide`: the QA deep link's `?tide=1` - the Tide is offered on this practice run's last life.
  | { kind: 'level'; id: number; practice: boolean; lives?: number; qaTide?: boolean };

/** The reef (1..5) that level `id` (1..30) belongs to. */
function reefOf(id: number): number {
  return Math.floor((id - 1) / 6) + 1;
}

/**
 * seainvaders://selftest opens the self-test, seainvaders://ui the design gallery,
 * seainvaders://level/<id> opens that campaign level directly (QA entry point for boss levels), and
 * seainvaders://level/<id>?tide=1 also offers the Tide on its last life, so the revive flow can be
 * tried on a campaign that is already cleared (a practice replay never offers it otherwise);
 * anything else opens the app.
 */
function routeFor(url: string | null): Route {
  if (url === null) return 'app';
  if (url.startsWith('seainvaders://selftest')) return 'selftest';
  if (url.startsWith('seainvaders://ui')) return 'ui';
  const level = /^seainvaders:\/\/level\/(\d+)/.exec(url);
  if (level) {
    const id = Number(level[1]);
    if (Number.isInteger(id) && id >= 1 && id <= LEVEL_COUNT) return { kind: 'level', id, tide: /[?&]tide=1(&|$)/.test(url) };
  }
  return 'app';
}

/**
 * Owns the session, the loadout, the campaign progress and the Seeker status, and puts the
 * loadout's active skin and equipped octopi variant on every screen below it (Home's hero, the game,
 * the result pose read them through `SkinContext` and `EquippedOctopiContext`).
 *
 * What may be worn is decided here, once (champions and skins design doc §3): the wallet's items,
 * the awards the campaign has earned and the Seeker link. A selector that is no longer allowed (a
 * demo campaign reset un-earns an award) is worn as the base, in every screen alike.
 */
function Shell({ initialLevel = null }: { initialLevel?: { id: number; tide: boolean } | null }) {
  const auth = useSession();
  const loadout = useLoadout(auth.session, auth.restoring);
  // Hoisted from `Screens`: the allowed selectors below need the campaign's awards and the link.
  const campaign = useCampaign();
  const seeker = useSeeker(auth.session);
  const earned = useMemo(() => earnedAwards(campaign.progress ?? newProgress(0)), [campaign.progress]);
  const { owned, earned: served, seekerSkin, activeSkin, activeVariant } = loadout.loadout;
  // Signed in, what the backend has derived counts too: it is the one that validates a choice.
  const seekerLinked = seeker.status === 'linked' || seekerSkin;
  const allowed = useMemo(
    () => allowedSelectors(owned, withServedAwards(earned, served), seekerLinked),
    [owned, earned, served, seekerLinked],
  );
  const splashOver = useSplashGate(!auth.restoring && loadout.loadout.ready);
  return (
    <SkinContext.Provider value={wornSkin(allowed, activeSkin)}>
      <EquippedOctopiContext.Provider value={VARIANT_OCTOPI[wornVariant(allowed, activeVariant)]}>
        <View style={styles.app}>
          <Screens initialLevel={initialLevel} auth={auth} loadout={loadout} campaign={campaign} seeker={seeker} allowed={allowed} />
          <Splash visible={!splashOver} />
        </View>
      </EquippedOctopiContext.Provider>
    </SkinContext.Provider>
  );
}

/** The splash stays up at least this long, so a fast start does not flash the key art. */
const SPLASH_MIN_MS = 1870; // 1400 + 33 % (owner, 2026-09-15)

/** True once the app is ready AND the splash has been shown for `SPLASH_MIN_MS`. */
function useSplashGate(ready: boolean): boolean {
  const shownAt = useRef(Date.now());
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!ready || over) return;
    const wait = Math.max(0, shownAt.current + SPLASH_MIN_MS - Date.now());
    const timer = setTimeout(() => setOver(true), wait);
    return () => clearTimeout(timer);
  }, [ready, over]);
  return over;
}

interface ScreensProps {
  initialLevel: { id: number; tide: boolean } | null;
  auth: ReturnType<typeof useSession>;
  loadout: LoadoutApi;
  campaign: ReturnType<typeof useCampaign>;
  /** One Seeker status for the whole shell (Phase 3C): Home's wallet pill and the Profile's Seeker row read the same hook, so they can never disagree. */
  seeker: SeekerState;
  /** The selectors this player may wear (`allowedSelectors`): the Profile's tiles and the Level start picker. */
  allowed: Selectors;
}

/** Everything that needs the wallet provider and the session. */
function Screens({ initialLevel, auth, loadout, campaign, seeker, allowed }: ScreensProps) {
  // The deep link is a QA tool: it always opens in practice mode so it can never mutate real
  // progress (a non-current level would also make finishLevel reject — see CampaignLevelScreen).
  const [screen, setScreen] = useState<Screen>(
    initialLevel !== null ? { kind: 'level', id: initialLevel.id, practice: true, qaTide: initialLevel.tide } : 'home',
  );
  // Bumped on every level (re-)entry so the level screen's key changes even when `id`/`practice`
  // do not (e.g. "Retry level"), forcing a fresh mount instead of reusing the finished run's state.
  const [levelAttempt, setLevelAttempt] = useState(0);
  const { session, restoring, loading: signingIn, signIn, signOut, error } = auth;
  // The campaign map's new design has no sync indicator; the sync itself still needs to run.
  useCampaignSync(session, campaign.progress, campaign.replaceProgress);
  const { model, refresh, error: homeError } = useHomeModel(session, campaign.progress, seeker.status === 'linked');
  const signAndSend = useSignAndSend();
  const [ticketBusy, setTicketBusy] = useState(false);
  const [ticketMessage, setTicketMessage] = useState<string | null>(null);
  // Where the Shop's Back returns: Home (null), or the Level start screen whose locked octopi tile
  // opened it, so a purchase made there can be picked at once.
  const [shopReturn, setShopReturn] = useState<Screen | null>(null);
  const home = () => {
    setScreen('home');
    refresh();
  };
  const openShop = (from: Screen | null) => {
    setShopReturn(from);
    setScreen('shop');
  };
  const leaveShop = () => {
    if (shopReturn === null) home();
    else setScreen(shopReturn);
  };

  // The Shop needs a session (Home and the Level start only open it signed in); if the session goes
  // away while it is open, return Home instead of leaving a stale 'shop' to reappear on the next sign-in.
  useEffect(() => {
    if (screen === 'shop' && session === null && !restoring) setScreen('home');
  }, [screen, session, restoring]);

  // One music track per screen (design doc table B), in this one place rather than in every screen:
  // Home/Shop/Profile/the leaderboards share the theme, the campaign map gets its own, and a level
  // gets the boss theme or the run theme by its own `boss` flag (a pure lookup from its id, so the
  // level's own Level-start and boss-reveal screens - still the same `screen` value - already get it
  // from the moment they open). The result screen is that same `screen` value too, so it simply keeps
  // whatever the run was already playing. `playMusic` is idempotent for the same id, so re-running
  // this on every unrelated render (e.g. `ticketMessage` changing) is harmless.
  // The bubbles-only ambience loop rides along, but only under Home, the Shop and the Profile
  // (owner decision 2026-09-16: nowhere near a run, the map or the boards).
  useEffect(() => {
    if (screen === 'home' || screen === 'shop' || screen === 'profile') startAmbience();
    else stopAmbience();
    if (typeof screen === 'object') {
      if (screen.kind === 'campaign') {
        playMusic('music_map');
        return;
      }
      playMusic(levelById(screen.id).boss !== undefined ? 'music_boss' : 'music_run');
      return;
    }
    if (screen === 'practice' || screen === 'daily') {
      playMusic('music_run');
      return;
    }
    playMusic('music_home'); // home, shop, profile, leaderboard
  }, [screen]);

  // Screens show `ticketMessage` as a one-shot toast (an effect keyed on the prop value, so a
  // repeated identical string or a remount would otherwise replay it). Clearing it back to null
  // right after this render commits means every new message is a real null -> text transition —
  // the screen's effect always fires exactly once per message, and re-entering a screen later
  // sees null rather than replaying whatever was last shown.
  useEffect(() => {
    if (ticketMessage === null) return;
    setTicketMessage(null);
  }, [ticketMessage]);

  // Buys a ranked ticket: prepare, sign and send (a stale blockhash gets one fresh
  // prepare-and-retry), then poll the backend until the tx is confirmed on-chain before
  // refreshing — the backend only clears its 5s player cache once it sees the confirmation, so
  // refreshing any earlier can still show the pre-purchase attempt count. A decline leaves the
  // caller on the same screen with no message (spec §8).
  const buyTicket = useCallback(async (): Promise<boolean> => {
    setTicketBusy(true);
    try {
      const { signature } = await sendWithBlockhashRetry(requestTicket, signAndSend);
      playSfx('tx_sent');
      await pollUntilConfirmed(() => confirmTicket(signature));
      setTicketMessage('Ticket bought');
      playSfx('tx_confirmed');
      playSfx('ticket_bought');
      hapticSuccess();
      refresh();
      return true;
    } catch (e) {
      if (!(e instanceof WalletDeclined)) setTicketMessage(e instanceof Error ? e.message : 'Purchase failed');
      playSfx('ui_error');
      hapticError();
      return false;
    } finally {
      setTicketBusy(false);
    }
  }, [signAndSend, refresh]);

  const buyFaucet = useCallback(async () => {
    setTicketBusy(true);
    try {
      const { amountSkr } = await requestFaucet();
      setTicketMessage(`+${amountSkr} SKR from the faucet`);
      refresh();
    } catch (e) {
      setTicketMessage(e instanceof Error ? e.message : 'Faucet failed');
    } finally {
      setTicketBusy(false);
    }
  }, [refresh]);

  // Until the stored session and the loadout's offline copy are read, show the backdrop only, so a
  // cold start does not flash "Connect wallet" or Octopi's base colours before they resolve. A
  // sign-in in flight keeps Home on screen.
  if (restoring || !loadout.loadout.ready) return <Backdrop />;

  // The campaign screens need the loaded progress; a fresh install or the level deep link can
  // reach them before AsyncStorage resolves, so they briefly show the backdrop only.
  if (typeof screen === 'object') {
    if (campaign.progress === null) return <Backdrop />;
    if (screen.kind === 'campaign') {
      return (
        <CampaignScreen
          key={screen.initialReef ?? 'auto'}
          progress={campaign.progress}
          initialReef={screen.initialReef}
          onPlay={(id, practice) => setScreen({ kind: 'level', id, practice })}
          onBack={home}
        />
      );
    }
    return (
      <CampaignLevelScreen
        key={`${screen.id}-${screen.practice}-${levelAttempt}`}
        levelId={screen.id}
        practice={screen.practice}
        lives={screen.lives}
        qaTide={screen.qaTide}
        progress={campaign.progress}
        startLevel={campaign.startLevel}
        finishLevel={campaign.finishLevel}
        loadout={loadout}
        allowed={allowed}
        signedIn={session !== null}
        connecting={signingIn}
        signInError={error}
        onConnect={() => void signIn()}
        onOpenShop={() => openShop(screen)}
        onNext={(id, practice = false, lives) => {
          setLevelAttempt((n) => n + 1);
          setScreen({ kind: 'level', id, practice, lives });
        }}
        onDone={() => setScreen({ kind: 'campaign', initialReef: reefOf(screen.id) })}
        onExit={() => setScreen({ kind: 'campaign', initialReef: reefOf(screen.id) })}
      />
    );
  }

  switch (screen) {
    case 'practice':
      return <GameScreen onExit={home} />;
    case 'daily':
      return (
        <DailyRunScreen
          onExit={home}
          ticket={
            model.ranked && model.wallet
              ? { priceSkr: model.ranked.ticketPriceSkr, skrBalance: model.wallet.skr, cluster: model.ranked.cluster }
              : null
          }
          onBuyTicket={buyTicket}
          onFaucet={buyFaucet}
          ticketBusy={ticketBusy}
          alert={ticketMessage}
          recordedBest={model.ranked?.recordedBest ?? 0}
          onRecorded={refresh}
        />
      );
    case 'leaderboard':
      return <LeaderboardScreen onBack={home} />;
    case 'shop':
      if (session !== null) return <ShopScreen walletAddress={session.walletAddress} onBack={leaveShop} />;
      return <Backdrop />;
    case 'profile':
      return (
        <ProfileScreen
          walletAddress={session?.walletAddress ?? null}
          loadout={loadout.loadout}
          allowed={allowed}
          onEquip={loadout.equip}
          onReloadLoadout={loadout.refresh}
          onConnect={() => void signIn()}
          connecting={signingIn}
          signInError={error}
          onDisconnect={() => void signOut()}
          onBack={home}
          seeker={seeker}
        />
      );
    default:
      return (
        <HomeScreen
          model={model}
          onPractice={() => setScreen('practice')}
          onDaily={() => setScreen('daily')}
          onCampaign={() => setScreen({ kind: 'campaign' })}
          onLeaderboard={() => setScreen('leaderboard')}
          onShop={() => openShop(null)}
          onProfile={() => setScreen('profile')}
          onWallet={() => void signIn()}
          onBuyTicket={buyTicket}
          onFaucet={buyFaucet}
          onRecorded={refresh}
          ticketBusy={ticketBusy}
          alert={ticketMessage ?? error}
          dailyError={homeError}
        />
      );
  }
}

export default function App() {
  const [route, setRoute] = useState<Route>('app');
  const fontsReady = useAppFonts();

  useEffect(() => {
    Linking.getInitialURL().then((url) => setRoute(routeFor(url)));
    const sub = Linking.addEventListener('url', ({ url }) => setRoute(routeFor(url)));
    return () => sub.remove();
  }, []);

  // Decode every one-shot into the sound pool once, after the first render: the work happens off
  // the main thread behind the splash, and anything asked for before it lands stays silent.
  useEffect(() => {
    void preloadSfx();
  }, []);

  if (!fontsReady) return null;

  const initialLevel = typeof route === 'object' ? { id: route.id, tide: route.tide } : null;

  return (
    <MobileWalletProvider chain={CHAIN} endpoint={RPC_URL} identity={APP_IDENTITY}>
      <StatusBar hidden />
      {route === 'selftest' ? <SelfTestScreen /> : route === 'ui' ? <UiGallery /> : <Shell initialLevel={initialLevel} />}
    </MobileWalletProvider>
  );
}

const styles = StyleSheet.create({
  app: { flex: 1 },
});
