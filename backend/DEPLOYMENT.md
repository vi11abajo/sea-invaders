# 🚀 API Deployment (VPS)

How the Sea Invaders API (`backend/` + the `@sea-invaders/core` package it depends on) is deployed
and how to set up the same thing by hand.

The legacy web game that used to live on this backend has its own, separate deployment
(the Next.js client, `VPS-DEPLOYMENT.md` / `QUICKSTART-VPS.md` at the repo root) on the same VPS.
It is a different application with its own PM2 process and Nginx site — this document is about
the API only.

---

## Production reality

- **Deploy pipeline:** the GitHub Actions workflow **"Deploy API to VPS"**
  (`.github/workflows/deploy.yml`, manual `workflow_dispatch` trigger only). It builds
  `core/` (`npm ci && npm run build`), writes `backend/.env` from GitHub secrets, ships
  `backend/` and `core/dist` to the server over `scp`/`ssh`, installs production
  dependencies, runs migrations, and (re)starts the PM2 apps.
- **Server path:** `/var/www/sea-invaders-api` (backend + built core). Not
  `/var/www/sea-invaders` — that path is the legacy web game's checkout.
- **Process manager:** `backend/ecosystem.api.config.cjs` defines two PM2 apps:
  - `sea-invaders-api` — the Express API, `fork` mode, **one instance** (the SIWS nonce
    store and the leaderboard cache are in-process, so a second instance would not share
    them), listening on **port 5439**.
  - `weekly-crank` — runs `src/jobs/weekly.js` on the cron schedule `20 0 * * 1` (Monday
    00:20 UTC) and exits; `autorestart: false` is intentional, so `pm2 status` showing it
    as *stopped* between Mondays is expected, not a crash. See "Weekly crank" below.
- **Reverse proxy:** Nginx serves `api.seainvaders.xyz` and proxies to
  `127.0.0.1:5439`. The site sits behind Cloudflare, which terminates TLS.
- **Database:** PostgreSQL database `sea_invaders_api`, role `sea_invaders_user`
  (a different database from the legacy web game's).
- **Migrations:** run automatically by the workflow on the server (`npm run migrate`,
  inside `backend/`). `backend/migrations/run.js` applies, in order, only:
  `001_initial_schema.sql`, `002_performance_optimization.sql`,
  `004_farcaster_migration.sql`, `005_solana_ranked_runs.sql`, `006_chain_records.sql`
  (each tracked in a `migrations` table so re-running is a no-op). Note
  `002_add_admin_and_attempts.sql` also exists in the directory but is **not** run by
  `run.js` — it predates `002_performance_optimization.sql` and was superseded.
- **Node:** requires Node 20+ (the workflow's `setup-node@v4` pins `'20'`; the VPS itself
  runs Node 24, which is compatible).

---

## 📋 Prerequisites (manual setup)

- ✅ A VPS running Ubuntu 22.04
- ✅ SSH access to the server
- ✅ A domain with a DNS A record pointing at the server IP (`api.seainvaders.xyz`)
- ✅ PostgreSQL installed
- ✅ Node.js 20+ installed

---

## 1️⃣ Connect to the VPS

```bash
ssh your-username@your-vps-ip
```

---

## 2️⃣ Install the required software

### Update the system

```bash
sudo apt update && sudo apt upgrade -y
```

### Install Node.js 20.x (or newer)

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Check
node --version  # v20.x.x or newer
npm --version
```

### Install PostgreSQL

```bash
sudo apt install postgresql postgresql-contrib -y

# Check the service status
sudo systemctl status postgresql
```

### Install PM2

```bash
sudo npm install -g pm2

# Enable start on boot
pm2 startup
# Run the command PM2 prints
```

### Install Nginx

```bash
sudo apt install nginx -y

# Firewall
sudo ufw allow 'Nginx Full'
sudo ufw allow OpenSSH
sudo ufw enable
```

### Install Certbot (for SSL, if not already handled by Cloudflare)

```bash
sudo apt install certbot python3-certbot-nginx -y
```

---

## 3️⃣ Configure PostgreSQL

### Create the database and user

```bash
sudo -u postgres psql

# Inside psql:
CREATE DATABASE sea_invaders_api;
CREATE USER sea_invaders_user WITH ENCRYPTED PASSWORD 'your_strong_password';
GRANT ALL PRIVILEGES ON DATABASE sea_invaders_api TO sea_invaders_user;

\q
```

### Configure pg_hba.conf (only if you need password auth over TCP)

```bash
sudo nano /etc/postgresql/14/main/pg_hba.conf

# Append (local access only):
host    all             all             127.0.0.1/32            md5

sudo systemctl restart postgresql
```

---

## 4️⃣ Clone the project

```bash
mkdir -p /var/www
cd /var/www

git clone https://github.com/vi11abajo/sea-invaders.git sea-invaders-api
cd sea-invaders-api

# The backend depends on the workspace package "@sea-invaders/core" (file:../core), so build it first
cd core
npm ci
npm run build
cd ../backend

# Install production dependencies
npm ci --omit=dev
```

The CI deploy workflow does this same build (`cd core && npm ci && npm run build`) and ships
`core/dist` in the deploy archive, so a server updated by CI already has it; only a manual
clone needs this step.

---

## 5️⃣ Configure environment variables

```bash
nano backend/.env
```

See the **Configuration** table below for every variable the backend reads, and
`backend/.env.example` for a filled-in template with comments.

---

## 6️⃣ Run the database migrations

```bash
cd backend
npm run migrate
```

You should see: `✅ All migrations completed successfully!`

---

## 7️⃣ Start the server with PM2

```bash
mkdir -p backend/logs
pm2 startOrRestart backend/ecosystem.api.config.cjs --only sea-invaders-api,weekly-crank
pm2 save
```

**Useful PM2 commands:**

```bash
pm2 status                          # Both apps
pm2 restart sea-invaders-api        # Restart the API only
pm2 logs sea-invaders-api           # API logs
pm2 logs weekly-crank               # Crank logs
pm2 monit                           # Live monitoring
pm2 flush                           # Clear logs
```

### Weekly crank

`src/jobs/weekly.js` (run via `npm run crank`) creates the current and next week's on-chain pools and settles the finished week once its grace period has passed; see `src/services/weekly.js` for the exact rules. It also runs once, fire-and-forget, at backend startup (`src/app.js`, right after the DB check) so pools exist on a fresh deploy without waiting for Monday.

The crank runs as the `weekly-crank` app in `backend/ecosystem.api.config.cjs`, alongside `sea-invaders-api`:

```bash
pm2 start backend/ecosystem.api.config.cjs --only weekly-crank
```

- `cron_restart: '20 0 * * 1'` fires Monday 00:20 UTC - shortly after the week closes and its 900s (00:15) grace period ends. **The server clock must be set to UTC**, or the crank fires at the wrong local time. Check with:
  ```bash
  timedatectl
  # "Time zone" should read something like "UTC (UTC, +0000)"
  ```
- `autorestart: false` is intentional: the job runs once and exits, so `pm2 status` correctly shows `weekly-crank` as **stopped** between Monday runs - that is expected, not a crash.
- Run it manually at any time with:
  ```bash
  npm run crank
  ```
- The deploy workflow starts/restarts both apps in one command - `pm2 startOrRestart backend/ecosystem.api.config.cjs --only sea-invaders-api,weekly-crank` (see `.github/workflows/deploy.yml`) - so a fresh deploy always (re)arms the cron schedule too.

---

## 8️⃣ Configure Nginx (reverse proxy)

### Create the site config

```bash
sudo nano /etc/nginx/sites-available/api.seainvaders.xyz
```

Paste:

```nginx
server {
    listen 80;
    server_name api.seainvaders.xyz;

    location / {
        proxy_pass http://127.0.0.1:5439;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}
```

### Enable the config

```bash
sudo ln -s /etc/nginx/sites-available/api.seainvaders.xyz /etc/nginx/sites-enabled/

sudo nginx -t

sudo systemctl restart nginx
```

---

## 9️⃣ Set up SSL

The production domain sits behind Cloudflare, which terminates TLS at the edge (a
Cloudflare "Full" or "Full (strict)" SSL mode still needs a certificate on the origin
server). If you are not using Cloudflare, get a certificate directly with Certbot:

```bash
sudo certbot --nginx -d api.seainvaders.xyz

# Follow the prompts:
# 1. Enter an email
# 2. Accept the Terms of Service
# 3. Choose "Redirect" (send HTTP to HTTPS)
```

```bash
# Dry-run the renewal
sudo certbot renew --dry-run
```

---

## 🔟 Health check

```bash
# On the server
curl http://localhost:5439/health

# Through the domain
curl https://api.seainvaders.xyz/health
```

Expected response:

```json
{
  "status": "ok",
  "timestamp": "...",
  "uptime": 123,
  "environment": "production"
}
```

---

## Devnet faucet

`POST /api/devnet/faucet` mints 100 test SKR to the caller's wallet (10-minute cooldown
per wallet, requires an authenticated request). The route is mounted only when
`SOLANA_CLUSTER=devnet` (`backend/src/createApp.js`); on `mainnet` it does not exist
(returns 404), by design — see the global constraint that the faucet must not exist on
mainnet.

---

## Configuration

Every environment variable that `backend/src` and `backend/migrations` read from
`process.env` (migrations read none directly; they load `.env` indirectly through
`config/database.js`). See `backend/.env.example` for a filled-in template (never
commit or print the real `backend/.env`).

| Variable | Required? | Default | Meaning |
|---|---|---|---|
| `NODE_ENV` | No | `development` | `production` enables combined request logging and hides stack traces in error responses. |
| `PORT` | No | `3000` (production sets `5439` via the workflow) | Port the Express app listens on. |
| `FRONTEND_URL` | No | `http://localhost:5173` | Allowed CORS origin. |
| `DB_HOST` | No | `localhost` | PostgreSQL host. |
| `DB_PORT` | No | `5432` | PostgreSQL port. |
| `DB_NAME` | No | `sea_invaders` (production sets `sea_invaders_api`) | PostgreSQL database name. |
| `DB_USER` | No | `sea_invaders_user` | PostgreSQL role. |
| `DB_PASSWORD` | Yes | — | PostgreSQL password. |
| `JWT_SECRET` | Yes | — | Signs and verifies session JWTs. |
| `REDIS_ENABLED` | No | `false` (must be the literal string `'true'` to enable) | Whether the optional Redis-backed features are used. |
| `REDIS_HOST` | No | `localhost` | Redis host, read when `REDIS_ENABLED=true`. |
| `REDIS_PORT` | No | `6379` | Redis port, read when `REDIS_ENABLED=true`. |
| `RATE_LIMIT_WINDOW_MS` | No | `900000` (15 min) | `/api/*` rate-limit window. |
| `RATE_LIMIT_MAX_REQUESTS` | No | `3000` | Max requests per window per the limiter's key. |
| `SESSION_HEARTBEAT_TIMEOUT` | No | `30000` (30 s) | Max gap between session heartbeats before a run is flagged stale. |
| `LEADERBOARD_CACHE_TTL` | No | `30` (seconds) | Cache TTL for the global leaderboard endpoint. |
| `TOURNAMENT_LEADERBOARD_CACHE_TTL` | No | `10` (seconds) | Cache TTL for the tournament leaderboard endpoint. |
| `ENABLE_SCORE_VALIDATION` | No | disabled unless the literal string `'true'` | In `POST /api/scores/submit`, gates the session-heartbeat-timeout rejection and the second-pass anti-cheat check (`validateScore`); the request-shape limits below are enforced unconditionally by `validateScoreSubmission` regardless of this flag. |
| `MAX_SCORE_PER_LEVEL` | No | `10000` | Score ceiling per level, enforced on every score submission. |
| `MAX_LEVEL` | No | `100` | Level ceiling, enforced on every score submission. |
| `MIN_GAME_DURATION` | No | `5000` (ms) | Minimum session duration, enforced on every score submission. |
| `LOG_LEVEL` | No | `INFO` | One of `DEBUG` / `INFO` / `WARN` / `ERROR`, gates `backend/src/utils/logger.js`. |
| `DAILY_SEED_SECRET` | Yes | — | HMAC secret behind the daily ranked-run seed; changing it changes every future day's seed, so set it once and keep it stable. |
| `DAILY_FREE_ATTEMPTS` | No | `0` | Free ranked attempts per UTC day, on top of any on-chain ticket. **In production this is `0`: free attempts cannot be recorded on chain**, so any non-zero value here would let a run be played without a ticket but with nowhere to record it. |
| `AUTH_DOMAIN` | No | `seainvaders.xyz` | Sign-In With Solana: the domain shown to the wallet and checked by the server; must match the identity the app presents (`mobile/src/api/config.ts`). |
| `AUTH_URI` | No | `https://seainvaders.xyz` | Sign-In With Solana: the URI shown to the wallet and checked by the server. |
| `JUPITER_API_KEY` | No (not yet read by any route) | — | Sent as the `x-api-key` header to Jupiter's swap API; reserved for a not-yet-implemented in-app swap feature. Server-side only, never `EXPO_PUBLIC_*`. |
| `SOLANA_CLUSTER` | No | `devnet` | `devnet` or `mainnet`; also gates whether `/api/devnet/*` (the faucet) is mounted at all. Set explicitly in production so it is never left to the default by accident. |
| `SOLANA_RPC_URL` | Yes | — | RPC endpoint used for all chain reads/writes. |
| `PROGRAM_ID` | Yes | — | The `sea_invaders` Anchor program's deployed address. |
| `SKR_MINT` | Yes | — | The SKR token mint used for tickets and payouts. |
| `SERVER_AUTHORITY_SECRET` | Yes | — | Base58 of the server authority's 64-byte Ed25519 secret key; co-signs `submit_daily_best`. Never print or commit this value. |

---

## GitHub Secrets

Exactly the secrets `.github/workflows/deploy.yml` reads, used to build `backend/.env` on
the server and to reach it over SSH:

| Secret | Value |
|---|---|
| `API_DB_PASSWORD` | secret, never written down here |
| `JWT_SECRET` | secret, never written down here |
| `DAILY_SEED_SECRET` | secret, never written down here |
| `DAILY_FREE_ATTEMPTS` | secret, never written down here (production value is `0`) |
| `AUTH_DOMAIN` | secret, never written down here (production value is `seainvaders.xyz`) |
| `AUTH_URI` | secret, never written down here (production value is `https://seainvaders.xyz`) |
| `JUPITER_API_KEY` | secret, never written down here |
| `SOLANA_CLUSTER` | public devnet value: `devnet` |
| `SOLANA_RPC_URL` | public devnet value: `https://api.devnet.solana.com` |
| `PROGRAM_ID` | public devnet value: `G1vEN2CY1KfjPia3hD7MALBwseSRUfrcBivxfKKGqset` |
| `SKR_MINT` | public devnet value: `Bk454WdhpYQB2crEQeVNQWWqi33xqFWXELHbi44XkHht` |
| `SERVER_AUTHORITY_SECRET` | secret, never written down here |
| `SSH_HOST` | secret, never written down here |
| `SSH_USER` | secret, never written down here |
| `SSH_PORT` | secret, never written down here |
| `SSH_PRIVATE_KEY` | secret, never written down here |

The five chain secrets (`SOLANA_CLUSTER`, `SOLANA_RPC_URL`, `PROGRAM_ID`, `SKR_MINT`,
`SERVER_AUTHORITY_SECRET`) are not yet created in the GitHub repository settings — add
them under **Settings → Secrets and variables → Actions** before the next deploy run,
or the workflow will write an incomplete `backend/.env` and the API will fail to start
(`chainConfig()` throws on any missing value).

---

## 🔒 Security

### Recommendations

1. **Use strong passwords** for PostgreSQL
2. **Never commit `.env`** to Git (it is in `.gitignore`)
3. **Restrict SSH access**:
   ```bash
   sudo nano /etc/ssh/sshd_config
   # Set: PermitRootLogin no
   sudo systemctl restart sshd
   ```
4. **Install fail2ban** against brute-force attempts:
   ```bash
   sudo apt install fail2ban -y
   sudo systemctl enable fail2ban
   ```

---

## 📊 Monitoring

### PM2 logs

```bash
pm2 logs sea-invaders-api         # All logs
pm2 logs sea-invaders-api --err   # Errors only
pm2 logs sea-invaders-api --out   # Output only
```

### Nginx logs

```bash
sudo tail -f /var/log/nginx/error.log
sudo tail -f /var/log/nginx/access.log
```

### PostgreSQL logs

```bash
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

---

## 🛠️ Troubleshooting

### The server does not start

```bash
# PM2 logs
pm2 logs sea-invaders-api

# Check which variables are set (prints names only, not secret values)
cd /var/www/sea-invaders-api/backend && cut -d= -f1 .env

# Check the database connection / re-run migrations
npm run migrate
```

### Database connection errors

```bash
# Is PostgreSQL running?
sudo systemctl status postgresql

# Does the database exist?
sudo -u postgres psql -c "\l"
```

### Nginx errors

```bash
# Validate the config
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Is something listening on port 5439?
sudo lsof -i :5439
```

### Chain configuration errors

`chainConfig()` (`backend/src/chain/config.js`) throws immediately on startup if
`SOLANA_RPC_URL`, `PROGRAM_ID`, `SKR_MINT`, or `SERVER_AUTHORITY_SECRET` is missing or
malformed, or if `SOLANA_CLUSTER` is anything other than `devnet`/`mainnet`. Check
`pm2 logs sea-invaders-api --err` for the specific message.

---

## ✅ Done

The API is available at:

- **API:** `https://api.seainvaders.xyz/api/*`
- **Health check:** `https://api.seainvaders.xyz/health`

---

## 📞 Support

If something goes wrong:

1. Check the logs: `pm2 logs sea-invaders-api`
2. Open an issue on GitHub
3. Reach out to [@IIIDARt](https://twitter.com/IIIDARt)
