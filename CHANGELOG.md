# Changelog

All notable changes to Game Ops are documented in this file.

---

## [Unreleased] - 2026-03-13

### Added
- **Quarterly Bill/Vonette Reward System** - Bills and Vonettes are now awarded at quarter boundaries instead of per-contribution
  - 1st place non-DevOps contributor: Vonette (5 Bills)
  - 2nd and 3rd place non-DevOps: 1 Bill each
  - DevOps team members: 1 Bill for 50+ contributions per quarter
  - `totalBillsAwarded` is a lifetime accumulator (never reset)
- Quarterly points reset alongside stats at quarter boundaries

### Changed
- Badge awarding now uses independent checks instead of else-if chain, allowing multiple badges to be awarded in a single scan
- Quarter boundary sequence: archive winners -> award bills -> reset stats/points
- Removed daily bill/vonette cron job (replaced by quarterly awards)
- Removed per-contribution bill awarding from PR merge and review processing
- Removed `billAwards` from cron task defaults

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
