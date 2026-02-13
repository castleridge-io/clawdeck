# ClawDeck Deployment Guide

Deployment to VPS, Docker, or cloud platforms.

## Prerequisites

- Node.js 20+
- PostgreSQL 14+
- Domain (optional, for SSL)

## Quick Start: Docker

```bash
git clone https://github.com/clawdeckio/clawdeck.git
cd clawdeck/nodejs
docker compose up -d
```

## VPS Deployment (Ubuntu 24.04)

### 1. Initial Setup

```bash
# SSH to your VPS
ssh root@your-vps-ip

# Update system
apt update && apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install PostgreSQL
apt install -y postgresql

# Create database and user
sudo -u postgres psql << EOF
CREATE USER clawdeck WITH PASSWORD 'your_secure_password';
CREATE DATABASE clawdeck_production OWNER clawdeck;
GRANT ALL PRIVILEGES ON DATABASE clawdeck_production TO clawdeck;
EOF

# Install Nginx (optional, for reverse proxy)
apt install -y nginx
```

### 2. Deploy Application

```bash
# Clone repository
cd /var/www
git clone https://github.com/clawdeckio/clawdeck.git
cd clawdeck/nodejs

# Install dependencies
yarn install

# Generate Prisma client
yarn prisma generate

# Run migrations
DATABASE_URL="postgresql://clawdeck:your_secure_password@localhost:5432/clawdeck_production" \
  yarn prisma migrate deploy

# Create production environment file
cat > .env.production << EOF
DATABASE_URL="postgresql://clawdeck:your_secure_password@localhost:5432/clawdeck_production"
JWT_SECRET="$(openssl rand -base64 32)"
NODE_ENV=production
PORT=3000
EOF

# Install PM2 for process management
yarn global add pm2
```

### 3. Create Systemd Service

```bash
cat > /etc/systemd/system/clawdeck.service << EOF
[Unit]
Description=ClawDeck API
After=network.target postgresql.service

[Service]
Type=simple
User=www-data
WorkingDirectory=/var/www/clawdeck/nodejs
Environment="NODE_ENV=production"
ExecStart=/usr/bin/node /var/www/clawdeck/nodejs/src/server.js
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable clawdeck
systemctl start clawdeck
```

### 4. Configure Nginx (Optional)

```bash
cat > /etc/nginx/sites-available/clawdeck << EOF
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

ln -s /etc/nginx/sites-available/clawdeck /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

### 5. SSL with Let's Encrypt (Optional)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

## Cloud Deployment

### Render.com

1. Fork and connect your repository to Render
2. Create a new Web Service
3. Configure:
   - Runtime: Node 20
   - Build Command: `cd nodejs && yarn install && yarn prisma generate`
   - Start Command: `cd nodejs && node src/server.js`
   - Environment Variables (see render.yaml)

### Railway

1. Create new project from GitHub repo
2. Add PostgreSQL database
3. Add Node.js service
4. Configure environment variables

### Fly.io

```bash
# Install flyctl
curl -L https://fly.io/install.sh | sh

# Launch
cd nodejs
fly launch

# Set environment variables
fly secrets set DATABASE_URL="your-db-url"
fly secrets set JWT_SECRET="your-secret"

# Deploy
fly deploy
```

## Monitoring

### View Logs

```bash
# Systemd service
journalctl -u clawdeck -f

# PM2 (if using)
pm2 logs clawdeck
```

### Check Status

```bash
# Systemd
systemctl status clawdeck

# PM2
pm2 status
```

## Updates

```bash
cd /var/www/clawdeck
git pull origin main
cd nodejs
yarn install
yarn prisma migrate deploy
systemctl restart clawdeck
```

## Resource Usage

Typical memory usage:

- Node.js: ~100-150MB
- PostgreSQL: ~50-100MB
- **Total: ~200-250MB minimum**
