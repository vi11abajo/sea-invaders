# 🚀 Backend Deployment to a VPS (Ubuntu 22.04)

A step-by-step guide to running the Sea Invaders backend on your own VPS.
For the full stack (web client + backend + CI deploy), see [VPS-DEPLOYMENT.md](../VPS-DEPLOYMENT.md).

---

## 📋 Prerequisites

- ✅ A VPS running Ubuntu 22.04
- ✅ SSH access to the server
- ✅ A domain with a DNS A record pointing at the server IP
- ✅ PostgreSQL installed
- ✅ Node.js 20.x installed

---

## 1️⃣ Connect to the VPS

```bash
ssh root@your-vps-ip
# or
ssh your-username@your-vps-ip
```

---

## 2️⃣ Install the required software

### Update the system

```bash
sudo apt update && sudo apt upgrade -y
```

### Install Node.js 20.x

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Check
node --version  # v20.x.x
npm --version   # v10.x.x
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

### Install Certbot (for SSL)

```bash
sudo apt install certbot python3-certbot-nginx -y
```

---

## 3️⃣ Configure PostgreSQL

### Create the database and user

```bash
# Open psql
sudo -u postgres psql

# Inside psql:
CREATE DATABASE sea_invaders;
CREATE USER sea_invaders_user WITH ENCRYPTED PASSWORD 'your_strong_password';
GRANT ALL PRIVILEGES ON DATABASE sea_invaders TO sea_invaders_user;

# Exit
\q
```

### Configure pg_hba.conf (only if you need password auth over TCP)

```bash
sudo nano /etc/postgresql/14/main/pg_hba.conf

# Append (local access only):
host    all             all             127.0.0.1/32            md5

# Save and restart:
sudo systemctl restart postgresql
```

---

## 4️⃣ Clone the project

```bash
# Create the projects directory
mkdir -p /var/www
cd /var/www

# Clone the repository
git clone https://github.com/vi11abajo/sea-invaders.git
cd sea-invaders/backend

# Install production dependencies
npm ci --omit=dev
```

---

## 5️⃣ Configure environment variables

```bash
# Create the .env file
nano .env
```

Paste and fill in:

```env
# JWT (generate with: openssl rand -hex 64)
JWT_SECRET=your_64_char_random_key

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=sea_invaders
DB_USER=sea_invaders_user
DB_PASSWORD=your_postgresql_password

# Server
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://yourdomain.com

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Anti-cheat
ENABLE_SCORE_VALIDATION=true
MAX_SCORE_PER_LEVEL=10000
MAX_LEVEL=100
MIN_GAME_DURATION=5000

# Daily ranked run (generate the secret with: openssl rand -hex 32)
DAILY_SEED_SECRET=your_64_char_random_string
DAILY_FREE_ATTEMPTS=3

# Sign-In With Solana: what the wallet shows and the server checks
AUTH_DOMAIN=seainvaders.xyz
AUTH_URI=https://seainvaders.xyz
```

`DAILY_SEED_SECRET` derives every day's seed; changing it changes all future seeds, so set it once. `DAILY_FREE_ATTEMPTS` is the per-day attempt limit until on-chain tickets replace it. `AUTH_DOMAIN` / `AUTH_URI` must match the identity the app presents to the wallet (`mobile/src/api/config.ts`), and the domain hosts `/.well-known/assetlinks.json` for wallet app verification.

Save (`Ctrl+O`, `Enter`, `Ctrl+X`).

---

## 6️⃣ Run the database migrations

```bash
npm run migrate
```

You should see: `✅ All migrations completed successfully!`

---

## 7️⃣ Start the server with PM2

```bash
# Start
pm2 start ecosystem.config.cjs

# Status
pm2 status

# Logs
pm2 logs sea-invaders-backend

# Persist the process list for start on boot
pm2 save
```

**Useful PM2 commands:**

```bash
pm2 restart sea-invaders-backend   # Restart
pm2 stop sea-invaders-backend      # Stop
pm2 delete sea-invaders-backend    # Remove
pm2 monit                          # Live monitoring
pm2 flush                          # Clear logs
```

---

## 8️⃣ Configure Nginx (reverse proxy)

### Create the site config

```bash
sudo nano /etc/nginx/sites-available/sea-invaders-backend
```

Paste:

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Longer timeouts for slow requests
    proxy_connect_timeout 60s;
    proxy_send_timeout 60s;
    proxy_read_timeout 60s;
}
```

Save and exit.

### Enable the config

```bash
# Symlink into sites-enabled
sudo ln -s /etc/nginx/sites-available/sea-invaders-backend /etc/nginx/sites-enabled/

# Validate the config
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx
```

---

## 9️⃣ Set up SSL (Let's Encrypt)

```bash
# Obtain a certificate
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Follow the prompts:
# 1. Enter an email
# 2. Accept the Terms of Service
# 3. Choose "Redirect" (send HTTP to HTTPS)
```

Certbot updates the Nginx config for HTTPS automatically.

### Check automatic renewal

```bash
# Dry-run the renewal
sudo certbot renew --dry-run
```

Let's Encrypt certificates are valid for 90 days and renew automatically.

---

## 🔟 Health check

```bash
# On the server
curl http://localhost:3000/health

# Through the domain
curl https://yourdomain.com/health
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

## 1️⃣1️⃣ Updating the code

```bash
# Go to the project directory
cd /var/www/sea-invaders/backend

# Pull updates
git pull

# Install new dependencies (if any)
npm ci --omit=dev

# Restart PM2
pm2 restart sea-invaders-backend

# Check the logs
pm2 logs sea-invaders-backend --lines 50
```

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
pm2 logs sea-invaders-backend         # All logs
pm2 logs sea-invaders-backend --err   # Errors only
pm2 logs sea-invaders-backend --out   # Output only
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
pm2 logs sea-invaders-backend

# Check which variables are set (prints names only, not secret values)
cut -d= -f1 .env

# Check the database connection
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

# Is something listening on port 3000?
sudo lsof -i :3000
```

---

## ✅ Done

The backend is now available at:

- **API:** `https://yourdomain.com/api/*`
- **Health check:** `https://yourdomain.com/health`

---

## 📞 Support

If something goes wrong:

1. Check the logs: `pm2 logs sea-invaders-backend`
2. Open an issue on GitHub
3. Reach out to [@IIIDARt](https://twitter.com/IIIDARt)
