#!/bin/bash
set -e

# ── PostgreSQL ────────────────────────────────
if ! command -v psql &> /dev/null; then
  echo "[deploy] PostgreSQL not found — installing..."
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-contrib
fi
sudo systemctl enable postgresql
sudo systemctl start postgresql
sleep 2

# Create DB/user idempotently (errors ignored if already exist)
sudo -u postgres psql -c "CREATE USER rps_user WITH PASSWORD 'rps_password' SUPERUSER;" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE rps_db OWNER rps_user;" 2>/dev/null || true
echo "[deploy] PostgreSQL: $(sudo systemctl is-active postgresql)"

# ── .env (never overwrite existing) ──────────
if [ ! -f ~/app/backend/.env ]; then
  echo "[deploy] Creating .env file..."
  printf 'PORT=5000\nDB_HOST=localhost\nDB_PORT=5432\nDB_USER=rps_user\nDB_PASSWORD=rps_password\nDB_NAME=rps_db\n' > ~/app/backend/.env
fi

# ── Backend ───────────────────────────────────
cd ~/app/backend
npm install --production
pm2 restart rps-backend || pm2 start server.js --name rps-backend
pm2 save

# ── Permissions ───────────────────────────────
sudo chmod +x /home/ubuntu
sudo chmod -R 755 /home/ubuntu/app

# ── Health check ──────────────────────────────
echo "[deploy] Waiting for server startup..."
sleep 5
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5000/api/health)
if [ "$HTTP_STATUS" = "200" ]; then
  echo "[deploy] Health check PASSED — server is live and DB connected"
else
  echo "[deploy] Health check FAILED — HTTP $HTTP_STATUS"
  pm2 logs rps-backend --lines 20 --nostream
  exit 1
fi
