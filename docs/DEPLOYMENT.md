# Deployment Guide

Complete guide for deploying the Game Ops to various environments.

---

## Table of Contents
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Local Development](#local-development)
- [Docker Deployment](#docker-deployment)
- [Production Deployment](#production-deployment)
- [Database Setup](#database-setup)
- [Monitoring & Logging](#monitoring--logging)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software
- **Node.js** >= 18.0.0
- **npm** >= 9.0.0
- **PostgreSQL** >= 14.0 (or Neon serverless PostgreSQL)
- **Docker** >= 20.10 (optional, recommended)
- **Git** >= 2.30

### Required Accounts
- **GitHub Account** with admin access to target repository
- **GitHub Personal Access Token** with `repo` scope
- **Neon Account** (recommended for cloud PostgreSQL) or local PostgreSQL

---

## Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/game-ops.git
cd game-ops
```

### 2. Install Dependencies

```bash
cd app
npm install
```

### 3. Configure Environment Variables

Create `.env` file in the `app/` directory:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Required Variables
GITHUB_TOKEN=<your-github-token>
DATABASE_URL=postgresql://user:password@localhost:5432/game_ops
SESSION_SECRET=<generate-random-secret>
NODE_ENV=development

# Optional Variables
PORT=3000
GITHUB_CLIENT_ID=<your-oauth-client-id>
GITHUB_CLIENT_SECRET=<your-oauth-client-secret>
GITHUB_CALLBACK_URL=http://localhost:3000/auth/github/callback

# Organization/Repository Settings
GITHUB_ORG=your-org-name
GITHUB_REPO=your-repo-name

# (Removed: ENABLE_CHALLENGES / ENABLE_STREAKS / ENABLE_POINTS /
#  CHALLENGE_AUTO_CREATE / CHALLENGE_DURATION_DAYS were documented here but are read
#  nowhere in the codebase. Challenge generation is toggled from the admin UI's cron
#  task settings, not by environment variable.)
```

### 4. Generate Session Secret

```bash
# Generate a secure random string
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Use this value for `SESSION_SECRET`.

---

## Local Development

### Using Node.js Directly

```bash
cd app
npm install

# Run Prisma migrations
npx prisma migrate deploy

# Generate Prisma Client
npx prisma generate

# Start application
npm start
```

Application runs at `http://localhost:3000`

### Using Docker Compose (Recommended)

```bash
# Build and start all services
docker-compose up --build

# Run in detached mode
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

**Services Available:**
- **Application:** `http://localhost:3000`
- **PostgreSQL:** `postgresql://localhost:5432`
- **Prisma Studio:** `http://localhost:5555` (run `npx prisma studio`)

### Development Mode with Hot Reload

```bash
cd app
npm run dev  # Uses nodemon for auto-restart
```

---

## Docker Deployment

### Build Docker Image

```bash
docker build -t game-ops:latest .
```

### Run Container

```bash
docker run -d \
  --name game-ops \
  -p 3000:3000 \
  -e GITHUB_TOKEN=<your-token> \
  -e DATABASE_URL=postgresql://user:password@host.docker.internal:5432/game_ops \
  -e SESSION_SECRET=<your-secret> \
  -e NODE_ENV=production \
  game-ops:latest
```

### Using Docker Compose for Production

Create `docker-compose.prod.yml`:

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      GITHUB_TOKEN: ${GITHUB_TOKEN}
      DATABASE_URL: postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/game_ops
      SESSION_SECRET: ${SESSION_SECRET}
    depends_on:
      - postgres
    restart: unless-stopped

  postgres:
    image: postgres:14-alpine
    environment:
      POSTGRES_DB: scoreboard
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app
    restart: unless-stopped

volumes:
  postgres_data:
```

Deploy:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

---

## Production Deployment

Production and stage are deployed by CI, not by hand. The sections that used to live
here described Heroku, a manual ECR push and an EC2 + PM2 setup — none of which this
application uses.

### What actually happens

1. A merge to `main` triggers **Build & Deploy ECS** (`.github/workflows/build-deploy-ecs.yml`),
   which builds the image and tags it `production-<build>`.
2. It hands off to **`CruGlobal/cru-deploy`** (`promote-ecs.yml`), which updates the ECS
   service and waits for the new task to take traffic before draining the old one.
3. The task definition runs two containers: **`db-migrate`**, which applies the schema,
   and **`app`**, whose command is plain `npm start` (see `Dockerfile`).

Infrastructure — the service, task definition, secrets and the migrate command — is
defined in **`applications/game-ops/<env>/application.tf` in the `cru-terraform`
repository**, not here.

### Schema changes

The `db-migrate` container runs:

```
npx prisma db push --accept-data-loss --skip-generate
```

**`db push` reads `schema.prisma` and nothing else.** It never reads
`prisma/migrations/`, and the production database has no `_prisma_migrations` table.

- A change expressible only as raw SQL — a functional index, a trigger, a data
  backfill — **will not reach production**, however correct the migration file is.
- Because `db push` makes the database match `schema.prisma`, an object that file does
  not describe can also be **dropped**.
- Migration files are still written so the docker-compose path stays in step and the
  intent is reviewable, but `schema.prisma` is the source of truth for production.

A successful run logs `🚀 Your database is now in sync with your Prisma schema`; a
no-op logs `The database is already in sync with the Prisma schema`. Both appear in
Datadog under `service:game-ops`.

### Secrets

Application secrets live in AWS Parameter Store under `/ecs/game-ops/<env>/` and are
injected by the task definition. Create or rotate them with the `cru` CLI
(`cru application secrets -n game-ops -e p`) — several, including `SESSION_SECRET`, are
created out of band and deliberately do not appear in Terraform.

`SESSION_SECRET` is **required** in production: the app refuses to boot without it
rather than silently falling back to another secret.

### Verifying a deploy

- `gh run list --repo CruGlobal/game-ops --branch main` — build and test status
- `gh run list --repo CruGlobal/cru-deploy --workflow promote-ecs.yml` — the ECS promotion
- Datadog `service:game-ops env:prod` — the boot sequence, the `db push` result, and
  `Cron system initialized`


## Database Setup

### Neon PostgreSQL (Cloud - Recommended)

**1. Create Account and Database**

- Visit [neon.tech](https://neon.tech)
- Create free tier project
- Create database named `scoreboard`
- Note the connection string

**2. Get Connection String**

```
postgresql://user:password@ep-example-123.us-east-2.aws.neon.tech/game_ops?sslmode=require
```

**3. Update Environment Variable**

```env
DATABASE_URL=postgresql://user:password@ep-example-123.us-east-2.aws.neon.tech/game_ops?sslmode=require
```

**4. Run Migrations**

```bash
cd app
npx prisma migrate deploy
```

### Local PostgreSQL

**Docker:**

```bash
docker run -d \
  --name postgres \
  -p 5432:5432 \
  -e POSTGRES_DB=game_ops \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=yourpassword \
  -v postgres_data:/var/lib/postgresql/data \
  postgres:14-alpine
```

**Native Installation (Ubuntu):**

```bash
# Install PostgreSQL
sudo apt update
sudo apt install -y postgresql postgresql-contrib

# Start PostgreSQL
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Create database and user
sudo -u postgres psql
CREATE DATABASE scoreboard;
CREATE USER game_ops_user WITH ENCRYPTED PASSWORD 'yourpassword';
GRANT ALL PRIVILEGES ON DATABASE scoreboard TO game_ops_user;
\q
```

**Native Installation (macOS):**

```bash
# Install via Homebrew
brew install postgresql@14

# Start PostgreSQL
brew services start postgresql@14

# Create database
createdb game_ops
```

**Set DATABASE_URL:**

```env
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/game_ops
```

**Run Prisma Migrations:**

```bash
cd app
npx prisma migrate deploy
npx prisma generate
```

### Database Management

**Prisma Studio (Recommended):**

```bash
cd app
npx prisma studio
```

Opens at `http://localhost:5555` - GUI for viewing and editing data.

**psql CLI:**

```bash
# Connect to database
psql postgresql://user:password@localhost:5432/game_ops

# List tables
\dt

# View schema
\d+ "Contributor"

# Query data
SELECT * FROM "Contributor" LIMIT 10;
```

---

## Monitoring & Logging

### PM2 Monitoring

```bash
# View logs
pm2 logs game-ops

# Monitor resources
pm2 monit

# View process info
pm2 info game-ops

# View dashboard
pm2 plus
```

### Application Logs

Logs are stored in:
- Development: Console output
- Production: `/var/log/game-ops/` (configure in logger.js)

### Health Check Endpoint

Add to your application:

```javascript
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});
```

### Monitoring Services

**New Relic:**

```bash
npm install newrelic
```

Add to `scoreboard.js`:

```javascript
require('newrelic');
```

**DataDog:**

```bash
npm install dd-trace --save
```

**Sentry (Error Tracking):**

```bash
npm install @sentry/node
```

---

## Troubleshooting

### Common Issues

**1. Port Already in Use**

```bash
# Find process using port 3000
lsof -i :3000

# Kill process
kill -9 <PID>
```

**2. PostgreSQL Connection Failed**

```bash
# Check PostgreSQL status
systemctl status postgresql

# View PostgreSQL logs
tail -f /var/log/postgresql/postgresql-14-main.log

# Test connection
psql $DATABASE_URL

# Or test with Prisma
cd app && npx prisma db pull
```

**3. WebSocket Connection Issues**

- Check firewall rules allow WebSocket connections
- Verify CORS configuration
- Check Nginx/proxy WebSocket support

**4. Memory Issues**

```bash
# Increase Node.js memory
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

**5. Permission Denied**

```bash
# Fix file permissions
sudo chown -R $USER:$USER /path/to/app
chmod -R 755 /path/to/app
```

### Logs Location

- **Application logs:** `/var/log/game-ops/`
- **Nginx logs:** `/var/log/nginx/`
- **PM2 logs:** `~/.pm2/logs/`
- **PostgreSQL logs:** `/var/log/postgresql/`

### Performance Optimization

**1. Enable Compression**

```javascript
import compression from 'compression';
app.use(compression());
```

**2. Database Indexing**

Prisma automatically creates indexes defined in schema.prisma:

```prisma
model Contributor {
  id String @id @default(cuid())
  username String @unique
  totalPoints BigInt @default(0)
  currentStreak Int @default(0)
  
  @@index([totalPoints(sort: Desc)])
  @@index([currentStreak(sort: Desc)])
}
```

**3. Connection Pooling**

Prisma handles connection pooling automatically. Configure in schema.prisma:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  // Connection pool settings
  // connection_limit = 10
}
```

**3. Caching**

```javascript
import redis from 'redis';
const client = redis.createClient();

// Cache leaderboard for 5 minutes
app.get('/api/contributors', async (req, res) => {
  const cached = await client.get('leaderboard');
  if (cached) return res.json(JSON.parse(cached));

  const data = await getContributors();
  await client.setEx('leaderboard', 300, JSON.stringify(data));
  res.json(data);
});
```

---

## Backup & Recovery

### Database Backup

**PostgreSQL:**

```bash
# Backup
pg_dump $DATABASE_URL > /backup/game_ops_$(date +%Y%m%d).sql

# Or using docker
docker exec postgres pg_dump -U postgres scoreboard > /backup/game_ops_$(date +%Y%m%d).sql

# Restore
psql $DATABASE_URL < /backup/game_ops_20251015.sql

# Or using docker
docker exec -i postgres psql postgresql://user:password@localhost:5432/game_ops < /backup/game_ops_20251015.sql
```

**Automated Backup Script:**

```bash
#!/bin/bash
BACKUP_DIR="/backups"
DATE=$(date +%Y%m%d_%H%M%S)

pg_dump $DATABASE_URL > "$BACKUP_DIR/game_ops_$DATE.sql"

# Compress backup
gzip "$BACKUP_DIR/game_ops_$DATE.sql"

# Keep only last 7 days
find $BACKUP_DIR -name "*.sql.gz" -type f -mtime +7 -delete
```

Add to crontab:

```bash
0 2 * * * /path/to/backup-script.sh
```

**Neon Backups:**

Neon provides automatic point-in-time recovery (PITR). Access via Neon dashboard:
- Automatic backups retained for 7 days (free tier)
- Restore to any point in time
- No manual backup scripts needed

---

## CI/CD Setup

### GitHub Actions

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'

    - name: Install dependencies
      run: cd app && npm ci

    - name: Run tests
      run: cd app && npm test

    - name: Build Docker image
      run: docker build -t game-ops .

    - name: Deploy to production
      run: |
        # Add your deployment commands here
```

---

## Security Checklist

- [ ] Environment variables are not committed to git
- [ ] `.env` file is in `.gitignore`
- [ ] SESSION_SECRET is randomly generated
- [ ] HTTPS is enabled with valid SSL certificate
- [ ] Firewall rules are configured
- [ ] PostgreSQL is not publicly accessible (use SSL/TLS)
- [ ] DATABASE_URL uses `?sslmode=require` for cloud databases
- [ ] Rate limiting is enabled
- [ ] CSP headers are configured
- [ ] Regular security updates are applied
- [ ] Logs don't contain sensitive data
- [ ] GitHub token has minimal required permissions
- [ ] Prisma is kept up to date for security patches

---

## Support

For deployment issues:
- **Documentation:** [CLAUDE.md](../CLAUDE.md)
- **GitHub Issues:** [github.com/yourusername/game-ops/issues](https://github.com/yourusername/game-ops/issues)

---

**Last Updated:** October 2025
