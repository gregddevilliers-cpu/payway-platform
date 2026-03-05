# PayWay Platform — Deployment Guide

## Prerequisites

- Linux server (Ubuntu 22.04+ recommended) with at least 2GB RAM
- Docker & Docker Compose installed
- A domain name pointed to your server IP (e.g. `payway.yourdomain.co.za`)
- CloudFlare account (free tier is fine)

---

## Step 1: Install Docker (if not already installed)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in, then verify:
docker --version
```

## Step 2: Clone the repo on your server

```bash
git clone <your-repo-url> /opt/payway
cd /opt/payway
```

## Step 3: Create your `.env` file

```bash
cp .env.example .env
nano .env
```

Fill in the values:

| Variable | What to put |
|---|---|
| `POSTGRES_PASSWORD` | A strong random password |
| `DATABASE_URL` | `postgresql://payway:YOUR_PASSWORD@postgres:5432/payway?schema=public` |
| `JWT_SECRET` | A long random string (run `openssl rand -hex 32`) |
| `NEXT_PUBLIC_API_URL` | `https://yourdomain.co.za/api/v1` |

## Step 4: Deploy

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

That's it. The app will:
1. Start PostgreSQL & Redis
2. Build the backend & frontend
3. Run Prisma migrations automatically
4. Start nginx on port 80

First deploy takes ~3-5 minutes to build. Check progress with:

```bash
docker compose -f docker-compose.prod.yml logs -f
```

## Step 5: Set up CloudFlare

1. Add your domain to CloudFlare
2. Point an **A record** to your server IP (orange cloud ON)
3. SSL/TLS > set to **Full (strict)**
4. CloudFlare will handle HTTPS for you — nginx only needs port 80

---

## Common Commands

```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml logs -f frontend

# Restart after code changes
git pull
docker compose -f docker-compose.prod.yml up -d --build

# Stop everything
docker compose -f docker-compose.prod.yml down

# Database backup
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U payway payway > backup.sql

# Restore database
cat backup.sql | docker compose -f docker-compose.prod.yml exec -T postgres psql -U payway payway
```

## Create First Super Admin

After first deploy, seed the database or create a user via the API:

```bash
docker compose -f docker-compose.prod.yml exec backend node -e "
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const prisma = new PrismaClient();
(async () => {
  const hash = await bcrypt.hash('YourPassword123!', 12);
  await prisma.user.create({
    data: {
      email: 'admin@yourdomain.co.za',
      passwordHash: hash,
      firstName: 'Admin',
      lastName: 'User',
      role: 'super_admin',
    }
  });
  console.log('Super admin created');
  process.exit(0);
})();
"
```
