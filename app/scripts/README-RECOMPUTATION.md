# Recomputation Scripts

This directory contains scripts to recompute historical data without running a full backfill.

## Available Scripts

### 1. `recompute-streaks.js`
Calculates streaks from existing `contributions` and `reviews` tables.

**When to use:**
- After implementing workweek streak logic
- After backfilling historical data (backfill doesn't calculate streaks efficiently)
- When contributors have activity but `currentStreak = 0`

**What it does:**
- Reads all contribution dates (PRs + reviews combined) for each contributor
- Calculates streaks using workweek-aware logic (Mon-Fri, weekend gaps allowed)
- Updates `currentStreak`, `longestStreak`, and `lastContributionDate`
- Shows top current and all-time streaks

**Usage:**
```bash
# Run inside Docker container
docker exec github-pr-scoreboard-app-1 node scripts/recompute-streaks.js

# Or from host with correct DATABASE_URL
cd app
node scripts/recompute-streaks.js
```

**Output:**
```
🔄 Recomputing Streaks from Historical Data
Found 85 contributors

✅ Omicron7: current=3, longest=36, days=1174
✅ mikealbert: current=5, longest=26, days=1038
...

📊 Recomputation Summary:
   Total contributors: 85
   Updated: 85
   Skipped (no activity): 0

🏆 Top Current Streaks:
   1. davidhollenberger: 6 days (longest: 17)
   2. mikealbert: 5 days (longest: 26)
   ...
```

**Performance:**
- Processes ~85 contributors in < 1 second
- Much faster than backfill (no GitHub API calls)

---

### 2. `recompute-badges.js`
Awards all missing badges based on current contributor stats.

**When to use:**
- After backfilling historical data (backfill doesn't award badges)
- After fixing badge awarding logic
- When badges are out of sync with stats

**What it does:**
- Checks PR milestones (1, 10, 50, 100, 500, 1000)
- Checks review milestones (1, 10, 50, 100, 500, 1000)
- Awards Bill awards (1 per 50 PRs)
- Checks streak badges (via `checkStreakBadges`)
- Awards achievements (via `checkAndAwardAchievements`)

**Usage:**
```bash
# Run inside Docker container
docker exec github-pr-scoreboard-app-1 node scripts/recompute-badges.js

# Or from host
cd app
node scripts/recompute-badges.js
```

**Output:**
```
🏅 Recomputing and Awarding All Badges
Found 85 contributors

✅ Omicron7: First PR, 10 PRs, 50 PRs, ... 31 Bill(s)
✅ cru-Luis-Rodriguez: First PR, 10 PRs, ... 27 Bill(s)
...

📊 Badge Recomputation Summary:
   Total contributors: 85
   PR Badges: 234
   Review Badges: 187
   Streak Badges: 12
   Achievements: 45
   Bills: 127
   Total: 605

🎖️  Badge Holders:
   1000 PRs: 3 contributors
   500 PRs:  5 contributors
   100 PRs:  13 contributors
```

**Performance:**
- Processes ~85 contributors in ~7 seconds
- Safe to run multiple times (only awards missing badges)

---

## Recommended Workflow

**After Historical Backfill:**
```bash
# 1. Run backfill to populate PRs/reviews
docker exec github-pr-scoreboard-app-1 node -e "
import { startBackfill } from './services/backfillService.js';
startBackfill({ startDate: '2019-01-01', endDate: '2025-11-13', checkRateLimits: true });
"

# 2. Recompute streaks (fast)
docker exec github-pr-scoreboard-app-1 node scripts/recompute-streaks.js

# 3. Award all badges (includes achievements)
docker exec github-pr-scoreboard-app-1 node scripts/recompute-badges.js

# 4. Recompute Hall of Fame
docker exec github-pr-scoreboard-app-1 node -e "
import { recomputeHallOfFameAll } from './services/quarterlyService.js';
import { prisma } from './lib/prisma.js';
(async () => {
  await recomputeHallOfFameAll();
  await prisma.\$disconnect();
})();
"
```

**Quick Streak Refresh (After Workweek Logic Update):**
```bash
docker exec github-pr-scoreboard-app-1 node scripts/recompute-streaks.js
```

---

## Technical Details

### Streak Calculation Algorithm

```javascript
// For each contributor:
// 1. Get all contribution dates (PRs + reviews)
const dates = await getContributionDates(contributorId);

// 2. Sort dates chronologically
dates.sort((a, b) => a - b);

// 3. Calculate streaks using business day gaps
for (let i = 1; i < dates.length; i++) {
    const businessDaysGap = getBusinessDaysBetween(dates[i-1], dates[i]);

    if (businessDaysGap === 0) {
        // Same day or weekend only - maintain streak
    } else if (businessDaysGap === 1) {
        // Next business day - increment streak
        tempStreak++;
    } else {
        // Gap too large - reset streak
        tempStreak = 1;
    }
}

// 4. Check if current streak is still valid (not too old)
const daysSinceLastContribution = getBusinessDaysBetween(lastDate, today);
if (daysSinceLastContribution > 1) {
    currentStreak = 0; // Streak broken
}
```

### Badge Awarding Logic

```javascript
// Check each milestone
const milestones = [
    { threshold: 1, flag: 'firstPrAwarded' },
    { threshold: 10, flag: 'first10PrsAwarded' },
    // ... etc
];

for (const milestone of milestones) {
    if (prCount >= milestone.threshold && !contributor[milestone.flag]) {
        await updateContributor({ [milestone.flag]: true });
    }
}
```

---

## Safety

- **Idempotent**: Safe to run multiple times
- **No Data Loss**: Only adds missing badges/streaks, never removes
- **Read-Heavy**: Primarily reads from database, minimal writes
- **No API Calls**: Works entirely with local database data
- **Transactional**: Updates are atomic per contributor

---

## Troubleshooting

**"No contributors found":**
- Check DATABASE_URL environment variable
- Ensure Prisma migrations are applied: `npx prisma migrate deploy`

**"Streaks all showing 0":**
- Run `recompute-streaks.js` first
- Check that `contributions` and `reviews` tables have data

**"Badges not awarded":**
- Check Prisma schema field names match script
- Ensure `prCount` and `reviewCount` are populated
- Run with `--verbose` flag for detailed logging

**"Achievement errors":**
- Ensure achievements table exists
- Check that `achievementService.js` is properly imported
- Achievements require `achievements` and `completedChallenges` includes

---

## Future Enhancements

- [ ] Add `--dry-run` flag to preview changes
- [ ] Add `--username` flag to process single contributor
- [ ] Add `--since` date filter for partial recomputation
- [ ] Export recomputation results to CSV
- [ ] Add holiday support to streak calculation
