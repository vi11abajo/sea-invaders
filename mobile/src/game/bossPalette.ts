/**
 * Boss colour by kind, 1-indexed via `kind - 1` (spec §4.2 / §5.2): the first campaign's five
 * (Emerald, Azure, Solar, Crimson, Void) followed by reefs 6-10's five (Verdant Templar, Frost
 * Castellan, Gold Corsair, Storm Tyrant, Abyssal Huntsman). `draw.ts`'s Skia colours and glow
 * shaders and `GameHud.tsx`'s HP-bar tint (`BOSS_COLOR`, an alias of `BOSS_HEX`) both read this one
 * table, so a boss's colour is declared exactly once (task 12, ruling R44) and a later task that adds
 * an eleventh boss touches only this file.
 */
export const BOSS_HEX = [
  '#33cc66', '#3366ff', '#ffdd33', '#ff3333', '#9966ff',
  '#2fbf71', '#4aa8ff', '#ffb52e', '#ff4d4d', '#b066ff',
] as const;

/** `hex` (`#RRGGBB`) as a plain `"r,g,b"` string, for building `rgba(...)` colours. */
function hexToRgb(hex: string): string {
  const v = Number.parseInt(hex.slice(1, 7), 16);
  return `${(v >> 16) & 0xff},${(v >> 8) & 0xff},${v & 0xff}`;
}

/** `BOSS_HEX`, one `"r,g,b"` string per entry, in the same kind order. */
export const BOSS_RGB: readonly string[] = BOSS_HEX.map(hexToRgb);
