# Sea Invaders

An arcade shooter under the sea, built for the Solana Seeker. You play Octopi, an octopus defending the reef from waves of crabs and their ten sea-lord bosses. One shared daily seed for everyone, ranked on-chain, with a weekly SKR prize pool paid by the program itself.

The current build runs on devnet against a test SKR mint; the app is the only client.

**Play it:** the signed Android build and a tour of the game are at [seainvaders.xyz](https://seainvaders.xyz/). Practice and the campaign need nothing; ranked runs, the shop and the Tide need a wallet on devnet, and the app hands out test SKR.

## What is in the game

- **Daily Run.** Every UTC day has one seed for all players. Runs are simulated by a deterministic core, recorded as replays of your touches and re-verified on the server before they count. A ticket costs 10 SKR and gives 3 ranked attempts for the day; you can buy as many as you like. 95 % of every ticket goes to the week's prize pool, 5 % to the treasury.
- **On-chain records.** Your best score of the day is written to your on-chain player account with a server co-signature, so nobody can record a score the server did not verify.
- **Weekly pool.** Weeks run Monday to Monday (UTC). Your weekly score is the sum of your daily bests; on Monday the program pays the top 10 straight to their token accounts and rolls empty places into the next week. A fifth of every shop purchase and every revive flows into the pool as well.
- **Campaign.** 60 levels across 10 reefs, each reef ending in its own boss with abilities and, from the second reef on, several phases: Emerald Warlord, Azure Leviathan, Solar Kraken, Crimson Behemoth and Void Sovereign on the first five reefs; Verdant Templar (a shell shield with windows and a wall of fire), Frost Castellan (crystals that block both sides' shots), Gold Corsair (boarding crews and reflecting spikes), Storm Tyrant (lightning lanes) and Abyssal Huntsman (aimed needles, decoys, and a mirror of every boost you pick up) on the deep five. Every wave arrives as a different silhouette of crabs (a fish, a ring, a jellyfish, a wreck, a whirlpool and more), never the same one twice in a level; three of the silhouettes are alive and rotate, split or reform as you thin them. There are ten kinds of crab, one new kind per reef, and colour is kind: armored takes two hits, swift fires twice as often, a heavy crab's shot costs two lives, the elder takes three hits; the veterans of reefs 6-10 carry skills — the warden's rune shield, the herald's aura, the bubbler's bubbles, the bombardier's bursting charge, the patriarch's rally and rage. Reef lives carry from level to level; progress is synced to your account, and a cleared reef can be replayed level after level with the hearts you have left.
- **Boosts.** 15 drop-in power-ups in every mode, from rapid fire and ice freeze to a wave blast and a gravity well that swallows enemy shots.
- **The Tide.** When the reef takes your last life, the Tide offers a revive for SKR: 3 lives back, at a price that rises with every use and cools off over time, all read from the chain. The revived run waits until you press Resume.
- **Champions and skins.** Eight drawn champions, each an Octopi with an ability: Azul (Harpoon, fire rate +33 %), Krang (Anchor, +1 life), Poseidon (Trident, piercing shots), Noob (Thick skin, a longer grace after a hit), Coraluna (Surge, a free bottom-row sweep every 30 kills), Shoupe (Last stand, faster fire on the last life), Hex (enemy shots 10 % slower) and Kakashi (Copy, boosts last half again as long). Seventeen looks besides Octopi's own: four tints and eight drawn skins sold for SKR through the on-chain catalog, four drawn skins won from the reef bosses 2, 4, 6 and 8, and the Seeker look for verified Seekers; Hex and Kakashi are won from bosses 5 and 10. A skin changes only the look; the champion's ability works under any skin. Abilities belong to the campaign: the Daily Run and Practice always play the base Octopi, so a ranked score never depends on what a player bought; only the equipped look carries over. Prices live on chain, never in the app. The look you equip is the look your record wears on the leaderboards.
- **Seeker badge.** Seeker owners link their Seeker Genesis Token once; the server verifies it on mainnet, the program stores the link, and the SEEKER badge follows them on every board.
- **Practice.** The same game on a random seed, no wallet needed, never ranked.
- **Sound and haptics.** Underwater sound effects played through a small native SoundPool module, music per screen, and haptic ticks on hits, bosses and clears; each can be switched off in Profile.
- **Wallet sign-in.** Mobile Wallet Adapter plus Sign-In With Solana; the app never holds a key.

## How a ranked run works

1. The app signs in with the wallet and asks the backend for today's state (attempts, best, pool).
2. The app asks to start a run and names the core version it plays. An app on another core version is told to update (HTTP 426) before any attempt is spent; otherwise, when attempts remain, the backend starts the run and returns the daily seed.
3. The core plays the run on the phone and records the finger inputs as a replay.
4. The backend re-simulates the replay with the same core version against the day's seed; the score and state hash it keeps are the ones its own simulation produces, never numbers sent by the app. A replay from a core version other than the run's is rejected; the attempt is given back only when the server itself was upgraded while the run was being played.
5. The app asks the backend for a record transaction; the server partially signs it, the wallet signs and sends it.
6. The program updates the player's day bests and the week's top 10; a weekly job settles the pool on Monday.

Purchases, revives and the Seeker link follow the same shape: the backend builds the transaction (with a maximum price the player accepted, where money moves), the wallet signs it, and the backend confirms it on chain before it changes anything.

## On-chain program

| Instruction | What it does |
|---|---|
| `create_player` | the player's account, created on first use |
| `buy_ticket` | pays a ticket in SKR, splits it between the week's pool and the treasury, grants attempts |
| `submit_daily_best` | records a server-co-signed day best and updates the week's top 10 |
| `create_week_pool` / `settle_week` | opens a week's pool; pays the top 10 and rolls the rest into the next week |
| `init_catalog` / `set_catalog` | the shop's items and prices |
| `purchase` | buys an item for at most the price the player saw |
| `revive` | pays the Tide's current step for at most the price the player saw |
| `link_seeker` | links a Seeker Genesis Token to the player, once, co-signed by the server after the mainnet check |
| `fund_pool` | anyone can add SKR to the current week's pool |
| `init_config` / `update_config` / `set_paused` | the admin's settings: ticket price, splits, the Tide's ladder, the payout table, the pause switch |

## Tech stack

| Part | Stack |
|---|---|
| Mobile app (`mobile/`) | Expo SDK 57, React Native 0.86, React Native Skia, Reanimated, Hermes, Mobile Wallet Adapter |
| Game core (`core/`) | TypeScript, integer-only deterministic simulation, replays and golden tests (Vitest) |
| Backend (`backend/`) | Node.js, Express, PostgreSQL, JWT, Sign-In With Solana, `@solana/web3.js`, Helius (mainnet reads) |
| On-chain (`programs/`) | Anchor 1.2 program and its devnet scripts |
| Landing page (`site/`) | one static HTML file with its assets, no build step |

## Project structure

```
mobile/         Expo/React Native app: wallet sign-in, daily run, campaign, shop, the Tide, leaderboards, profile
core/           @sea-invaders/core: the deterministic game engine shared by the app and the backend
backend/        Express API: auth, runs and replay verification, on-chain reads and transaction building, weekly crank
programs/       Anchor program and the scripts that configure it on devnet
site/           the landing page served at seainvaders.xyz, with the APK download
tools/          octopi-sprites.py: prepares the drawn Octopi looks for the app
.github/        CI for core, backend and the program, plus the manual Deploy API and Build APK workflows
```

## Getting started

Requirements: Node.js 20.19.4+, 22.13+ or 24.3+ (the versions the app's React Native and Metro accept; CI uses 20 and 22), PostgreSQL, and for the app JDK 17 and the Android SDK (see the Expo documentation). The Anchor program has its own toolchain, described in `programs/README.md`.

### 1. Core

```bash
cd core
npm install
npm test        # unit tests and golden replays
npm run build   # the backend imports core/dist
```

### 2. Database

Create a PostgreSQL database and a user that owns it, then put them into `backend/.env` (`DB_*`). `backend/DEPLOYMENT.md` shows the production layout.

### 3. Backend

```bash
cd backend
npm install
cp .env.example .env    # then fill in the values
npm run migrate
npm run dev
```

The chain settings (`SOLANA_CLUSTER`, `SOLANA_RPC_URL`, `PROGRAM_ID`, `SKR_MINT`, `SERVER_AUTHORITY_SECRET`) point at the devnet deployment; `programs/scripts/README.md` describes how the devnet config, test mint, catalog and week pools are set up.

`SERVER_AUTHORITY_SECRET` is a private key: the base58 of a 64-byte Solana keypair, the server's co-signer. It must never be committed, and the deployment's own key is not published. The placeholder in `.env.example` is refused at startup, so replace it before `npm run dev`; for a local run, generate a throwaway key from `backend/`:

```bash
node -e "const{Keypair}=require('@solana/web3.js');console.log(require('bs58').default.encode(Keypair.generate().secretKey))"
```

With a key of your own the API starts and serves reads, but the devnet program accepts records and Seeker links only when its configured server authority co-signs, and the faucet mints only with that key, so a full local loop needs your own deployment set up with `programs/scripts/`. `HELIUS_API_KEY` enables the Seeker check; without it `POST /api/seeker/link` answers 503 and everything else works.

### 4. Mobile app

```bash
cd mobile
npm install
cp .env.example .env    # API URL (your LAN backend or https://api.seainvaders.xyz), RPC URL, cluster
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

`EXPO_PUBLIC_*` values are inlined into the APK, so the app holds no secrets. A local release build is signed with the debug key unless the four `SEA_RELEASE_*` signing variables are set for both `expo prebuild` and the Gradle build; the "Build APK" workflow signs with the project's release key. Opening `seainvaders://selftest` on the device runs the core's golden replays on Hermes and reports whether they match the Node results.

### 5. Program

`programs/README.md` covers building and testing with Anchor; `programs/scripts/README.md` covers the devnet configuration (`npm run devnet:catalog`, `npm run devnet:prices`, the smoke test); every script requires `KEYS_DIR`, the directory holding your own admin and server-authority keypairs, which never enter the repository.

## Deployment

The API (backend plus the built core) is deployed by the "Deploy API to VPS" GitHub Actions workflow, started manually from the **Actions** tab; `backend/DEPLOYMENT.md` documents the target layout, the PM2 processes (the API and the hourly weekly crank), migrations and the environment. The "Build APK" workflow builds the signed Android release for the Seeker. The landing page is a static folder (`site/`) served by nginx at seainvaders.xyz next to the app's Digital Asset Links file; `site/README.md` describes how it is published.

## Security

Please report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## License

All rights reserved. The source is published for reading and evaluation; see [LICENSE](LICENSE). Third-party notices stay in the files they apply to. React Bits components (MIT + Commons Clause) are adapted in two places:

- the landing page's Splash Cursor and screen gallery (Accordion Gallery), plain-JS adaptations credited in `site/index.html`;
- six shaders in the app, ported to Skia's SkSL and credited in each file: `Lightning` (the Storm Tyrant's strike, `mobile/src/game/lightning.ts`), `LightTunnel` (the gravity well, `mobile/src/game/tunnel.ts`), `Orb` (the Storm Tyrant's orb, `mobile/src/game/orb.ts`), `MagicRings` (the Tide's return and a boss's phase change, `mobile/src/game/magicRings.ts`), `LightRays` (the menu and campaign-map backdrops, `mobile/src/ui/lightRays.ts`) and `Balatro` (the Shop's swirl backdrop, `mobile/src/ui/SwirlBackdrop.tsx`).

The app bundles the Instrument Sans and Geist Mono fonts (SIL Open Font License 1.1) through `@expo-google-fonts`.
