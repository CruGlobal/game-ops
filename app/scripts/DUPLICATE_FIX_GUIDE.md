# Duplicate Detection & Fix System

## Overview

The duplicate detection and fix system helps identify and repair data integrity issues in the GitHub PR Scoreboard database, specifically:

1. **Count Mismatches**: When `prCount` doesn't match `processedPRs.length`
2. **Review Mismatches**: When `reviewCount` doesn't match `processedReviews.length`
3. **Duplicate Entries**: Same PR or review tracked multiple times
4. **Cron Job Duplicates**: PRs added by hourly cron without proper tracking

## Current Situation (October 18, 2025)

### The Problem
- **Root Cause**: Docker container running old code without duplicate prevention fix
- **Impact**: Hourly cron job has added 298 duplicate PRs and 304 duplicate reviews since backfill
- **Fix Status**: Code fix is deployed but container needs restart

### Detection Results
```
Contributors with PR count mismatches: 23
Total excess PRs to remove: 298

Contributors with review count mismatches: 13
Total excess reviews to remove: 304

No duplicate entries in processedPRs/processedReviews arrays ✅
```

Top affected contributors:
- `cru-Luis-Rodriguez`: +99 PRs, +110 reviews
- `samuko`: +30 PRs, +5 reviews
- `mikealbert`: +27 PRs, +38 reviews
- `Omicron7`: +18 PRs, +83 reviews

## How to Fix

### Option 1: Admin UI (Recommended)

**Easiest and safest method with confirmation dialogs:**

1. Navigate to **Admin Page** → **Data Overview** section
2. Click **"🔍 Check for Duplicates"**
   - Reviews what duplicates exist
   - Shows affected contributors
   - Displays "Fix Duplicates" button if issues found
3. Click **"🔧 Fix Duplicates"**
   - Prompts for confirmation
   - Shows real-time progress
   - Displays results summary
4. **Restart Docker** to deploy cron fix:
   ```bash
   docker-compose restart app
   ```

### Option 2: Command Line Scripts

**For advanced users or debugging:**

```bash
cd app

# Step 1: Dry run (safe, no changes)
node scripts/validation/fix-duplicates-dry-run.js

# Step 2: Review output, then execute
node scripts/validation/fix-duplicates-execute.js

# Step 3: Restart Docker
docker-compose restart app
```

## What Gets Fixed

### 1. PR Count Correction
```javascript
// BEFORE
contributor.prCount = 1487
contributor.processedPRs.length = 1388
// Difference: 99 excess PRs

// AFTER
contributor.prCount = 1388
contributor.processedPRs.length = 1388
// ✅ Counts match
```

### 2. Review Count Correction
```javascript
// BEFORE
contributor.reviewCount = 2941
contributor.processedReviews.length = 2831
// Difference: 110 excess reviews

// AFTER
contributor.reviewCount = 2831
contributor.processedReviews.length = 2831
// ✅ Counts match
```

### 3. Duplicate Removal (if any)
Removes duplicate entries from `processedPRs` and `processedReviews` arrays while preserving unique entries.

## Technical Details

### Root Cause Analysis

**Why duplicates occurred:**
1. Hourly cron job was running with OLD code (no duplicate prevention)
2. Docker container started 5 hours ago with buggy version
3. Every hour, cron incremented counts but didn't check `processedPRs`
4. Result: 288 PRs added without tracking entries

**The bug (fixed in code, needs restart):**
```javascript
// OLD CODE (BUGGY):
await updateContributor(username, 'prCount', date, merged);  // ❌ Added FIRST
const alreadyProcessed = contributor?.processedPRs?.some(...); // Checked AFTER

// NEW CODE (FIXED):
const alreadyProcessed = contributor?.processedPRs?.some(...); // ✅ Check FIRST
if (alreadyProcessed) continue;  // Skip duplicates
await updateContributor(username, 'prCount', date, merged);  // Then add
```

**Location of fix:**
- File: `app/services/contributorService.js`
- Lines: 217-225 (duplicate check BEFORE update)
- Status: ✅ Code fixed, ⚠️ Container needs restart

### API Endpoints

#### Check for Duplicates
```
GET /api/admin/duplicate-check
```

**Response:**
```json
{
  "success": true,
  "data": {
    "hasDuplicates": true,
    "duplicateCount": 36,
    "details": [...],
    "summary": {
      "duplicatePRs": 0,
      "duplicateReviews": 0,
      "mismatches": 36,
      "affectedContributors": 23
    }
  }
}
```

#### Fix Duplicates
```
POST /api/admin/fix-duplicates
```

**Response:**
```json
{
  "success": true,
  "data": {
    "contributorsFixed": 23,
    "prCountAdjustments": 298,
    "reviewCountAdjustments": 304,
    "duplicatePRsRemoved": 0,
    "duplicateReviewsRemoved": 0
  }
}
```

### Database Changes

**Collections Modified:**
- `contributors`: Updates `prCount`, `reviewCount`, `processedPRs`, `processedReviews`

**Safety Measures:**
1. Uses `processedPRs` as source of truth (has actual PR numbers)
2. Never deletes PR numbers from tracking arrays
3. Only adjusts counts to match tracking arrays
4. Removes duplicate tracking entries (keeps first occurrence)

### Validation Scripts

**Pre-fix Analysis:**
- `check-current-totals.js` - Shows current state
- `check-duplicates-quick.js` - Quick mismatch check
- `fix-duplicates-dry-run.js` - Detailed fix preview

**Post-fix Verification:**
- `compare-github-vs-database.js` - Verify against GitHub API
- Admin UI: "Check for Duplicates" button

## After Fixing

### Expected Results
```
✅ All counts match their tracking arrays
✅ No duplicate entries remain
✅ 23 contributors corrected
✅ 298 PR count adjustments
✅ 304 review count adjustments
```

### Verification Steps

1. **Admin UI Check:**
   - Click "🔍 Check for Duplicates"
   - Should show: "✅ No Duplicates Found"

2. **Database Totals:**
   ```bash
   node scripts/validation/check-current-totals.js
   ```
   Should show: `Difference (missing from tracking): 0`

3. **Monitor Cron Jobs:**
   After Docker restart, watch logs:
   ```bash
   docker-compose logs -f app | grep "hourly task"
   ```
   Verify no new duplicates are created

## Prevention

### What We Fixed
- ✅ Duplicate prevention code deployed
- ✅ Check before update (not after)
- ✅ processedPRs tracking for all PRs
- ✅ processedReviews tracking for all reviews

### What You Need to Do
1. **Restart Docker** - Deploy the cron fix
2. **Monitor Logs** - Verify cron works correctly
3. **Check Weekly** - Run duplicate check in admin UI

### Warning Signs
- `prCount` increasing but `processedPRs.length` static
- Duplicate check finds mismatches after fix
- Logs show "already processed" but count still increments

## Troubleshooting

### Fix Didn't Work
```bash
# Verify fix was applied
node scripts/validation/check-current-totals.js

# Check for remaining mismatches
node scripts/validation/fix-duplicates-dry-run.js
```

### New Duplicates After Fix
```bash
# 1. Check if Docker was restarted
docker-compose ps  # Look for "Up X hours"

# 2. Restart if needed
docker-compose restart app

# 3. Verify cron code
grep -A 10 "alreadyProcessed" app/services/contributorService.js
```

### Script Errors
- **Connection Error**: Verify MongoDB is running (`docker-compose ps`)
- **Permission Error**: Run from `/app` directory
- **Import Error**: Check Node version supports ES modules

## Files Created/Modified

### New Files
- `app/scripts/validation/fix-duplicates-dry-run.js` - Analysis tool
- `app/scripts/validation/fix-duplicates-execute.js` - Repair tool
- `app/scripts/DUPLICATE_FIX_GUIDE.md` - This guide

### Modified Files
- `app/views/admin.ejs` - Added fix button and UI
- `app/controllers/adminController.js` - Added `fixDuplicatesController`
- `app/services/contributorService.js` - Added `fixDuplicates()` function
- `app/routes/contributorRoutes.js` - Added POST `/api/admin/fix-duplicates`
- `app/scripts/README.md` - Updated documentation

### Previously Fixed (Already Deployed)
- `app/services/contributorService.js:217-225` - Cron duplicate prevention

## Summary

**Current Status:**
- ✅ Duplicate prevention fix is in code
- ✅ Repair tools created (UI + CLI)
- ⚠️ Docker restart needed to deploy cron fix
- ⚠️ 298 duplicate PRs + 304 reviews need cleanup

**Next Steps:**
1. Click "Fix Duplicates" in Admin UI (or run execute script)
2. Restart Docker: `docker-compose restart app`
3. Verify: Click "Check for Duplicates" → Should be clean
4. Monitor: Check admin page weekly for issues

**Timeline:**
- Database clear: Oct 18, 11:10 AM
- Backfill complete: Oct 18, 4:45 PM (6060s duration)
- Duplicates created: Oct 18, 4:45 PM - present (cron running every hour)
- Fix deployed: Oct 18, ~5:30 PM (this session)
- Cleanup needed: Now (awaiting your action)
