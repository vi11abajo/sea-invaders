# Sea Invaders

An arcade shooter set under the sea, built for the Solana Seeker: you play as Octopi and defend the reef from waves of crabs and their bosses. One shared daily run for everyone, ranked on-chain, with a weekly SKR prize pool.

## The game

- **Daily Run.** Every UTC day has one seed for all players. Runs are simulated by a deterministic core, recorded as compact replays and re-verified on the server before they count.
- **Tickets.** A ticket costs 10 SKR and gives 3 ranked attempts for the current day; you can buy as many as you like. 95% of every ticket goes to the week's prize pool, 5% to the treasury.
- **On-chain records.** Your best score of the day is written to your on-chain player account with a server co-signature, so nobody can record a score the server did not verify.
- **Weekly pool.** Weeks run Monday to Monday (UTC). Your weekly score is the sum of your daily bests; the top 10 are paid from the pool directly to their token accounts, and empty places roll into the next week.
- **Practice.** The same game on a random seed, no wallet needed, never ranked.
- **Wallet sign-in.** Mobile Wallet Adapter plus Sign-In With Solana; the app never holds a key.

In development: a 30-level campaign across 5 reefs with 5 bosses, drop-in power-ups (boosts) in every mode, a shop with ships and skins, paid revives priced by the "Tide", and Seeker Genesis Token linking.

The current build runs on devnet against a test SKR mint. Mainnet and the real SKR token come later.

## Tech stack

| Part | Stack |
|---|---|
| Mobile app (`mobile/`) | Expo SDK 57, React Native 0.86, React Native Skia, Hermes, Mobile Wallet Adapter |
| Game core (`core/`) | TypeScript, integer-only deterministic simulation, replays and golden tests (Vitest) |
| Backend (`backend/`) | Node.js, Express, PostgreSQL, JWT, Sign-In With Solana, `@solana/web3.js` |
| On-chain (`programs/`) | Anchor 1.2 program: tickets, daily records, weekly pool settlement |
| Legacy web client | Next.js 16, React 19, framework-free Canvas 2D engine (kept in the repo, not the focus) |

## How a ranked run works

1. The app signs in with the wallet and asks the backend for today's state (attempts, best, pool).
2. When attempts remain, the backend starts a run and returns the daily seed.
3. The core plays the run on the phone and records the finger inputs as a replay.
4. The backend re-simulates the replay with the same core version and checks the score and the state hash.
5. The app asks the backend for a record transaction, the server partially signs it, the wallet signs and sends it.
6. The program updates the player's day bests and the week's top-10; a weekly job settles the pool on Monday.

## Project structure

```
mobile/         Expo/React Native app: the primary client (wallet sign-in, daily run, tickets, week board)
core/           @sea-invaders/core: deterministic game engine shared by the app and the backend
backend/        Express API: auth, daily runs and replay verification, on-chain reads and transaction building
programs/       Anchor program (tickets, daily records, weekly pool) and its devnet scripts
app/            Legacy web client: Next.js routes and API routes
components/     Legacy web client: React components
game/           Legacy web client: game engine
boss-system/    Legacy web client: boss logic, attacks, abilities and rendering
boosts/         Legacy web client: power-up system
themes/         Legacy web client: theme config, images and sounds
public/         Legacy web client: static assets and scripts
lib/            Legacy web client: shared server helpers
scripts/        One-off maintenance scripts (database init)
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

`setup-database.sql` creates the database and its user. Set a real password in it first:

```bash
sudo -u postgres psql -f setup-database.sql
```

### 3. Backend

```bash
cd backend
npm install
cp .env.example .env    # then fill in the values
npm run migrate
npm run dev
```

The chain settings (`SOLANA_CLUSTER`, `SOLANA_RPC_URL`, `PROGRAM_ID`, `SKR_MINT`, `SERVER_AUTHORITY_SECRET`) point at the devnet deployment; `programs/scripts/README.md` describes how the devnet config, test mint and week pools were created.

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

### 5. Legacy web client (optional)

```bash
npm install
cp .env.example .env.local
npm run dev -- -p 3001
```

The web client expects the backend on `http://localhost:3000`.

## Deployment

The API (backend plus the built core) is deployed by the "Deploy API to VPS" GitHub Actions workflow, started manually from the **Actions** tab; `backend/DEPLOYMENT.md` documents the target layout, the PM2 processes (`sea-invaders-api` and the `weekly-crank` job) and the required secrets. The legacy web client has its own, separate deployment described in `VPS-DEPLOYMENT.md` and `QUICKSTART-VPS.md`.

## Security

Please report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
