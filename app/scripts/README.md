# Scripts Directory

This directory contains utility scripts for database management, validation, and maintenance.

## Directory Structure

### `validation/`
Scripts for verifying database integrity and comparing data sources.

**Usage:** Run these scripts to verify data consistency and troubleshoot issues.

#### Data Verification Scripts:
- `compare-github-vs-database.js` - Compare GitHub PR counts vs database counts for each month
- `verify-september-data.js` - Verify September 2025 PR data in database
- `verify-september-reviews.js` - Verify September 2025 review data in database
- `test-september-reviews.js` - Test September PR reviews from GitHub API
- `check-processed-reviews.js` - Check processedReviews tracking status
- `check-actual-dates.js` - Display all PR dates in database by month
- `check-backfill-progress.js` - Check backfill completion progress
- `check-current-totals.js` - Show current database totals and latest PRs
- `check-post-backfill-prs.js` - Check PRs added after backfill completion
- `quick-db-check.js` - Quick database status check
- `list-databases.js` - List all MongoDB databases and collections

#### Duplicate Detection & Repair:
- `fix-duplicates-dry-run.js` - **Analyze duplicates without making changes (recommended first step)**
  - Shows count mismatches between `prCount` and `processedPRs.length`
  - Identifies duplicate entries in tracking arrays
  - Provides detailed report of what would be fixed

- `fix-duplicates-execute.js` - **Fix duplicates and correct counts (modifies database)**
  - Corrects `prCount` to match `processedPRs.length`
  - Corrects `reviewCount` to match `processedReviews.length`
  - Removes duplicate entries from tracking arrays
  - Includes 5-second confirmation delay

**⚠️ Important:** Always run `fix-duplicates-dry-run.js` first to review changes before executing!

**Example:**
```bash
cd app

# 1. Check for duplicates (dry run - safe, no changes)
node scripts/validation/fix-duplicates-dry-run.js

# 2. Review the output, then fix if needed
node scripts/validation/fix-duplicates-execute.js

# 3. Restart Docker to apply cron fix
docker-compose restart app
```

Or use the Admin UI:
1. Navigate to Admin page → Data Overview section
2. Click "🔍 Check for Duplicates" to detect issues
3. Click "🔧 Fix Duplicates" to repair (confirmation required)

### `migration/`
One-time migration scripts for database schema changes.

**Usage:** Run these scripts once when deploying new features that require data migration.

- `backfill-quarterly-stats.js` - Populate current quarter stats from existing contribution data
- `backfill-hall-of-fame.js` - **Populate Hall of Fame with all historical quarterly winners**
  - Analyzes all historical data from backfill (2019-present)
  - Calculates top 3 contributors for each quarter
  - Creates QuarterlyWinner records for Hall of Fame
  - Processes 27+ quarters automatically
  - Safe to re-run (updates existing records)

**Example:**
```bash
cd app

# Backfill current quarter only
node scripts/migration/backfill-quarterly-stats.js

# Backfill entire Hall of Fame (all historical quarters)
node scripts/migration/backfill-hall-of-fame.js

# Verify Hall of Fame was populated
node scripts/validation/check-hall-of-fame.js
```

**When to Run:**
- `backfill-hall-of-fame.js`: After initial backfill of historical PR data
- Shows championship leaderboard (e.g., Omicron7: 13 wins, cru-Luis-Rodriguez: 10 wins)

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

## Creating New Utility Scripts

Parent directory: `/app/scripts/`

**All scripts must:**
1. Connect to the correct database: `mongodb://localhost:27017/github-scoreboard`
2. Load environment variables from project root: `dotenv.config({ path: join(__dirname, '../../.env') })`
3. Include error handling and clear console output
4. Disconnect from database before exiting

**Template:**
```javascript
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root (adjust path based on subfolder depth)
dotenv.config({ path: join(__dirname, '../../.env') });  // For scripts/
// dotenv.config({ path: join(__dirname, '../../../.env') });  // For scripts/validation/

async function myScript() {
    try {
        await mongoose.connect('mongodb://localhost:27017/github-scoreboard');
        console.log('Connected to database\n');

        // Your code here

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

myScript();
```

## Common Issues

### "The `uri` parameter to `openUri()` must be a string"
- Check that `.env` file exists in project root
- Verify `dotenv.config()` path is correct based on script location

### "Not Found" error from GitHub API
- Verify `REPO_OWNER` and `REPO_NAME` in `.env` (remove quotes if present)
- Check `GITHUB_TOKEN` is valid and has repo access

### Connecting to wrong database
- Always use `github-scoreboard` database name
- Check connection string: `mongodb://localhost:27017/github-scoreboard`
