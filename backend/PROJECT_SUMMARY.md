# 📦 Sea Invaders Backend — Project Summary

## 🏗️ Architecture

- **Node.js + Express** HTTP API
- **PostgreSQL** for users, scores, sessions and tournaments
- **Discord OAuth2** for sign-in, **JWT** for sessions
- **NodeCache** (in-process) for leaderboard caching
- **PM2** cluster mode for production

---

## 📂 File structure

```
backend/
├── src/
│   ├── app.js                   # Entry point: middleware, routes, /health
│   ├── loadEnv.js               # Loads .env before anything else
│   ├── config/
│   │   ├── database.js          # PostgreSQL connection pool
│   │   ├── discord.js           # Discord OAuth settings
│   │   ├── jwt.js               # JWT settings (issuer/audience/expiry)
│   │   └── redis.js             # Optional Redis settings (not wired into the app yet)
│   ├── middleware/
│   │   ├── auth.js              # JWT authentication
│   │   ├── admin.js             # Admin check (not used by any route yet)
│   │   ├── rateLimit.js         # Rate limiting
│   │   └── validation.js        # Request validation
│   ├── routes/
│   │   ├── auth.js              # Discord OAuth, current user, logout
│   │   ├── scores.js            # Game sessions and score submission
│   │   └── leaderboard.js       # Leaderboards
│   ├── services/
│   │   ├── discordService.js    # Discord API calls
│   │   ├── userService.js       # User upsert
│   │   └── scoreService.js      # Score validation and persistence
│   └── utils/
│       └── logger.js            # Logging helper
├── migrations/
│   ├── 001_initial_schema.sql
│   ├── 002_performance_optimization.sql
│   ├── 002_add_admin_and_attempts.sql
│   ├── 004_farcaster_migration.sql
│   └── run.js                   # Migration runner
├── scripts/
│   └── optimize_postgresql.sh   # PostgreSQL tuning helper
├── ecosystem.config.cjs         # PM2 config
├── .env.example                 # Environment variable template
├── DEPLOYMENT.md                # VPS deployment guide
└── PROJECT_SUMMARY.md           # This file
```

---

## 🎯 Features

### 🔐 Authentication
- Discord OAuth2 sign-in
- JWT tokens with expiry
- Protected endpoints via middleware

### 🎮 Game sessions
- Server-side game sessions
- Heartbeat checks during a run (anti-cheat)
- Score validation before results are stored

### 🏆 Leaderboards
- Main leaderboard, cached in memory
- Per-tournament leaderboard
- Top players, personal rank, global stats

### 🛡️ Security
- Rate limiting on all `/api` routes
- Helmet security headers
- CORS configuration
- Parameterized SQL queries

---

## 📊 Database (PostgreSQL)

### Tables
1. **users** — players
2. **scores** — regular game results
3. **tournaments** — tournaments
4. **tournament_scores** — tournament results
5. **user_stats** — per-player aggregates (updated by triggers)
6. **game_sessions** — game sessions (anti-cheat)
7. **anticheat_logs** — anti-cheat violations

### Views
- `v_top_players_alltime` — all-time top players
- `v_active_tournaments` — active tournaments

### Migrations
`npm run migrate` runs the files listed in `migrations/run.js`, in order:
`001_initial_schema.sql`, `002_performance_optimization.sql`, `004_farcaster_migration.sql`.
Each file is recorded in a `migrations` table and skipped on later runs.
`002_add_admin_and_attempts.sql` is **not** in that list, so it has to be applied manually if needed.

---

## 🔌 API endpoints

### Auth (`/api/auth`)
```
GET  /discord            - Redirect to Discord OAuth
GET  /discord/callback   - Discord OAuth callback
GET  /me                 - Current user
POST /logout             - Log out
```

### Scores (`/api/scores`)
```
POST /session/start      - Start a game session
POST /session/heartbeat  - Session heartbeat
POST /submit             - Submit a result
GET  /my-scores          - Current user's results
```

### Leaderboard (`/api/leaderboard`)
```
GET /                         - Leaderboard
GET /main                     - Main leaderboard
GET /tournament/:tournamentId - Tournament leaderboard
GET /top-players              - Top players
GET /my-rank                  - Current user's rank
GET /stats                    - Global stats
GET /test                     - Diagnostic endpoint
```

### Health
```
GET /health              - Liveness check
```

---

## ⚙️ Environment variables

**Required:**
- `DISCORD_CLIENT_ID` - Discord application client ID
- `DISCORD_CLIENT_SECRET` - Discord application secret
- `DISCORD_REDIRECT_URI` - OAuth redirect URI
- `JWT_SECRET` - JWT signing secret (64+ characters)
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` - PostgreSQL connection

**Optional:**
- `PORT` (default: 3000)
- `NODE_ENV` (default: development)
- `FRONTEND_URL`
- `LOG_LEVEL`
- `ENABLE_SCORE_VALIDATION`, `MAX_SCORE_PER_LEVEL`, `MAX_LEVEL`, `MIN_GAME_DURATION` - anti-cheat
- `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS` - rate limiting
- `LEADERBOARD_CACHE_TTL`, `TOURNAMENT_LEADERBOARD_CACHE_TTL` - cache lifetimes
- `SESSION_HEARTBEAT_TIMEOUT`
- `REDIS_ENABLED`, `REDIS_HOST`, `REDIS_PORT`

See `.env.example` for a template.

---

## 🚀 Running

### Local development
```bash
npm install
npm run migrate
npm run dev
```

### Production (VPS)
```bash
npm ci --omit=dev
npm run migrate
pm2 start ecosystem.config.cjs
```

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full guide.

---

## 🔧 NPM scripts

```bash
npm start        # Production start
npm run dev      # Development (nodemon)
npm run migrate  # Run SQL migrations
```

---

## 📞 Contacts

- **GitHub:** [@vi11abajo](https://github.com/vi11abajo)
- **Twitter:** [@IIIDARt](https://twitter.com/IIIDARt)

---

## 📄 License

[MIT](../LICENSE)
