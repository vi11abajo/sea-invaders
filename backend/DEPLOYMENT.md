# 🚀 API Deployment (VPS)

How the Sea Invaders API (`backend/` + the `@sea-invaders/core` package it depends on) is deployed
and how to set up the same thing by hand.

The legacy web game that used to live on this backend has its own, separate deployment
(the Next.js client; its deployment docs left the tree on 2026-09-13 and live in the git history) on the same VPS.
It is a different application with its own PM2 process and Nginx site — this document is about
the API only.

---

## Production reality

- **Deploy pipeline:** the GitHub Actions workflow **"Deploy API to VPS"**
  (`.github/workflows/deploy.yml`, manual `workflow_dispatch` trigger only). It builds
  `core/` (`npm ci && npm run build`), writes `backend/.env` from GitHub secrets, copies
  `backend/` and `core/` (with the built `dist/`, without `node_modules`) to the server over
  `scp`/`ssh`, installs production dependencies, runs migrations, and (re)starts the PM2 apps.
- **Server path:** `/var/www/sea-invaders-api` (backend + built core). Not
  `/var/www/sea-invaders` — that path is the legacy web game's checkout.
- **Process manager:** `backend/ecosystem.api.config.cjs` defines two PM2 apps:
  - `sea-invaders-api` — the Express API, `fork` mode, **one instance** (the SIWS nonce
    store, the rate-limit counters, the faucet cooldown and the short read caches are
    in-process, so a second instance would not share them), listening on **port 5439**.
  - `weekly-crank` — runs `src/jobs/weekly.js` on the cron schedule `20 * * * *` (every
    hour at :20) and exits; `autorestart: false` is intentional, so `pm2 status` showing it
    as *stopped* between runs is expected, not a crash. See "Weekly crank" below.
- **Reverse proxy and TLS:** Nginx serves `api.seainvaders.xyz` on ports 80 and 443 with a
  Let's Encrypt certificate (Certbot) and proxies to `127.0.0.1:5439`. Cloudflare only hosts
  the domain's DNS (DNS-only records pointing at the VPS); it does not proxy the traffic or
  terminate TLS. The API trusts exactly one proxy hop on loopback
  (`app.set('trust proxy', 'loopback')` in `src/createApp.js`), so `req.ip` is the client
  address nginx appends to `X-Forwarded-For` and the rate limiters key every client
  separately.
- **Database:** PostgreSQL database `sea_invaders_api`, role `sea_invaders_user`
  (a different database from the legacy web game's).
- **Migrations:** run automatically by the workflow on the server (`npm run migrate`,
  inside `backend/`). `backend/migrations/run.js` applies, in order, only:
  `001_initial_schema.sql`, `002_performance_optimization.sql`,
  `004_farcaster_migration.sql`, `005_solana_ranked_runs.sql`, `006_chain_records.sql`,
  `007_campaign_progress.sql`, `008_loadout.sql`, `009_run_skin.sql`, `010_seeker.sql`,
  `011_run_update_required.sql`, `012_run_skin_range.sql`
  (each tracked in a `migrations` table so re-running is a no-op). Note
  `002_add_admin_and_attempts.sql` also exists in the directory but is **not** run by
  `run.js` — it predates `002_performance_optimization.sql` and was superseded.
  `012_run_skin_range.sql` widens a ranked run's `skin` to the eighteen codes 0..17 of the
  champions and skins catalogue: run it before serving the API that lets a player equip the new
  looks, or `startRun` fails on a skin above 4.
- **Node:** requires Node 20+ (the workflow's `setup-node@v4` pins `'20'`; the VPS itself
  runs Node 24, which is compatible).

---

## 📋 Prerequisites (manual setup)

- ✅ A VPS running Ubuntu 22.04 or 24.04 (production runs 24.04 with PostgreSQL 16)
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

### Install Certbot (for the TLS certificate)

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
sudo nano /etc/postgresql/<version>/main/pg_hba.conf   # 16 on Ubuntu 24.04, 14 on 22.04

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

The CI deploy workflow does this same build (`cd core && npm ci && npm run build`) and includes
`core/dist` in the deploy archive, so a server updated by CI already has it; only a manual
clone needs this step.

**Core version contract.** The API verifies replays only against the exact `CORE_VERSION`
of the core it was built with and reports that version as `coreVersion` in
`GET /api/daily/today`. The app sends its own core version when it starts a ranked run
(`POST /api/daily/runs` with `coreVersion`); an app on any other version gets
`426 update_required` there, before a run is created or an attempt counted
(`backend/src/routes/daily.js`). Each run stores the version it started on, and at finish
(`backend/src/services/rankedRuns.js`):

- if the server's own core changed during the run (a deploy landed mid-run), the run is closed as
  `update_required`; `countRunsForDay` skips that status, so the free or bought attempt is still
  there (migration `011_run_update_required.sql`);
- a replay whose version byte differs from the run's stored version is rejected like any other bad
  upload and spends the attempt (the answer is still `426 update_required`, with no refund).

`CORE_VERSION` is 14 since 2026-09-24. History: 3 brought the campaign, bosses and boosts; 4 the
legacy boost rules and player-shot motion; 5 rarer boost drops; 6 the octopi variants and the
mid-level revive; 7 slowed enemy shots under ICE_FREEZE; 8 the new crab kinds, the weighted shooter,
the two-life heavy shot and the silhouette formations; 9 chained the silhouettes in a fixed order;
10 gave every level its own fixed shuffle, one per wave; 11 opened reefs 6-10 (five veteran kinds
with skills, nine silhouettes of which three living, five bosses with squads and obstacles, sixty
levels); 12 the first balance note on the deep reefs (the Gold Corsair's axe turns below Octopi's
home row, the Storm Tyrant's orb sinks fast enough to cross it); 13 the five new champions (Thick
skin, Surge, Last stand, Hex, Copy); 14 rescales Shoupe's Last stand by lives, sets Hex to 70 % and
Copy to ×1.33, and makes today's speeds the knobs' reference, then gives Noob a Shell (the first hit
of every wave and boss fight) in place of Thick skin and Coraluna Coral growth (+1 life at 120 kills,
once a run) in place of Surge, and stretches the Daily Run's climb after wave five (a veteran every
other wave, the fire ramp halved after wave six).

Whenever the core version bumps, run the migrations, deploy the API and release the new APK
together: until a player updates, the app is told to update before it can start a ranked run.

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

`src/jobs/weekly.js` (run via `npm run crank`) creates the current and next week's on-chain pools and settles every finished week (up to four weeks back) once its grace period has passed. Settling a week rolls what is left into the next week's vault, so before each settle the crank creates that next week's pool if it is missing (it is, after an outage of over a week); see `src/services/weekly.js` for the exact rules. It also runs once, fire-and-forget, at backend startup (`src/app.js`, right after the DB check) so pools exist on a fresh deploy without waiting for Monday.

The crank runs as the `weekly-crank` app in `backend/ecosystem.api.config.cjs`, alongside `sea-invaders-api`:

```bash
pm2 start backend/ecosystem.api.config.cjs --only weekly-crank
```

- `cron_restart: '20 * * * *'` fires every hour at :20. PM2 evaluates the schedule in the server's local time zone (the VPS keeps Europe/Berlin), so a single Monday-00:20 slot fired at 22:20 UTC on Sunday - before the week's 00:15 UTC close (00:00 + 900s grace) - and the week only settled at the next deploy. Hourly, the first run after the close settles it whatever the zone; every other run finds nothing to do and exits after a few RPC reads.
- `autorestart: false` is intentional: the job runs once and exits, so `pm2 status` correctly shows `weekly-crank` as **stopped** between runs - that is expected, not a crash.
- A deploy starts the crank process and the API (whose startup also runs the crank) in the same second, so the two race to create the next pool; the loser's `create_week_pool` fails with the System Program's "already in use" (`custom program error: 0x0`) and `runWeekly` treats a pool that exists on re-read as done. That log line is expected on deploy days.
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

Production terminates TLS on the server itself with a Let's Encrypt certificate; Cloudflare
serves only the DNS. Get the certificate with Certbot:

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
per wallet, requires an authenticated request). A wallet holding less than 0.01 SOL also gets
0.02 SOL for fees in the same transaction, paid by the server authority, unless that would take
it under its reserve; the SKR is minted either way (`backend/src/services/faucet.js`). The route is mounted only when
`SOLANA_CLUSTER=devnet` (`backend/src/createApp.js`); on `mainnet` it does not exist
(returns 404), by design: the faucet must never exist on mainnet. It also stays shut while the
server authority is below its SOL reserve (`FAUCET_MIN_SOL`, see "Server authority funding").

---

## Configuration

Every environment variable that `backend/src` and `backend/migrations` read from
`process.env` (migrations read none directly: `migrations/run.js` loads `.env` through
`src/loadEnv.js`, and `src/config/database.js` reads the `DB_*` values). See `backend/.env.example` for a filled-in template (never
commit or print the real `backend/.env`).

| Variable | Required? | Default | Meaning |
|---|---|---|---|
| `NODE_ENV` | No | `development` | `production` enables combined request logging, hides stack traces, answers every 5xx with a fixed message, and refuses to start without `JWT_SECRET` or `DAILY_SEED_SECRET`. |
| `PORT` | No | `3000` (production sets `5439` via the workflow) | Port the Express app listens on. |
| `FRONTEND_URL` | No | `http://localhost:5173` | Allowed CORS origin. |
| `DB_HOST` | No | `localhost` | PostgreSQL host. |
| `DB_PORT` | No | `5432` | PostgreSQL port. |
| `DB_NAME` | No | `sea_invaders` (production sets `sea_invaders_api`) | PostgreSQL database name. |
| `DB_USER` | No | `sea_invaders_user` | PostgreSQL role. |
| `DB_PASSWORD` | Yes | — | PostgreSQL password. |
| `JWT_SECRET` | Yes | — | Signs and verifies session JWTs (at least 32 characters). |
| `RATE_LIMIT_WINDOW_MS` | No | `900000` (15 min) | `/api/*` rate-limit window. |
| `RATE_LIMIT_MAX_REQUESTS` | No | `3000` | Max `/api/*` requests per window per client (a signed-in user, otherwise the client's address). |
| `DAILY_SEED_SECRET` | Yes | — | HMAC secret behind the daily ranked-run seed; changing it changes every future day's seed, so set it once and keep it stable. |
| `DAILY_FREE_ATTEMPTS` | No | `0` | Free ranked attempts per UTC day, on top of any on-chain ticket. **In production this is `0`: free attempts cannot be recorded on chain**, so any non-zero value here would let a run be played without a ticket but with nowhere to record it. |
| `AUTH_DOMAIN` | No | `seainvaders.xyz` | Sign-In With Solana: the domain shown to the wallet and checked by the server; must match the identity the app presents (`mobile/src/api/config.ts`). |
| `AUTH_URI` | No | `https://seainvaders.xyz` | Sign-In With Solana: the URI shown to the wallet and checked by the server. |
| `JUPITER_API_KEY` | No | — | Sent as the `x-api-key` header on `POST /api/swap/quote`'s calls to Jupiter's swap API (`quoteSwap` in `services/swap.js`); never returned to clients. Server-side only, never `EXPO_PUBLIC_*`. Swap itself is gated (see below), so this is only read on `mainnet`. |
| `HELIUS_API_KEY` | No | — | The mainnet read behind the Seeker Genesis Token check (`backend/src/chain/helius.js`); sent only inside the Helius endpoint URL, never returned to a client and never part of an error message. Server-side only, never `EXPO_PUBLIC_*`. Without it `POST /api/seeker/link` answers `503 seeker_unavailable` (see below). |
| `HELIUS_MAINNET_URL` | No | `https://mainnet.helius-rpc.com/?api-key=<HELIUS_API_KEY>` | Overrides the endpoint that check calls, for a different Helius plan or a proxy. Ignored without `HELIUS_API_KEY`. |
| `SOLANA_CLUSTER` | No | `devnet` | `devnet` or `mainnet`; also gates whether `/api/devnet/*` (the faucet) is mounted at all, and whether `POST /api/swap/quote` is available at all - the SOL→SKR swap only ever makes sense once the deployment has actually moved to `mainnet`, so on any other value the route answers `409 { error: 'Swap', code: 'swap_unavailable' }` without touching Jupiter (`services/swap.js#swapAvailable`). Set explicitly in production so it is never left to the default by accident. |
| `SOLANA_RPC_URL` | Yes | — | RPC endpoint used for all chain reads/writes. |
| `PROGRAM_ID` | Yes | — | The `sea_invaders` Anchor program's deployed address. |
| `SKR_MINT` | Yes | — | The SKR token mint used for tickets and payouts. |
| `SERVER_AUTHORITY_SECRET` | Yes | — | Base58 of the server authority's 64-byte Ed25519 secret key; co-signs `submit_daily_best` and `link_seeker`, pays for the weekly crank and settlement, and on devnet mints the faucet's test SKR. Never print or commit this value. |
| `FAUCET_MIN_SOL` | No | `0.5` | Devnet only: the SOL the server authority keeps for the crank and settlement; below it the faucet answers `503 FaucetUnavailable`. |

### Seeker Genesis Token check

The Seeker badge is earned by proving a Seeker Genesis Token on **mainnet**, which is a
different cluster from the one the game itself runs on (`SOLANA_CLUSTER`), so that one
read goes through Helius rather than `SOLANA_RPC_URL`: `POST /api/seeker/link` looks up
the wallet's Token-2022 accounts, accepts a mint only when its mint authority, metadata
pointer and token group all match the Genesis Token's, and only then co-signs the
on-chain `link_seeker` transaction the player signs. `HELIUS_API_KEY` is what makes that
read possible: without it `POST /api/seeker/link` answers
`503 { error: 'Seeker', code: 'seeker_unavailable' }` and nothing else in the API changes —
`GET /api/seeker` and `POST /api/seeker/confirm` read only the chain, so they keep working
(with no key no link can be issued, so there is nothing for them to report), and the badge
itself is cosmetic: no scores, prices or attempts depend on it. The key is written into `backend/.env` by
`.github/workflows/deploy.yml` from the `HELIUS_API_KEY` GitHub secret; never print or
commit it.

### Server authority funding

The server authority is the fee payer (and, where accounts are created, the rent
payer) for every backend-initiated transaction, not just a co-signer: it pays for
`create_week_pool` (the weekly crank), the winners' token accounts created inside
`settle_week`, the faucet's `getOrCreateAssociatedTokenAccount`, mint and SOL drip on devnet
(`backend/src/chain/txs.js`), and its own transaction fees throughout. If its SOL
balance runs out, the crank, settlement, and faucet all start failing even though
`SERVER_AUTHORITY_SECRET` itself is still valid.

Keep at least **~1 SOL** on the server authority's address at all times. On devnet,
top it up by transferring from the admin keypair; on mainnet, fund it explicitly (it
receives no SOL automatically). Check its balance with:

```bash
solana balance <SERVER_AUTHORITY pubkey> --url <cluster>
```

The devnet faucet route (`POST /api/devnet/faucet`, `backend/src/services/faucet.js`)
checks this balance before every mint and refuses with `503 FaucetUnavailable` below a
reserve of **`FAUCET_MIN_SOL` (default 0.5 SOL)**, so test-token requests can never drain
the SOL the crank and settlement need; it also returns `503 FaucetUnavailable` if the mint
transaction itself does not land (e.g. an RPC error). Either response names the fix: fund
the server authority, or check the RPC.

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
| `HELIUS_API_KEY` | secret, never written down here |
| `SOLANA_CLUSTER` | public devnet value: `devnet` |
| `SOLANA_RPC_URL` | public devnet value: `https://api.devnet.solana.com` |
| `PROGRAM_ID` | public devnet value: `G1vEN2CY1KfjPia3hD7MALBwseSRUfrcBivxfKKGqset` |
| `SKR_MINT` | public devnet value: `Bk454WdhpYQB2crEQeVNQWWqi33xqFWXELHbi44XkHht` |
| `SERVER_AUTHORITY_SECRET` | secret, never written down here |
| `SSH_HOST` | secret, never written down here |
| `SSH_USER` | secret, never written down here |
| `SSH_PORT` | secret, never written down here |
| `SSH_PRIVATE_KEY` | secret, never written down here |

Every secret above exists in the repository settings (**Settings → Secrets and variables →
Actions**). A missing chain secret would make the workflow write an incomplete
`backend/.env`, and the API would refuse to start (`chainConfig()` throws on any missing
value).

### Release signing (the "Build APK" workflow)

`.github/workflows/apk.yml` signs the release APK with the project's own key when these
four secrets exist; without them the build keeps the Android debug key, so a fork still
produces an installable APK:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | the PKCS12 keystore (`.jks`) as base64 text — secret |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password — secret |
| `ANDROID_KEY_ALIAS` | the key alias inside the keystore (`sea-invaders`) |
| `ANDROID_KEY_PASSWORD` | the key password (PKCS12: the same as the keystore's) — secret |

The workflow also reads `SSH_HOST`, `SSH_USER`, `SSH_PORT` and `SSH_PRIVATE_KEY` (the same
four as the API deploy) to copy the APK to `/root/apk/` on the VPS as
`sea-invaders-<sha>.apk` and `latest.apk`; the landing page's `/sea-invaders.apk` is
replaced by hand (see `site/README.md`).

The workflow decodes the keystore onto the runner, hands its path and the passwords to
`expo prebuild` through `SEA_RELEASE_*` environment variables, and the config plugin
`mobile/plugins/withReleaseSigning.js` writes a `release` signing config into the generated
`app/build.gradle` that reads those variables at build time (no secret lands in the project
tree). The last build step prints the signing certificate's SHA-256 with `apksigner`; that
fingerprint is public and must match `https://seainvaders.xyz/.well-known/assetlinks.json`
(nginx serves it from `/var/www/seainvaders-xyz/.well-known/`), which is how wallets verify
the app's identity through Mobile Wallet Adapter. Android installs an update only over an
app signed with the same key, so switching from the debug key to the release key means one
uninstall on the device. `mobile/app.json`'s `android.versionCode` must grow with every
build that goes to people (it is 3 for version 1.0.0).

---

## 🔒 Security

### Recommendations

1. **Use strong passwords** for PostgreSQL
2. **Never commit `.env`** to Git (it is in `.gitignore`)
3. **Restrict SSH access** (before disabling root login, make sure the workflows'
   `SSH_USER` secret names a non-root user that can run `pm2` and write
   `/var/www/sea-invaders-api`):
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
sudo tail -f /var/log/postgresql/postgresql-<version>-main.log   # 16 on Ubuntu 24.04
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
3. Reach out on X: [@vi11abajo](https://x.com/vi11abajo)
