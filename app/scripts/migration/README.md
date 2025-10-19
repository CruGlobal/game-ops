# Database Migration Scripts

Scripts for one-time database operations like schema migrations, cleanups, and backfills.

## 🔄 Full Database Reset & Backfill Process

Use this process when you need to clean duplicate data and repopulate with accurate information.

### Step 1: Fix the Duplicate Bug (✅ Already Fixed!)

The daily cron job had a bug that caused massive duplicates. **This is now fixed** in `contributorService.js`:

**Before (BUG):**
```javascript
await updateContributor(...);  // Added PR FIRST
const alreadyProcessed = ...;  // Checked duplicates AFTER
```

**After (FIXED):**
```javascript
const alreadyProcessed = ...;  // Check duplicates FIRST
if (alreadyProcessed) continue; // Skip if duplicate
await updateContributor(...);  // Only add if not duplicate
```

### Step 2: Clear Existing Data

**⚠️ IMPORTANT: Back up your database first if needed!**

```bash
cd app
node scripts/migration/clear-database.js
```

When prompted, type: `DELETE ALL DATA`

**What gets deleted:**
- All contributors (PR counts, reviews, streaks, points, badges)
- All challenges
- PR metadata
- Quarterly winners

**What is preserved:**
- Quarter settings (your calendar/fiscal year configuration)
- Database structure/schema

### Step 3: Full Backfill from GitHub

**Option A: Use the Admin UI (Recommended)**

1. Start the app: `npm start`
2. Navigate to: `http://localhost:3000/admin`
3. Scroll to "Historical Data Backfill" section
4. Set date range:
   - **Start Date:** When your repository was created (or earliest data you want)
   - **End Date:** Today's date
5. Keep "Check Rate Limits" enabled
6. Click "▶️ Start Backfill"
7. Monitor progress (real-time updates)
8. **You can close the browser** - process runs on server
9. Return to admin page to see progress anytime

**Option B: Use API Endpoint**

```bash
curl -X POST http://localhost:3000/api/admin/backfill/start \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2020-01-01",
    "endDate": "2025-10-18",
    "checkRateLimits": true
  }'
```

### Step 4: Verify Data Integrity

After backfill completes, run validation scripts:

```bash
cd app

# Compare GitHub vs Database counts
node scripts/validation/compare-github-vs-database.js

# Check for duplicates
node scripts/validation/check-processed-reviews.js

# Quick status check
node scripts/validation/quick-db-check.js
```

**Expected result:**
```
Month               GitHub PRs     Database PRs   Difference
----------------------------------------------------------------------
August 2025         161            161            ✅ 0
September 2025      273            273            ✅ 0
October 2025        95             95             ✅ 0
```

All months should show **✅ 0 difference** (perfect match).

---

## Backfill Performance

### Estimated Time

**Factors:**
- Total PRs to process
- Average reviews per PR
- GitHub API rate limit (5,000 requests/hour)
- Network speed

**Examples:**
- 1,000 PRs with 2 reviews each = ~3,000 API calls = **~36 minutes**
- 5,000 PRs with 3 reviews each = ~15,000 API calls = **~3 hours**
- 10,000 PRs with 2 reviews each = ~20,000 API calls = **~4 hours**

### Rate Limiting

GitHub allows **5,000 API requests per hour**. The backfill:
- Automatically pauses when limit is low
- Resumes after rate limit resets (hourly)
- Shows estimated time remaining

**With rate limiting enabled:**
- Maximum ~6,000 PRs per hour
- Large repositories (20k+ PRs) may take 4-6 hours

**Tips for faster backfill:**
- Run during off-hours (less API contention)
- Process in chunks (e.g., 6 months at a time)
- Monitor progress in admin UI

---

## Other Migration Scripts

### `backfill-quarterly-stats.js`

Populates quarterly statistics from existing contribution data.

**When to use:** After adding quarterly leaderboard feature to existing data.

```bash
node scripts/migration/backfill-quarterly-stats.js
```

---

## Troubleshooting

### "Database is already empty"

✅ Good! Skip to Step 3 (Full Backfill).

### Backfill shows "0 PRs, 0 reviews added"

**Possible causes:**
1. All data already exists (check with validation scripts)
2. Date range has no PRs (verify on GitHub)
3. Wrong database connection (should be `github-scoreboard`)

### "Rate limit reached"

✅ Normal! The backfill will:
- Show "Waiting for rate limit reset (Xm)"
- Automatically resume when limit resets
- Process continues on server (you can close browser)

### Backfill stopped/crashed

The backfill state is lost on app restart. If interrupted:
1. Note the last processed PR number from logs
2. Restart backfill with start date slightly before interruption
3. Duplicate prevention will skip already-processed PRs

---

## Safety Features

### Duplicate Prevention

The backfill uses `processedPRs` and `processedReviews` arrays to track what's been added:

```javascript
// Check if already processed
const alreadyProcessed = contributor.processedPRs?.some(
    p => p.prNumber === pr.number
);

if (alreadyProcessed) {
    // Skip - already in database
    continue;
}
```

**This means:**
- ✅ Safe to re-run backfill (skips duplicates)
- ✅ Safe to overlap date ranges
- ✅ Can resume after interruption

### Data Validation

After any migration, **ALWAYS** run validation:

```bash
node scripts/validation/compare-github-vs-database.js
```

This compares GitHub API counts vs database counts to ensure accuracy.

---

## Support

If you encounter issues:

1. Check app logs for errors
2. Run validation scripts to diagnose
3. Verify database connection string
4. Check GitHub token has repo access
5. Review `app/scripts/README.md` for common issues
