# Sea Invaders

An arcade shooter under the sea, built for the Solana Seeker. You play Octopi, an octopus defending the reef from waves of crabs and their five sea-lord bosses. One shared daily seed for everyone, ranked on-chain, with a weekly SKR prize pool paid by the program itself.

The current build runs on devnet against a test SKR mint; the app is the only client.

## What is in the game

- **Daily Run.** Every UTC day has one seed for all players. Runs are simulated by a deterministic core, recorded as replays of your touches and re-verified on the server before they count. A ticket costs 10 SKR and gives 3 ranked attempts for the day; you can buy as many as you like. 95 % of every ticket goes to the week's prize pool, 5 % to the treasury.
- **On-chain records.** Your best score of the day is written to your on-chain player account with a server co-signature, so nobody can record a score the server did not verify.
- **Weekly pool.** Weeks run Monday to Monday (UTC). Your weekly score is the sum of your daily bests; on Monday the program pays the top 10 straight to their token accounts and rolls empty places into the next week.
- **Campaign.** 30 levels across 5 reefs, each reef ending in its own boss (Emerald Warlord, Azure Leviathan, Solar Kraken, Crimson Behemoth, Void Sovereign) with phases and abilities. Reef lives carry from level to level; progress is synced to your account.
- **Boosts.** 15 drop-in power-ups in every mode, from rapid fire and ice freeze to a wave blast and a gravity well that swallows enemy shots.
- **The Tide.** When the reef takes your last life, the Tide offers a revive for SKR: 3 lives back, at a price that rises with every use and cools off over time, all read from the chain.
- **Shop and loadout.** Octopi variants (Harpoon, Anchor, Trident) and cosmetic skins, sold for SKR through an on-chain catalog; the look you equip is the look your record wears on the leaderboards.
- **Seeker badge.** Seeker owners link their Seeker Genesis Token once; the server verifies it on mainnet, the program stores the link, and the SEEKER badge follows them on every board.
- **Practice.** The same game on a random seed, no wallet needed, never ranked.
- **Wallet sign-in.** Mobile Wallet Adapter plus Sign-In With Solana; the app never holds a key.

## How a ranked run works

1. The app signs in with the wallet and asks the backend for today's state (attempts, best, pool).
2. When attempts remain, the backend starts a run and returns the daily seed.
3. The core plays the run on the phone and records the finger inputs as a replay.
4. The backend re-simulates the replay with the same core version and checks the score and the state hash.
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

## Tech stack

| Part | Stack |
|---|---|
| Mobile app (`mobile/`) | Expo SDK 57, React Native 0.86, React Native Skia, Reanimated, Hermes, Mobile Wallet Adapter |
| Game core (`core/`) | TypeScript, integer-only deterministic simulation, replays and golden tests (Vitest) |
| Backend (`backend/`) | Node.js, Express, PostgreSQL, JWT, Sign-In With Solana, `@solana/web3.js`, Helius (mainnet reads) |
| On-chain (`programs/`) | Anchor 1.2 program and its devnet scripts |

## Project structure

```
mobile/         Expo/React Native app: wallet sign-in, daily run, campaign, shop, the Tide, leaderboards, profile
core/           @sea-invaders/core: the deterministic game engine shared by the app and the backend
backend/        Express API: auth, runs and replay verification, on-chain reads and transaction building, weekly crank
programs/       Anchor program and the scripts that configure it on devnet
```

## Getting started

Requirements: Node.js 20 or newer, PostgreSQL, and for the app a JDK and the Android SDK (see the Expo documentation). The Anchor program has its own toolchain, described in `programs/README.md`.

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

The chain settings (`SOLANA_CLUSTER`, `SOLANA_RPC_URL`, `PROGRAM_ID`, `SKR_MINT`, `SERVER_AUTHORITY_SECRET`) point at the devnet deployment; `programs/scripts/README.md` describes how the devnet config, test mint, catalog and week pools are set up. `HELIUS_API_KEY` enables the Seeker check; without it the Seeker routes answer 503 and everything else works.

### 4. Mobile app

```bash
cd mobile
npm install
cp .env.example .env    # API URL (your LAN backend or https://api.seainvaders.xyz), RPC URL, cluster
npx expo prebuild --platform android
cd android && ./gradlew assembleRelease
adb install -r app/build/outputs/apk/release/app-release.apk
```

`EXPO_PUBLIC_*` values are inlined into the APK, so the app holds no secrets. Opening `seainvaders://selftest` on the device runs the core's golden replays on Hermes and reports whether they match the Node results.

### 5. Program

`programs/README.md` covers building and testing with Anchor; `programs/scripts/README.md` covers the devnet configuration (`npm run devnet:catalog`, `npm run devnet:prices`, the smoke test).

## Deployment

The API (backend plus the built core) is deployed by the "Deploy API to VPS" GitHub Actions workflow, started manually from the **Actions** tab; `backend/DEPLOYMENT.md` documents the target layout, the PM2 processes (the API and the hourly weekly crank), migrations and the environment. The "Build APK" workflow builds the Android release for the Seeker.

## Security

Please report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
