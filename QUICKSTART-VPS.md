# Quick Start: VPS Deployment

Deploy the app to your own VPS with a one-click GitHub Actions deploy.

## What you get
- Production-ready Next.js app on your VPS
- One-click deployment from the repository's **Actions** tab (manual `workflow_dispatch` trigger)
- PM2 process manager with auto-restart
- PostgreSQL database
- Nginx reverse proxy
- SSL via Cloudflare

## Requirements
- A VPS running Ubuntu 20.04+ with SSH access
- A domain managed through Cloudflare
- About 30 minutes

Throughout this guide, replace the placeholders with your own values:

| Placeholder | Meaning |
|---|---|
| `<SERVER_IP>` | Public IP address of your VPS |
| `<SSH_USER>` | SSH user for deployment (a non-root user with sudo is recommended) |
| `<DOMAIN>` | Your domain, e.g. `example.com` |
| `<DEPLOY_KEY>` | Path to the private SSH key used by CI, e.g. `~/.ssh/deploy_key` |

---

## Step 1: Generate secrets (local) — 2 minutes

```bash
# JWT signing secret
openssl rand -base64 64

# PostgreSQL password
openssl rand -base64 32
```

Store both values in a password manager. Do **not** write them to a file inside the repository.

---

## Step 2: Server setup — 10 minutes

```bash
ssh <SSH_USER>@<SERVER_IP>

cd ~
wget https://raw.githubusercontent.com/vi11abajo/sea-invaders/main/server-setup.sh
chmod +x server-setup.sh
./server-setup.sh
```

When the script finishes, run the `pm2 startup` command it prints, then continue.

---

## Step 3: Database — 3 minutes

```bash
cd /tmp
wget https://raw.githubusercontent.com/vi11abajo/sea-invaders/main/setup-database.sql
nano setup-database.sql
# Replace YOUR_STRONG_PASSWORD with the password from Step 1

sudo -u postgres psql -f setup-database.sql
```

Keep PostgreSQL bound to `localhost` — the app connects over the loopback interface only.

---

## Step 4: Nginx — 2 minutes

```bash
wget https://raw.githubusercontent.com/vi11abajo/sea-invaders/main/nginx-seainvaders.conf
# Replace the server_name entries with your own domain before installing
cp nginx-seainvaders.conf /etc/nginx/sites-available/<DOMAIN>
ln -s /etc/nginx/sites-available/<DOMAIN> /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

---

## Step 5: SSH key for CI — 1 minute

Generate a dedicated deploy key on your local machine:

```bash
ssh-keygen -t ed25519 -f <DEPLOY_KEY> -C "github-actions-deploy"
```

Install the **public** half on the server:

```bash
mkdir -p ~/.ssh
cat >> ~/.ssh/authorized_keys < <DEPLOY_KEY>.pub
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

Verify from your local machine:

```bash
ssh -i <DEPLOY_KEY> <SSH_USER>@<SERVER_IP> "echo OK"
```

---

## Step 6: GitHub Secrets — 10 minutes

Open `https://github.com/<your-account>/<your-repo>/settings/secrets/actions` and create the secrets below. The deploy workflow reads every value from here — nothing is stored in the repository.

### SSH
- `SSH_PRIVATE_KEY` — full contents of `<DEPLOY_KEY>`, including the `BEGIN`/`END` lines
- `SSH_HOST` — your server IP or hostname
- `SSH_USER` — your deployment user
- `SSH_PORT` — your SSH port

### Frontend
- `NEXT_PUBLIC_URL` — `https://<DOMAIN>`

### Backend
- `JWT_SECRET` — from Step 1
- `DB_HOST` — `localhost`
- `DB_PORT` — `5432`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD` — from Step 1
- `DISCORD_CLIENT_ID`
- `DISCORD_CLIENT_SECRET`
- `DISCORD_REDIRECT_URI` — `https://<DOMAIN>/api/auth/discord/callback`
- `FRONTEND_URL` — `https://<DOMAIN>`
- `NODE_ENV` — `production`
- `BACKEND_PORT` — `5438`

---

## Step 7: Cloudflare DNS — 2 minutes

In the Cloudflare dashboard for `<DOMAIN>`:

1. **DNS Records**
   - `A` `@` → `<SERVER_IP>` (Proxy: ON)
   - `A` `www` → `<SERVER_IP>` (Proxy: ON)

2. **SSL/TLS**
   - Mode: Flexible
   - Always Use HTTPS: ON

Proxy mode hides the origin IP only as long as the IP is not published elsewhere — keep it out of the repository, issue trackers and public docs.

---

## Step 8: First deploy — 3 minutes

```bash
ssh <SSH_USER>@<SERVER_IP> "mkdir -p /var/www"

# Locally
git push origin main
```

Then open the repository's **Actions** tab, select **Deploy to VPS**, and click **Run workflow**.

---

## Verification

**In the browser**
- `https://<DOMAIN>` — the game loads
- `https://<DOMAIN>/health` — returns OK

**On the server**
```bash
ssh <SSH_USER>@<SERVER_IP>
pm2 status
# nextjs-frontend and express-backend should both be "online"
```

---

## Monitoring

```bash
pm2 status                # process status
pm2 logs                  # all logs
pm2 restart all           # restart everything

tail -f /var/log/nginx/error.log
```

## Help

- Detailed walkthrough: [VPS-DEPLOYMENT.md](./VPS-DEPLOYMENT.md)
