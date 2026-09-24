# Third-party notices

The project's own code and art are all rights reserved (see [LICENSE](LICENSE)). The pieces below come from, or are adapted from, third-party work and stay under their own terms.

## React Bits

Copyright (c) 2026 David Haz. Licensed under the **MIT + Commons Clause License Condition v1.0**; the full licence text is at <https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md>. Under its Commons Clause the components themselves are not sold, sublicensed or redistributed on their own; here they are used as part of the game and its landing page only.

Adapted components and where they live:

| React Bits component | Adaptation | File |
|---|---|---|
| Splash Cursor | plain JavaScript, landing page | `site/index.html` |
| Accordion Gallery | plain JavaScript, landing page | `site/index.html` |
| Lightning | Skia SkSL shader: the Storm Tyrant's strike | `mobile/src/game/lightning.ts` |
| Light Tunnel | Skia SkSL shader: the gravity well | `mobile/src/game/tunnel.ts` |
| Orb | Skia SkSL shader: the Storm Tyrant's orb | `mobile/src/game/orb.ts` |
| Magic Rings | Skia SkSL shader: the Tide's return and a boss's phase change | `mobile/src/game/magicRings.ts` |
| Light Rays | Skia SkSL shader: menu and map backdrops | `mobile/src/ui/lightRays.ts`, `mobile/src/ui/Backdrop.tsx`, `mobile/src/campaign/ReefBackdrop.tsx` |
| Balatro | Skia SkSL shader: the Shop's swirl backdrop | `mobile/src/ui/SwirlBackdrop.tsx` |
| Star Border | Skia (rare drops) and React Native (the SEEKER badge) | `mobile/src/game/draw.ts`, `mobile/src/ui/StarBorder.tsx` |
| Jelly Radio | React Native + Reanimated: the champion picker | `mobile/src/campaign/VariantPicker.tsx` |
| Squish Switch | React Native + Reanimated: Profile toggles | `mobile/src/ui/SquishSwitch.tsx` |
| Rubber Segment | React Native + Reanimated: Today / Week switch | `mobile/src/ui/RubberSegment.tsx` |
| Blur Text | React Native + Reanimated: level and boss titles | `mobile/src/ui/BlurText.tsx` |
| Shiny Text | React Native + Skia: the SEEKER label, the weekly pool | `mobile/src/ui/ShinyText.tsx` |
| Animated List, Bounce Cards | React Native + Reanimated: board and shop entrances | `mobile/src/ui/EntranceRow.tsx`, `mobile/src/ui/BounceCard.tsx` |
| Count Up | React Native + Reanimated: scores and balances | `mobile/src/ui/CountUp.tsx` |
| Tear Ticket | React Native + Reanimated: buying a Daily Run ticket | `mobile/src/daily/TicketCard.tsx` |

Each of these files carries its own credit comment.

## Fonts

Instrument Sans and Geist Mono, bundled through `@expo-google-fonts`, are licensed under the SIL Open Font License 1.1.

## Music and sound

Credits and licences for the music and sound effects are listed in `mobile/assets/music/CREDITS.md` and `mobile/assets/sfx/README.md`.

## npm, Cargo and Expo dependencies

Each dependency keeps its own licence, recorded in its package metadata (`package-lock.json`, `Cargo.lock`).
