import { useEffect, useRef, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { getAudioSettings } from '../audio/settings';
import { playSfx, preloadSfx } from '../audio/sfx';
import { COLORS } from './tokens';

/** How long the splash fades out once the app is ready, in ms. */
const FADE_MS = 420;
/** The key art, drawn twice: blurred edge to edge behind, and whole (never cropped) on top. */
const ART = require('../../assets/splash-keyart.jpg');
const BACKDROP_BLUR = 28;

interface SplashProps {
  /** True while the app is still starting; once false the splash fades out and unmounts. */
  visible: boolean;
}

/**
 * The launch screen: the key art (the stone "SEA INVADERS" letters on the reef) on top of
 * everything until the app has restored its session and loadout. The art is shown whole
 * (`contain`, so no screen ratio ever crops it) over a blurred, edge-to-edge copy of itself that
 * fills whatever the ratio leaves free; on a screen with the art's own ratio the two coincide.
 * Drawn by the app itself rather than the system splash, which on Android 12+ can only show an
 * icon on a plain colour.
 */
export function Splash({ visible }: SplashProps) {
  const opacity = useSharedValue(1);
  const [mounted, setMounted] = useState(true);
  const onScreen = useRef(true);
  useEffect(() => {
    onScreen.current = mounted;
  }, [mounted]);

  // Once at mount, respecting the Sounds switch — including on the very first launch, when nothing
  // is stored yet: `getAudioSettings()` resolves to the on-by-default settings then, same as any
  // later launch where the player left it on. Awaiting the read (rather than reading a synchronous
  // default) matters here: without it, a player who turned Sounds off would still hear this once,
  // for the brief window before AsyncStorage answers. The sound pool decodes in the background
  // (`preloadSfx`, the same promise App starts at mount), and a sound asked for before it is decoded
  // is silently skipped, so the splash waits for the decode too - and stays quiet if the splash has
  // already faded out by then.
  useEffect(() => {
    let alive = true;
    void Promise.all([getAudioSettings(), preloadSfx()]).then(([settings]) => {
      if (alive && onScreen.current && settings.sounds) playSfx('splash');
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (visible) return;
    opacity.value = withTiming(0, { duration: FADE_MS, easing: Easing.out(Easing.quad) }, (finished) => {
      if (finished) runOnJS(setMounted)(false);
    });
  }, [visible, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!mounted) return null;
  return (
    <Animated.View style={[styles.root, style]} pointerEvents={visible ? 'auto' : 'none'}>
      <Image source={ART} style={styles.art} resizeMode="cover" blurRadius={BACKDROP_BLUR} fadeDuration={0} />
      <Image source={ART} style={styles.art} resizeMode="contain" fadeDuration={0} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: COLORS.app },
  art: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' },
});
