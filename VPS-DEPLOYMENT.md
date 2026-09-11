# VPS Deployment Guide

Step-by-step deployment of the app to a self-managed VPS with GitHub Actions as the delivery pipeline.

Replace the placeholders with your own values throughout:

| Placeholder | Meaning |
|---|---|
| `<SERVER_IP>` | Public IP address of your VPS |
| `<SSH_USER>` | SSH user used for deployment |
| `<SSH_PORT>` | SSH port |
| `<DOMAIN>` | Your domain, e.g. `example.com` |
| `<DEPLOY_KEY>` | Path to the CI private key, e.g. `~/.ssh/deploy_key` |
| `<DB_NAME>` / `<DB_USER>` | PostgreSQL database and role |

## Ports

- Frontend (Next.js): **5437**
- Backend (Express): **5438**
- Nginx: 80 (HTTP), 443 (HTTPS via Cloudflare)

Both application ports are bound to the loopback interface and reached only through Nginx.

---

## Step 1: Server setup

### 1.1 Connect

```bash
ssh <SSH_USER>@<SERVER_IP>
```

### 1.2 Run the install script

```bash
cd ~
wget https://raw.githubusercontent.com/vi11abajo/sea-invaders/main/server-setup.sh
chmod +x server-setup.sh
./server-setup.sh
```

### 1.3 Enable PM2 startup

Run the `pm2 startup` command printed by the script — the exact form depends on your init system and user.

---

## Step 2: Create the PostgreSQL database

### 2.1 Generate a strong password

```bash
openssl rand -base64 32
```

Store it in a password manager. Never commit it, and never write it to a file inside the repository.

### 2.2 Create the database

```bash
cd /tmp
wget https://raw.githubusercontent.com/vi11abajo/sea-invaders/main/setup-database.sql

nano setup-database.sql
# Replace YOUR_STRONG_PASSWORD with the generated password,
# and adjust the database/role names if you are not using the defaults

sudo -u postgres psql -f setup-database.sql
```

### 2.3 Verify

```bash
psql -U <DB_USER> -d <DB_NAME> -h localhost -c "\dt"
# An empty table list is expected before the first migration run
```

### 2.4 Keep PostgreSQL local

Confirm the server is not reachable from the internet:

```bash
sudo -u postgres psql -tAc "SHOW listen_addresses;"   # expected: localhost
ss -lntp | grep 5432                                  # expected: 127.0.0.1 only
```

---

## Step 3: Configure Nginx

### 3.1 Install the config

```bash
cd /tmp
wget https://raw.githubusercontent.com/vi11abajo/sea-invaders/main/nginx-seainvaders.conf
# Replace the server_name entries with your own domain
cp nginx-seainvaders.conf /etc/nginx/sites-available/<DOMAIN>
```

### 3.2 Activate

```bash
ln -s /etc/nginx/sites-available/<DOMAIN> /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl restart nginx
systemctl status nginx
```

---

## Step 4: SSH key for GitHub Actions

### 4.1 Generate a dedicated deploy key

Use a key that is used for nothing else, so it can be revoked independently:

```bash
ssh-keygen -t ed25519 -f <DEPLOY_KEY> -C "github-actions-deploy"
```

### 4.2 Install the public half on the server

```bash
mkdir -p ~/.ssh
cat >> ~/.ssh/authorized_keys < <DEPLOY_KEY>.pub
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys
```

### 4.3 Verify access

```bash
ssh -i <DEPLOY_KEY> <SSH_USER>@<SERVER_IP> "echo 'SSH works'"
```

---

## Step 5: GitHub Secrets

Go to `https://github.com/<your-account>/<your-repo>/settings/secrets/actions`.

The deploy workflow writes `.env.local` and `backend/.env` on every run from these values — the repository itself contains no credentials.

### 5.1 SSH

| Secret | Value |
|---|---|
| `SSH_PRIVATE_KEY` | Full contents of `<DEPLOY_KEY>`, including the `BEGIN`/`END` lines |
| `SSH_HOST` | Your server IP or hostname |
| `SSH_USER` | Your deployment user |
| `SSH_PORT` | Your SSH port |

### 5.2 Frontend

| Secret | Value |
|---|---|
| `NEXT_PUBLIC_URL` | `https://<DOMAIN>` |

### 5.3 Backend

| Secret | Value |
|---|---|
| `JWT_SECRET` | `openssl rand -base64 64` |
| `DB_HOST` | `localhost` |
| `DB_PORT` | `5432` |
| `DB_NAME` | Your database name |
| `DB_USER` | Your database role |
| `DB_PASSWORD` | Password from Step 2 |
| `FRONTEND_URL` | `https://<DOMAIN>` |
| `NODE_ENV` | `production` |
| `BACKEND_PORT` | `5438` |

---

## Step 6: First deploy

### 6.1 Prepare the target directory

```bash
ssh <SSH_USER>@<SERVER_IP>
mkdir -p /var/www
cd /var/www
```

### 6.2 Push and run the workflow

```bash
git push origin main
```

Then open the **Actions** tab, select **Deploy to VPS**, and click **Run workflow**.

### 6.3 Monitor

Follow the "Deploy to VPS" run in the **Actions** tab of your repository.

### 6.4 Verify

On the server:

```bash
ssh <SSH_USER>@<SERVER_IP>

pm2 status
# nextjs-frontend - online
# express-backend - online

ss -lntp | grep -E '5437|5438'

pm2 logs --lines 50
```

In the browser:

```
https://<DOMAIN>
https://<DOMAIN>/health
```

---

## Step 7: Cloudflare

In the Cloudflare dashboard for `<DOMAIN>`:

### 7.1 DNS records

- Type **A**, Name **@**, Value `<SERVER_IP>`, Proxy **enabled**
- Type **A**, Name **www**, Value `<SERVER_IP>`, Proxy **enabled**

Proxy mode masks the origin IP from casual lookup, but it provides no protection once the IP appears in a public repository, issue, or document. Keep it out of anything you publish.

### 7.2 SSL/TLS

- SSL/TLS encryption mode: **Flexible**
- Always Use HTTPS: **On**
- Automatic HTTPS Rewrites: **On**

---

## Deployment workflow

Each run of the **Deploy to VPS** workflow (Actions tab → Run workflow):

1. Builds the Next.js app
2. Writes `.env` files from GitHub Secrets
3. Deploys to the VPS over SSH
4. Restarts the PM2 processes
5. Runs a health check

---

## Monitoring

### PM2

```bash
pm2 status                    # process status
pm2 logs                      # all logs
pm2 logs nextjs-frontend      # frontend logs
pm2 logs express-backend      # backend logs
pm2 monit                     # interactive monitor
pm2 restart all               # restart everything
```

### Nginx

```bash
tail -f /var/log/nginx/access.log
tail -f /var/log/nginx/error.log
```

---

## Rolling back

```bash
cd /var/www/sea-invaders
pm2 stop all

# Find the most recent backup
ls -lht ../backup-*.tar.gz | head -5

# Restore the one you want
tar -xzf ../backup-<timestamp>.tar.gz

pm2 restart all
```

---

## Security checklist

- [ ] PostgreSQL bound to `localhost`, not reachable from the internet
- [ ] Firewall active with a default-deny inbound policy
- [ ] Deploy key is dedicated to CI and used for nothing else
- [ ] No credentials, server IPs, or hostnames committed to the repository
- [ ] GitHub secret scanning and push protection enabled on the repository
- [ ] Secrets rotated whenever someone with access leaves or a leak is suspected

## Readiness checklist

### Server
- [ ] Node.js 20.x installed (`node --version`)
- [ ] PM2 installed globally (`pm2 --version`)
- [ ] PostgreSQL 16 installed (`psql --version`)
- [ ] Database created
- [ ] Nginx configured and running
- [ ] Deploy key installed

### GitHub
- [ ] All secrets configured
- [ ] `SSH_PRIVATE_KEY` added in full
- [ ] Actions enabled for the repository

### Cloudflare
- [ ] DNS A records configured
- [ ] Proxy enabled
- [ ] SSL/TLS Flexible mode enabled
- [ ] Always Use HTTPS enabled

### First deploy
- [ ] Deploy to VPS workflow started from the Actions tab
- [ ] Workflow finished successfully
- [ ] PM2 shows both processes online
- [ ] `https://<DOMAIN>` loads
- [ ] `https://<DOMAIN>/health` returns OK
