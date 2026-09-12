import { useImage, type SkImage } from '@shopify/react-native-skia';
import { useMemo } from 'react';

export interface Sprites {
  ship: { front: SkImage; left: SkImage; right: SkImage };
  /** Colour by `kind` (0..4): green, blue, violet, red, yellow. */
  crabs: SkImage[];
  /** Colour by `kind` (1..5): green, blue, yellow, red, violet. Index 0 is unused (kind is 1-based). */
  bosses: SkImage[];
  bg: SkImage;
}

/**
 * Loads every sprite once via `useImage`. Returns `null` until all of them have decoded, so the
 * caller can hold the game loop and show a loading state instead of drawing with a missing image.
 */
export function useSprites(): Sprites | null {
  const front = useImage(require('../../assets/sprites/octopiFront.png'));
  const left = useImage(require('../../assets/sprites/OctopiLeft.png'));
  const right = useImage(require('../../assets/sprites/octopiRight.png'));

  // Crab colour order matches CRAB_COLORS in draw.ts: kind 0..4.
  const crabGreen = useImage(require('../../assets/sprites/crabGreen.png'));
  const crabBlue = useImage(require('../../assets/sprites/crabBlue.png'));
  const crabViolet = useImage(require('../../assets/sprites/crabViolet.png'));
  const crabRed = useImage(require('../../assets/sprites/crabRed.png'));
  const crabYellow = useImage(require('../../assets/sprites/crabYellow.png'));

  // Boss colour order: kind 1..5.
  const bossGreen = useImage(require('../../assets/sprites/crabBOSSGreen.png'));
  const bossBlue = useImage(require('../../assets/sprites/crabBossBlue.png'));
  const bossYellow = useImage(require('../../assets/sprites/crabBossYellow.png'));
  const bossRed = useImage(require('../../assets/sprites/crabBossRed.png'));
  const bossViolet = useImage(require('../../assets/sprites/crabBossViolet.png'));

  const bg = useImage(require('../../assets/sprites/bg1.png'));

  return useMemo(() => {
    if (
      front === null || left === null || right === null || bg === null ||
      crabGreen === null || crabBlue === null || crabViolet === null || crabRed === null || crabYellow === null ||
      bossGreen === null || bossBlue === null || bossYellow === null || bossRed === null || bossViolet === null
    ) {
      return null;
    }
    return {
      ship: { front, left, right },
      crabs: [crabGreen, crabBlue, crabViolet, crabRed, crabYellow],
      bosses: [bossGreen, bossBlue, bossYellow, bossRed, bossViolet],
      bg,
    };
  }, [
    front, left, right, bg,
    crabGreen, crabBlue, crabViolet, crabRed, crabYellow,
    bossGreen, bossBlue, bossYellow, bossRed, bossViolet,
  ]);
}
