import { hapticTap } from './haptics';
import { playSfx } from './sfx';

/**
 * The app's five icon-arrow back buttons (`CampaignScreen.tsx`, `LevelIntro.tsx`, `ProfileScreen.tsx`,
 * `ShopScreen.tsx`, `ResultView.tsx`) are plain `Pressable`s, not `PillButton` - so they miss out on
 * `PillButton`'s own `ui_tap`/`ui_back` + selection wiring. This wraps a screen's own `onBack` with the
 * same `ui_back` sound and a `hapticTap` selection tick, without touching any of the five buttons' look.
 */
export function onBackPress(onBack: () => void): () => void {
  return () => {
    playSfx('ui_back');
    hapticTap();
    onBack();
  };
}
