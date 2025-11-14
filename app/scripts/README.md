# Scripts Directory

This directory contains utility scripts for database management, validation, and maintenance.

## Directory Structure

### Active Scripts (Root Level)

**Current utility scripts (all use Prisma/PostgreSQL):**

- `run-backfill.js` - **Populate database from GitHub API**
  - Fetches historical PRs and reviews from specified date range
  - Includes duplicate prevention and rate limit handling
  - Usage: `node scripts/run-backfill.js YYYY-MM-DD YYYY-MM-DD`
  - Example: `node scripts/run-backfill.js 2019-01-01 2025-10-23`

- `simple-fetch-prs.js` - Basic PR fetching script (dev/testing)
- `recalculate-points.js` - Recalculate contributor points
- `backdate-point-history.js` - Populate point history from contributions
- `create-test-challenge.js` - Create test challenge data
- `verify-quarter-user.js` - Verify quarterly stats for specific user
- `recompute-quarter-fallback.js` - Recompute current quarter stats (fallback method)
- `recompute-quarter-history.js` - Recompute quarter stats from history
- `recompute-alltime-from-history.js` - Recompute all-time stats from contribution history

**Example Usage:**
```bash
cd app

# Populate database from GitHub (most common)
node scripts/run-backfill.js 2024-01-01 2025-10-23

# Verify quarterly stats
node scripts/verify-quarter-user.js cru-Luis-Rodriguez

# Recalculate points
node scripts/recalculate-points.js
```

### Duplicate Detection & Repair

**Use the Admin UI (recommended):**
1. Navigate to Admin page → Data Overview section
2. Click "🔍 Check for Duplicates" to detect issues
3. Click "🔧 Fix Duplicates" to repair (confirmation required)

**Service-based duplicate detection:**
The application includes built-in duplicate detection via `contributorService.js`:
- `checkForDuplicates()` - Detect duplicate PRs/reviews
- `fixDuplicates()` - Repair duplicates and correct counts
- Accessible through Admin API endpoints

### `setup/`
Initialization scripts for setting up new features.

**Usage:** Run these scripts to initialize new subsystems or features.

- `init-quarterly.js` - Initialize quarterly leaderboard system

**Example:**
```bash
cd app
node scripts/setup/init-quarterly.js
```

### `demo/`
Demo and example scripts for testing framework capabilities.

**Usage:** Reference these for understanding test patterns.

- `test-demo.js` - Full test framework demo
- `test-demo-simple.js` - Simplified test demo

### `backup/mongoose-scripts/`
**Legacy scripts (Mongoose/MongoDB - kept for reference only)**

Old validation and migration scripts have been moved to `backup/mongoose-scripts/`. These are no longer used but kept for historical reference. The application now uses Prisma with PostgreSQL.

## Creating New Utility Scripts

Parent directory: `/app/scripts/`

**All scripts must:**
1. Import Prisma client from `../lib/prisma.js`
2. Load environment variables from project root: `dotenv.config({ path: join(__dirname, '../../.env') })`
3. Include error handling and clear console output
4. Disconnect from Prisma before exiting: `await prisma.$disconnect()`

**Template:**
```javascript
import { prisma } from '../lib/prisma.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenv.config({ path: join(__dirname, '../../.env') });

async function myScript() {
    try {
        console.log('Connected to PostgreSQL database\n');

        // Your code here
        // Example: Query contributors
        const contributors = await prisma.contributor.findMany({
            take: 10,
            orderBy: { prCount: 'desc' }
        });

        console.log(`Found ${contributors.length} contributors`);
        contributors.forEach(c => {
            console.log(`- ${c.username}: ${c.prCount} PRs`);
        });

        console.log('\nScript completed successfully');
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

myScript();
```

**Key Prisma Patterns:**

```javascript
// Query records
const contributors = await prisma.contributor.findMany({
    where: { prCount: { gt: 10 } },
    orderBy: { prCount: 'desc' },
    take: 10
});

// Create record
const contributor = await prisma.contributor.create({
    data: {
        username: 'newuser',
        prCount: 1,
        reviewCount: 0
    }
});

// Update record
await prisma.contributor.update({
    where: { username: 'newuser' },
    data: { prCount: 2 }
});

// Count records
const count = await prisma.contributor.count({
    where: { prCount: { gte: 100 } }
});

// Raw SQL (when needed)
const result = await prisma.$queryRaw`
    SELECT * FROM contributors WHERE pr_count > 100
`;
```

## Common Issues

### "Environment variable not found: DATABASE_URL"
- Check that `.env` file exists in app directory
- Verify `DATABASE_URL` is set: `postgresql://user:pass@localhost:5432/github_scoreboard`
- Verify `dotenv.config()` path is correct

### "P1001: Can't reach database server"
- Ensure PostgreSQL is running: `docker ps` (look for `postgres_scoreboard`)
- Start Docker if needed: `docker-compose up -d postgres`
- Check connection string matches your database credentials

### "P2002: Unique constraint failed"
- Check for duplicate records before inserting
- Use `upsert` instead of `create` when appropriate:
  ```javascript
  await prisma.contributor.upsert({
      where: { username: 'user' },
      update: { prCount: 10 },
      create: { username: 'user', prCount: 10 }
  });
  ```

### "Not Found" error from GitHub API
- Verify `REPO_OWNER` and `REPO_NAME` in `.env` (remove quotes if present)
- Check `GITHUB_TOKEN` is valid and has repo access
