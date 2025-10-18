# Backfill Investigation Report

**Date:** 2025-10-18
**Status:** Backfill running (13.4% complete - 1,143/8,517 PRs)

---

## Issue 1: Cron Job vs Backfill Duplicate Risk

### Current Situation
- **Cron job runs:** HOURLY (`0 * * * *` - every hour at minute 0)
- **Backfill running:** Started at 15:14, processing ~8,517 PRs
- **Both use same duplicate prevention:** `processedPRs` array

### Duplicate Prevention Mechanism

**Cron Job (`contributorService.js` lines 217-224):**
```javascript
const alreadyProcessed = contributor?.processedPRs?.some(
    p => p.prNumber === pr.number && p.action === 'authored'
);

if (alreadyProcessed) {
    continue; // Skip - already processed
}
```

**Backfill (`backfillService.js` lines 140-142):**
```javascript
const prAlreadyProcessed = contributor.processedPRs?.some(
    p => p.prNumber === pr.number
);

if (!prAlreadyProcessed) {
    // Process PR
}
```

### Risk Analysis

**✅ Low risk of duplicates** due to:
1. Both check `processedPRs` array using same `pr.number`
2. Both skip if PR already exists
3. Backfill processes OLD PRs (2019-2025)
4. Cron fetches RECENT PRs (last hour via `since: lastFetchDate`)

**⚠️ Potential race condition:**
```
Time 15:00:00 - Cron job starts, fetches recent PRs
Time 15:00:01 - Backfill processing same PR
           ↓
Both read contributor (no processedPRs entry)
Both check for duplicates (both return false)
Both add the PR
Both save to database
           ↓
Result: Duplicate created!
```

**Likelihood:** VERY LOW because:
- Backfill is processing PRs from months/years ago
- Cron only fetches PRs updated in last hour
- Overlap window is extremely small (only if backfill reaches TODAY's PRs at exact moment cron runs)

### Current Backfill Progress

```
   Contributors: 56
   Total PRs: 1,143
   Total Reviews: 1,503
   Tracked PRs: 1,143  ← Matches prCount (NO duplicates so far!)
   Tracked Reviews: 1,503

   Progress: 1,143 / 8,517 (13.4%)
```

✅ **No duplicates detected** - `processedPRs.length === prCount`

### Recommendation

**Option 1: Do Nothing** (Recommended for now)
- Risk is minimal
- Backfill will finish before reaching today's data
- Monitor with validation scripts after completion

**Option 2: Pause Cron During Backfill** (Safest)
- Temporarily disable hourly cron
- Re-enable after backfill completes
- Guarantees zero duplicates

**Option 3: Add Mongoose Transaction** (Complex)
- Use atomic read-check-write operations
- Prevents race conditions completely
- Requires code changes (wait for approval)

---

## Issue 2: Missing Progress Display

### Problem
User reports: "The progress of the backfill does not show as you describe. I don't see the processing PR # on the admin page or in the logs."

### Investigation

**What's happening:**
1. Backfill IS running ✅
2. Progress IS being tracked internally ✅
3. Progress IS NOT being displayed ❌

### Root Causes

#### Cause 1: No Logging to Console/Docker

**Current code (`backfillService.js` line 89-113):**
```javascript
function emitBackfillProgress() {
    const io = getSocketIO();
    if (!io) return;  // Silent failure if no Socket.IO!

    const progress = { ...backfillState.progress };
    // ... calculate ETA, percentage

    io.to('scoreboard-updates').emit('backfill-progress', progress);
    // ❌ NO logger.info() call!
}
```

**Issue:** Progress updates only go to WebSocket, NOT to logs.

**Evidence:**
```bash
docker logs github-pr-scoreboard-app-1 --tail 50
# Shows:
[15:14:21] INFO: Starting backfill from 2019-01-31 to 2025-10-18
[15:15:47] INFO: Found 8517 PRs to process
# Then NOTHING - no "Processing PR #XXX" messages!
```

#### Cause 2: WebSocket Event Name Mismatch?

**Backfill emits:** `'backfill-progress'` (line 112)

**Admin page listens for:** Need to check `admin.ejs`

Let me verify...

**Admin.ejs (line 647):**
```javascript
socket.on('backfill-progress', (progress) => {
    // Update UI
});
```

✅ Event names match!

#### Cause 3: Socket.IO Room Issue

**Backfill emits to:** `io.to('scoreboard-updates').emit(...)`

**Admin page joins:** Need to check if joining room...

Checking admin.ejs and socket-client.js...

**socket-client.js** shows room joins but admin page may not be subscribing!

### Summary of Issues

| Issue | Status | Impact |
|-------|--------|--------|
| No console logging | ❌ Confirmed | Can't monitor via docker logs |
| WebSocket emits to room | ⚠️ Suspicious | Admin page may not be in room |
| Socket.IO initialization | ⚠️ Unknown | May fail silently if not initialized |
| Admin UI not updating | ❌ Confirmed | User sees no progress bar movement |

---

## Proposed Fixes

### Fix 1: Add Console Logging (HIGH PRIORITY)

**File:** `app/services/backfillService.js`

**Change 1 - Add logging to `emitBackfillProgress()`:**
```javascript
function emitBackfillProgress() {
    const io = getSocketIO();

    const progress = { ...backfillState.progress };

    // Calculate ETA and percentage
    // ... existing code ...

    // ✅ ADD: Log progress every 10 PRs
    if (progress.processedPRs % 10 === 0 || progress.processedPRs === 1) {
        logger.info(`Backfill progress: ${progress.processedPRs}/${progress.totalPRs} PRs (${progress.percentage}%), ${progress.processedReviews} reviews`, {
            status: progress.status,
            eta: progress.eta,
            rateLimit: progress.rateLimit
        });
    }

    // Emit via WebSocket
    if (io) {
        io.to('scoreboard-updates').emit('backfill-progress', progress);
    }
}
```

**Benefit:** Visible progress in docker logs!

### Fix 2: Emit to All Clients (Not Just Room)

**File:** `app/services/backfillService.js`

**Change:** Emit to ALL connected clients, not just room
```javascript
if (io) {
    // Emit to room AND broadcast to all
    io.to('scoreboard-updates').emit('backfill-progress', progress);
    io.emit('backfill-progress', progress);  // ✅ ADD: Broadcast to all
}
```

**Benefit:** Ensures admin page receives updates even if not in room

### Fix 3: Add Dedicated Admin Socket Join

**File:** `app/views/admin.ejs`

**Add after socket connection:**
```javascript
// Join scoreboard-updates room
socket.emit('join-room', 'scoreboard-updates');

// Listen for backfill progress
socket.on('backfill-progress', (progress) => {
    // ... existing update code
});
```

**Benefit:** Explicitly joins the room where backfill emits

### Fix 4: Add Error Logging

**File:** `app/services/backfillService.js`

**Change:** Log when Socket.IO is not available
```javascript
function emitBackfillProgress() {
    const io = getSocketIO();

    if (!io) {
        logger.warn('Socket.IO not initialized - progress updates not sent to clients');
        return;
    }

    // ... rest of function
}
```

**Benefit:** Diagnose Socket.IO initialization issues

---

## Testing Plan

### Test 1: Verify Logging
```bash
# After implementing Fix 1
docker logs -f github-pr-scoreboard-app-1 | grep "Backfill progress"

# Expected output every 10 PRs:
# [TIME] INFO: Backfill progress: 10/8517 PRs (0%), 15 reviews {status, eta, rateLimit}
# [TIME] INFO: Backfill progress: 20/8517 PRs (0%), 28 reviews {status, eta, rateLimit}
```

### Test 2: Verify Admin UI
1. Open admin page
2. Start backfill
3. Check browser console for WebSocket messages
4. Verify progress bar updates

### Test 3: Verify No Duplicates After Cron
```bash
# After next cron run (hourly)
node scripts/validation/check-backfill-progress.js

# Check: processedPRs.length should equal prCount
```

---

## Current Backfill Status

**Started:** 15:14:21
**Current time:** ~15:17
**Duration:** ~3 minutes
**Progress:** 1,143 / 8,517 PRs (13.4%)
**Rate:** ~381 PRs/min
**Estimated completion:** ~22 more minutes (total ~25 min)

**Performance:** 🚀 EXCELLENT!
- Much faster than estimated 90-120 minutes
- Processing ~6 PRs per second
- Rate limiting not yet triggered

---

## Recommendations

### Immediate Actions
1. ✅ Let backfill continue (it's working well!)
2. ✅ Monitor with: `node scripts/validation/check-backfill-progress.js`
3. ⏸️ Wait for user approval before implementing fixes

### After Backfill Completes
1. Run validation: `node scripts/validation/compare-github-vs-database.js`
2. Implement progress logging fixes (Fix 1 + Fix 2)
3. Test fixes with small backfill

### Cron Job Handling
- No action needed (risk is minimal)
- Next cron run is at 16:00 (40 minutes from now)
- Backfill will likely finish before then

---

## Questions for User

1. **Cron job risk:** Should we pause the hourly cron during backfill? (Low risk, but safest)
2. **Progress fixes:** Approve implementing Fixes 1-4 after backfill completes?
3. **Monitoring:** Would you like real-time progress updates while waiting?
