# Changelog

All notable changes to Game Ops are documented in this file.

---

## [Unreleased] - 2026-08-21

### Changed
- **Streaks are now a weekly workday tally, and nothing rewards more than a five-day week** - a streak was an unbounded chain of consecutive contribution days, and the reward system was keyed to it: badges at 7 / 30 / 90 / 365, achievements paying up to 2000 points, PR point multipliers up to 2.0x, and a 30-day streak challenge template. Because `getAchievementProgress` renders a goal for every entry in the achievements config, the 90 and 365-day chains were advertised as targets on the achievements page. A streak is now the number of workdays in the current week on which a contributor merged a PR or completed a review: 0 to 5, or 0 to 4 in a week holding a federal holiday, resetting every Monday. The ceiling is a property of the value rather than a display rule, so no reward can be re-keyed above a five-day week. It is a tally rather than a chain, so a day off costs that day and nothing more, and the value is derived from the per-day `Contribution` and `Review` rows rather than accumulated, which makes it idempotent under replay. `verifyStreaks` becomes `reconcileWeeklyStreaks` and recomputes every contributor nightly, which is also what normalizes the live values inherited from the old model.

- **Weekend and holiday work no longer advances a streak** - `updateStreak` incremented whenever the working-day gap since the last contribution was exactly 1, which assumed the new contribution landed on a workday. Contributing Thursday, skipping Friday and contributing Saturday counted Friday as that single elapsed workday, so the streak survived and grew: weekend work paid for a skipped workday, and resting the weekend was the only way to lose the streak. `verifyStreaks` shared the off-by-one, so a streak read alive all weekend and a Saturday merge collected the stale multiplier. Weekend and holiday contributions are now ignored in both directions - they never count for a streak and never count against one. The test suite covered Friday-to-Saturday and had no Thursday-to-Saturday case, which is how this survived a rewrite and two reviews.

- **One streak badge, one achievement tier, one point multiplier** - Week Warrior is awarded for contributing on every workday of a week (reusing the legacy `seven_day_badge` column, so no migration). Monthly Master, Quarter Champion and Year-Long Hero are retired: nothing awards them, and the columns keep whatever they already hold, so nobody loses a badge earned under the old rules. The streak achievement threshold is 5 and the 30 / 90 / 365 entries are deleted rather than flagged, since a flag would have left them on the achievements page as goals; already-earned rows still render because `Achievement` carries its own name and description. The multiplier is a single 1.1x tier at a full workweek, replacing 1.1x / 1.25x / 1.5x / 2.0x - the old top tier doubled every PR's points for never taking a day off. The `30-day-streak` challenge template is removed: it asked for 30 workdays inside a 45-day window, which holds about 32.

- **The streak leaderboard no longer ranks on historical chains** - ties broke on `longestStreak`, which still holds pre-cap values in the dozens, so ordering by it kept ranking people on how long they once went without a day off. Ties now break on username, the "Longest Streak" ranking option is gone from the leaderboard view, and `longestStreak` is no longer written or displayed; the stored data is left as history.

### Removed
- `app/scripts/test-workweek-streaks.js` - asserted the retired consecutive-day model and wrote a real test user into whatever database was configured, cleaning up only on success. The unit suite covers the weekly tally.

---

## [Unreleased] - 2026-07-28

### Changed
- **Point Hunter now pays 250 and calls itself medium** - the weekly points challenge was priced at 150 with `difficulty: 'easy'`, the smallest reward of the four weekly templates. Measured against real completions it sits mid-field: easier than the review and streak challenges, harder than the PR-merge one, which pays 250. Its target stays at 500. The description now says the points come from merged PRs and reviews, because only those two paths feed a points challenge - `completeChallenge()` writes a reward straight to the contributor's totals and never calls `updateChallengeProgress()`, as do achievements and backfill, so finishing the other weekly challenges visibly raises a contributor's score while leaving the Point Hunter bar where it was. `challenge-templates.js`, which feeds only the admin template picker, carried a third set of numbers again (target 100) and is now aligned with what actually ships.

### Fixed
- **Completed challenges no longer shown as "Not Completed"** - `getUserChallenges()` bucketed every participation by the challenge's `status` alone and never read the participant's `completed` flag. Completing a challenge keeps the participant row (with `completed=true`) and adds a `CompletedChallenge`, so each finished participation was listed twice once its window closed: once as "Completed +N pts earned", and again as "Not Completed" under Final Progress. Because progress keeps accruing after the target is met, those phantom rows showed a final progress above target (`550 / 500`), which read as a challenge lost rather than won. Completed participations are now excluded from both the expired-incomplete and active buckets, since they are already reported in `completedChallenges`.

- **Progress no longer accrues on challenges that already ended** - the challenge-progress dispatch in `contributorService.js` iterated `contributor.activeChallenges`, an unfiltered include of every `ChallengeParticipant` row, and checked neither the challenge's status nor its date range. Every merged PR and review kept incrementing participant rows of long-closed challenges, which is why a 5-PR weekly challenge that ended in April showed a final progress of `34 / 5`. Worse, a participant who fell short at the deadline could later cross the target on post-window activity and be paid the reward for a challenge they missed. `updateChallengeProgress()` and `setChallengeProgressAbsolute()` now take an optional `activityDate` and ignore contributions outside `[startDate, endDate]`; the PR and review paths pass `mergedAt` / `submittedAt`. Keying on when the work happened rather than on `status` keeps `run-backfill.js` able to credit a historical contribution that fell inside the window of a since-expired challenge.

- **A challenge reward can no longer be paid twice** - `CompletedChallenge` had no unique constraint on `(contributorId, challengeId)`, so the award check in `completeChallenge()` was a read-then-write: two overlapping writers (the webhook path and the 6-hour catch-up cron, or a reconcile run overlapping either) could both see a participation as unawarded and both pay out. Adds `@@unique([contributorId, challengeId])` and migration `20260728_unique_completed_challenge`, so the award transaction rolls back instead of double-paying, and both `completeChallenge()` and the reconcile script treat `P2002` as "already awarded" rather than an error. Same fix shape as the quarterly-bill idempotency work in #95. The migration refuses to run if duplicates already exist, naming the count and the cleanup required, rather than failing on a bare index error during container startup.

### Added
- `app/scripts/reconcile-challenge-awards.js` - finds and pays out challenge rewards that were earned but never awarded. `completeChallenge()` writes the `CompletedChallenge` row and the points in one transaction, but the participant's `completed` flag is written separately beforehand, so a failed award transaction leaves a participation that looks finished and paid nothing. Reports two shapes: `flagged-not-awarded` (`completed=true`, no `CompletedChallenge`) and `target-met-not-flagged` (`progress >= target`, never flagged, never awarded). Reports only by default; `--apply` writes the awards, backdated to the challenge end date so the `CompletedChallenge` row and the point-history entry sit in the period the work happened in. Quarterly stats are only repaired for challenges that ended in the current quarter - `quarterlyStats` holds one live quarter and past quarters are settled in `QuarterlyWinner` archives with their rewards paid, so closed-quarter awards are reported under "Quarterly stats NOT repaired" rather than silently dropped. Only `flagged-not-awarded` is paid by default - a progress figure above target can be the residue of the post-window accrual described above rather than a real completion, so `target-met-not-flagged` rows are reported and withheld unless `--include-unflagged` is passed. Safe to re-run. Usage: `npm run reconcile:challenge:awards -- [--user <username>] [--apply] [--include-unflagged]`.

---

## [Unreleased] - 2026-06-15

### Fixed
- **Contribution attribution & review anti-farming** - points now go to the human contributor and can no longer be farmed. Applied across all ingest paths (webhook, 6-hour catch-up cron, historical backfill):
  - **PR authorship reattribution** - PRs opened by a proxy-bot account (`terrabloks[bot]`, `cru-devops`) are reattributed to the human who initiated them, parsed from the `Co-authored-by:` trailer TerraBloks stamps on its bot commit. Unresolvable PRs are skipped instead of crediting the bot.
  - **Proxy-bot review points blocked** - TerraBloks' "Auto-approved by TerraBloks" approval (posted as `cru-devops`) no longer earns review points.
  - **One review credit per reviewer per PR** - review dedupe is now keyed on `(contributor, PR)` instead of GitHub review id, closing the loophole where one person could submit many reviews on a single PR for repeated points. Distinct reviewers still each earn one.
  - **Self-reviews excluded** - reviewing your own PR earns no points; proxy-bot PR authors are resolved to the real initiator before the comparison.
  - **Only substantive review states count** - `APPROVED` and `CHANGES_REQUESTED` earn a credit; `COMMENTED`, `DISMISSED`, and `PENDING` do not.
  - Review state is now normalized for case — webhook payloads send lowercase state (`approved`) while the REST API sends uppercase (`APPROVED`); the previous uppercase-only handling would have rejected every webhook-delivered review.

### Added
- `app/services/attributionService.js` - proxy-bot registry (`PROXY_BOT_LOGINS`) and `Co-authored-by` resolver used to attribute proxy-bot PRs to their real author.

---

## [Unreleased] - 2026-03-13

### Added
- **Quarterly Bill/Vonette Reward System** - Bills and Vonettes are now awarded at quarter boundaries instead of per-contribution
  - 1st place non-DevOps contributor: Vonette (5 Bills)
  - 2nd and 3rd place non-DevOps: 1 Bill each
  - DevOps team members: 1 Bill for 50+ contributions per quarter
  - `totalBillsAwarded` is a lifetime accumulator (never reset)
- Quarterly points reset alongside stats at quarter boundaries
- **GitHub Discussion Announcements** - Optional quarterly winner announcements posted as GitHub Discussions
  - Toggle in admin settings (off by default)
  - Posts champion, podium, and DevOps participation details via GraphQL API
  - Requires Discussions to be enabled on the repository
- **Winners Banner** - In-app celebration banner on the leaderboard page
  - Shows for 7 days after a quarter ends
  - Displays champion avatar, stats, and top 3 podium
  - Dismissible with localStorage persistence per quarter

### Changed
- Badge awarding now uses independent checks instead of else-if chain, allowing multiple badges to be awarded in a single scan
- Quarter boundary sequence: archive winners -> award bills -> post discussion -> reset stats/points
- Removed daily bill/vonette cron job (replaced by quarterly awards)
- Removed per-contribution bill awarding from PR merge and review processing
- Removed `billAwards` from cron task defaults

### Removed
- `enableAchievementComments` and `enableBillsComments` settings (dead code from old PR comment system)
- `postAchievementComment` function and Octokit dependency from achievement service

### Fixed
- Prisma error on streaks reset: corrected field names (`sevenDayBadge` instead of `sevenDayStreakAwarded`, etc.)
- Prisma error on points reset: corrected model accessor (`prisma.pointHistory` instead of `prisma.pointsHistory`)
- Badge scan only awarding one badge per run (else-if chain converted to independent checks)
- 404 errors for streak badge images on leaderboard page (added fallback image map)

---

## [2.1.0] - 2026-03-01

### Added
- **Live Leaderboard Animations** - FLIP animations for smooth rank changes across all leaderboard tabs
- Rank number display on leaderboard entries
- Simulate PR merge test endpoint for end-to-end testing

### Changed
- Optimized leaderboard rendering with animation smoothness improvements

---

## [2.0.0] - 2026-01-15

### Added
- **Quarterly Leaderboard System** - Multi-timeframe leaderboards (All-Time, Quarterly, Hall of Fame)
- Configurable quarter calculation (Calendar, Fiscal, Academic, Custom)
- Automatic quarter boundary detection and reset with winner archiving
- Historical data backfill system with progress tracking
- **DevOps Team Filter** - GitHub Teams API integration for automatic sync
- Admin controls for DevOps team filtering on leaderboards
- Per-task cron toggle controls in admin dashboard
- Badge backfill endpoint for migrated data

### Changed
- Migrated from MongoDB to PostgreSQL with Prisma ORM
- Database hosted on Neon (serverless PostgreSQL)

---

## [1.0.0] - 2025-06-01

### Added
- GitHub PR and review tracking with Octokit
- Progressive badge system (1, 10, 50, 100, 500, 1000 milestones)
- Real-time updates with Socket.IO
- Workweek streak tracking (business days only)
- Points system with label-based bonuses
- Weekly auto-generated challenges
- Modern UI with dark mode and design system
- Analytics dashboard with Chart.js visualizations
- GitHub OAuth authentication
- Admin dashboard with manual controls
- Jest test suite (69+ test cases)
- Toast notification system
