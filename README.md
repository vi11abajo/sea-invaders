# Sea Invaders

An arcade shooter set under the sea: you play as Octopi and defend the reef from waves of crabs and their bosses.

## Features

- 15 levels, with boss fights on levels 3, 6, 9, 12 and 15
- Power-up (boost) system, themes and sound
- Touch controls: tap and drag Octopi to move, shoot and dodge
- Global and per-tournament leaderboards
- Server-side game sessions with a heartbeat-based anti-cheat

## Tech stack

| Part | Stack |
|---|---|
| Web client | Next.js 16, React 19, TypeScript |
| Game engine | Framework-free JavaScript on HTML5 Canvas 2D |
| Backend | Node.js, Express, PostgreSQL, JWT, Sign-In With Solana |

## On-chain

Ranked-run tickets, daily best records, and the weekly prize pool are backed by an
Anchor program (`programs/`), not just the database: buying a ticket, submitting a
verified daily best (co-signed by the server), and paying out a settled week's pool
are all on-chain instructions. Devnet, used throughout this phase, runs against a
test SKR token mint rather than the real one. See `programs/README.md` for building
and testing the program, and `programs/scripts/README.md` for the one-time devnet
setup scripts (config init, week-pool creation, smoke test).

## Project structure

```
app/            Next.js routes (game, leaderboard, wiki) and API routes
components/     React components (game canvas, HUD, navigation)
game/           Game engine: core loop, physics, rendering, game modes
boss-system/    Boss logic, attacks, abilities and rendering
boosts/         Power-up system
themes/         Theme config, images and sounds
public/         Static assets and scripts loaded by the web client
backend/        Express API: auth, game sessions, scores, leaderboards
lib/            Shared server helpers (auth, database)
```

## Getting started

Requirements: Node.js 20 and PostgreSQL.

### 1. Database

`setup-database.sql` creates the database and its user. Set a real password in it first:

```bash
sudo -u postgres psql -f setup-database.sql
```

### 2. Backend

The web client expects the backend on `http://localhost:3000` during local development.

```bash
cd backend
npm install
cp .env.example .env    # then fill in the values
npm run migrate
npm run dev
```

### 3. Web client

Run it on a different port, since the backend already uses 3000:

```bash
npm install
cp .env.example .env.local    # then fill in the values
npm run dev -- -p 3001
```

Open http://localhost:3001.

## Deployment

See [QUICKSTART-VPS.md](QUICKSTART-VPS.md) for a short guide and [VPS-DEPLOYMENT.md](VPS-DEPLOYMENT.md) for the full one.
The GitHub Actions deploy workflow is started manually from the **Actions** tab.

## Roadmap

- Native Android app for the Solana dApp Store (planned)

## Security

Please report vulnerabilities privately — see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE)
