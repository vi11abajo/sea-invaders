#!/bin/bash
# Automated server setup script
# Run on the server: bash server-setup.sh

set -e

echo "=== Installing Node.js 20.x ==="
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node --version
npm --version

echo "=== Installing PM2 ==="
npm install -g pm2
echo "PM2 installed. Run the command below to enable start on boot:"
pm2 startup systemd

echo "=== Installing PostgreSQL 16 ==="
sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
apt update
apt install -y postgresql-16 postgresql-contrib-16
systemctl enable postgresql
systemctl start postgresql

echo "=== Configuring the firewall ==="
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw allow 80/tcp
ufw allow 443/tcp
echo "y" | ufw enable
ufw status

echo ""
echo "========================================="
echo "✅ Base server setup complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "1. Run the pm2 startup command shown above"
echo "2. Create the database: sudo -u postgres psql"
echo "3. Add your SSH key to /root/.ssh/authorized_keys"
echo "4. Configure Nginx"
