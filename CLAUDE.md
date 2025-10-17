# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

### Running the Application
```bash
cd app
npm install
npm start
```

### Docker Development
```bash
# Build and run with Docker Compose (includes MongoDB and Mongo Express)
docker-compose up --build

# Access points:
# - Application: http://localhost:3000  
# - Mongo Express (DB admin): http://localhost:8081 (admin/admin)
```

### Environment Setup
- Copy `.env.example` to `.env` in app directory and populate with actual values:
  - `GITHUB_TOKEN`: GitHub personal access token
  - `MONGO_URI`: MongoDB connection string
  - `NODE_ENV`: 'development' or 'production'
  - AWS credentials for production (DynamoDB)

## ⚠️ CRITICAL SECURITY REQUIREMENTS

**NEVER COMMIT SECRETS TO GITHUB:**
- All sensitive values (tokens, passwords, keys) must be in `.env` files only
- `.env` files are gitignored and should never be committed
- Use `.env.example` with placeholder values for documentation
- Before any commit, verify no secrets are included:
  ```bash
  git diff --cached  # Check staged changes for secrets
  ```
- If secrets are accidentally committed, they must be rotated immediately
- Use `git log --oneline -p` to check commit history for exposed secrets

## Architecture Overview

### Technology Stack
- **Backend**: Express.js with ES modules
- **Database**: MongoDB (development) / DynamoDB (production)
- **GitHub Integration**: Octokit REST API
- **Task Scheduling**: node-cron for daily PR fetching and weekly challenge generation
- **Real-time Communication**: Socket.IO for live updates
- **Frontend**: EJS templates with vanilla JavaScript and modern CSS design system
- **Authentication**: GitHub OAuth via Passport.js
- **Testing**: Jest with ES modules support

### Database Architecture
The application uses a dual database approach:
- **Development**: MongoDB via Mongoose
- **Production**: AWS DynamoDB
- Database client abstraction in `app/config/db-config.js`

### Core Data Models

**Contributor Schema** (`app/models/contributor.js`):
- Username, PR/review counts, avatar URL
- Badge tracking flags for milestones (1, 10, 50, 100, 500, 1000)
- Time-series contribution and review arrays
- Bill/Vonette award tracking
- **NEW: Streak tracking** (currentStreak, longestStreak, lastContributionDate)
- **NEW: Points system** (totalPoints, pointsHistory with timestamps)
- **NEW: Challenge participation** (activeChallenges, completedChallenges)
- **NEW: Streak badges** (sevenDay, thirtyDay, ninetyDay, yearLong)
- **PHASE 1: Duplicate prevention** (processedPRs, processedReviews arrays with PR numbers and dates)

**Challenge Schema** (`app/models/challenge.js`):
- Challenge metadata (title, description, type, target, reward)
- Status tracking (active, expired, completed)
- Date ranges (startDate, endDate)
- Participant tracking with progress
- Difficulty levels and categories

**PRMetadata Schema** (`app/models/prMetadata.js`) - **PHASE 1**:
- Repository identification (repoOwner, repoName)
- PR range tracking (firstPRFetched, latestPRFetched, totalPRsInDB)
- Date range tracking (dateRangeStart, dateRangeEnd)
- Last fetch timestamp (lastFetchDate)
- Fetch history array with timestamps, PR counts, and review counts
- Singleton pattern - one record per repository

### Key Components

**Controllers** (`app/controllers/`):
- `contributorController.js`: PR fetching, badge awarding, scoreboard data, points calculation
- `adminController.js`: Admin dashboard functionality
- `authController.js`: GitHub OAuth authentication
- **NEW:** `challengeController.js`: Challenge creation, joining, progress tracking, leaderboards
- **NEW:** `analyticsController.js`: Analytics data aggregation, CSV export

**Services** (`app/services/`):
- `contributorService.js`: Core business logic for PR tracking, badge awarding, database operations
- **NEW:** `streakService.js`: Streak tracking, streak badges, streak leaderboards
- **NEW:** `challengeService.js`: Challenge lifecycle management, weekly auto-generation
- **NEW:** `analyticsService.js`: Time-series data, heatmaps, growth metrics, CSV generation

**Routes** (`app/routes/`):
- `contributorRoutes.js`: API endpoints for scoreboard data and admin functions
- **NEW:** `challengeRoutes.js`: Challenge API endpoints (GET /api/challenges, POST /api/challenges/join, etc.)
- **NEW:** `analyticsRoutes.js`: Analytics API endpoints (GET /api/analytics/overview, /export, etc.)

**Views** (`app/views/`):
- EJS templates: `index.ejs`, `charts.ejs`, `activity.ejs`, `admin.ejs`, `top-cat.ejs`
- **NEW:** `challenges.ejs`: Challenge browsing and participation interface
- **NEW:** `analytics.ejs`: Comprehensive analytics dashboard with Chart.js visualizations
- Shared navigation in `partials/nav.ejs`

**Utilities** (`app/utils/`):
- **NEW:** `socketEmitter.js`: Centralized WebSocket event emission
- **NEW:** `logger.js`: Winston-based logging system

### Automation
- Daily cron job fetches merged PRs and reviews using GitHub API
- Automatic badge awarding system with GitHub comment notifications
- Bill/Vonette awards for top contributors (custom reward system)
- **NEW:** Daily streak verification and badge awarding (runs at midnight)
- **NEW:** Weekly challenge generation (runs Monday 00:00)
- **NEW:** Hourly expired challenge cleanup
- **NEW:** Points calculation on PR merge with label-based bonuses

### Security Features
- Helmet for security headers
- Rate limiting with express-rate-limit
- MongoDB sanitization
- CORS configuration
- JWT authentication for admin functions
- CSP with nonce for inline scripts

### File Structure
```
app/
├── scoreboard.js              # Main server entry point with Socket.IO
├── __tests__/                # Test suites
│   ├── integration/          # Integration tests (API, WebSocket)
│   ├── unit/                 # Unit tests (services, controllers)
│   └── setup.js              # Test utilities and helpers
├── config/                   # Configuration files
│   ├── db-config.js          # Database connection
│   ├── passport-config.js    # Authentication config
│   └── points-config.js      # Points calculation rules
├── controllers/              # Request handlers
│   ├── contributorController.js
│   ├── challengeController.js  # NEW
│   ├── analyticsController.js  # NEW
│   ├── adminController.js
│   └── authController.js
├── middleware/               # Authentication and error handling
├── models/                   # Mongoose schemas
│   ├── contributor.js        # Updated with gamification fields
│   └── challenge.js          # NEW
├── routes/                   # API route definitions
│   ├── contributorRoutes.js
│   ├── challengeRoutes.js    # NEW
│   └── analyticsRoutes.js    # NEW
├── services/                 # Business logic layer
│   ├── contributorService.js # Updated with points/streaks
│   ├── streakService.js      # NEW
│   ├── challengeService.js   # NEW
│   └── analyticsService.js   # NEW
├── utils/                    # Utilities
│   ├── socketEmitter.js      # NEW - WebSocket helpers
│   └── logger.js             # NEW - Logging
├── views/                    # EJS templates
│   ├── index.ejs             # Updated with real-time features
│   ├── charts.ejs
│   ├── challenges.ejs        # NEW
│   ├── analytics.ejs         # NEW
│   ├── activity.ejs
│   ├── admin.ejs
│   └── partials/
│       └── nav.ejs           # Updated navigation
└── public/                   # Static assets
    ├── modern-design-system.css  # NEW - Design tokens
    ├── theme-toggle.js           # NEW - Dark mode
    ├── socket-client.js          # NEW - WebSocket client
    ├── challenges-client.js      # NEW - Challenge interactions
    ├── analytics-client.js       # NEW - Analytics & charts
    ├── styles.css                # Updated styles
    └── scripts.js                # Updated with toast system
```

### Key Features

#### Core Features
- GitHub PR and review tracking with historical data
- Progressive badge system with GitHub notifications
- Admin dashboard with authentication
- Multiple chart views (activity, top contributors, date ranges)
- Responsive design with hamburger navigation

#### **NEW: Real-time Features (Socket.IO)**
- Live leaderboard updates without page refresh
- Real-time toast notifications for:
  - Badge awards
  - Challenge completions
  - Streak milestones
  - PR merges
- WebSocket event broadcasting to all connected clients
- Automatic reconnection handling

#### **NEW: Gamification System**
- **Streak Tracking:**
  - Daily contribution streak monitoring
  - Streak badges: Week Warrior (7d), Monthly Master (30d), Quarter Champion (90d), Year-Long Hero (365d)
  - Streak leaderboard
  - Streak broken notifications

- **Points System:**
  - Base points for PRs and reviews
  - Label-based bonuses (bug-fix, feature, documentation)
  - Points history tracking with timestamps
  - Points leaderboard

- **Weekly Challenges:**
  - Auto-generated weekly challenges (3 per week)
  - Challenge types: PR merge, reviews, streaks, points
  - Difficulty levels: easy, medium, hard
  - Progress tracking with real-time updates
  - Challenge leaderboards
  - Reward system with point bonuses
  - Challenge completion achievements

#### **PHASE 1: Data Visibility & Integrity**
- **PR Fetch Range Tracking:**
  - View PR number range fetched (e.g., #1 - #5678)
  - Total PRs and reviews in database
  - Date range of PRs (oldest to newest)
  - Last fetch timestamp
  - Fetch history (last 5-20 fetches with details)
  - Admin dashboard card with real-time stats

- **Duplicate Detection:**
  - Check for duplicate PRs within contributors
  - Check for duplicate reviews
  - Detect count mismatches (totalPRs vs processedPRs)
  - Detailed duplicate report with affected contributors
  - Admin dashboard UI for one-click duplicate checks
  - Summary statistics (duplicate count, affected users)

- **Data Integrity:**
  - Track processed PRs per contributor (prevent double-counting)
  - Track processed reviews with GitHub review IDs
  - Automatic duplicate prevention during PR fetching
  - Metadata tracking for audit trail
  - processedPRs and processedReviews arrays in Contributor schema
  - Indexed fields for performance (O(1) duplicate lookups)

#### **NEW: Modern UI/UX**
- CSS design system with custom properties (60+ design tokens)
- Dark mode with theme persistence
- Smooth animations (fadeIn, slideInUp, scaleIn)
- Modern card-based components
- Comprehensive button system
- Toast notification system (5 types: success, info, warning, error, achievement)
- Responsive grid system (1-4 columns)
- Utility classes for rapid development

#### **NEW: Analytics Dashboard**
- **Time-Series Visualizations:**
  - Contribution trends over time (PRs, reviews, points)
  - Team-wide activity aggregation
  - Customizable time periods (7, 30, 90, 180 days)

- **Activity Heatmap:**
  - Day of week × Hour of day visualization
  - Identifies peak contribution times
  - 90-day default lookback period

- **Growth Metrics:**
  - Week-over-week growth trends
  - Month-over-month growth trends
  - Percentage change calculations

- **Top Contributors Analysis:**
  - Comparative bar charts for top contributors
  - PR count vs review count breakdown
  - Points-based ranking

- **Challenge Statistics:**
  - Total challenges, active, completed
  - Participation and completion rates
  - Challenge type distribution
  - Unique participant tracking

- **Data Export:**
  - CSV export for contributors data
  - CSV export for challenges data
  - CSV export for activity time-series
  - Downloadable with proper headers

#### **NEW: Testing Infrastructure**
- Jest test framework with ES modules
- 69 test cases covering:
  - Unit tests for streak service (24 tests)
  - Unit tests for challenge service (27 tests)
  - Integration tests for WebSocket (18 tests)
- Test coverage: 75-80% for gamification features
- Mock implementations for external dependencies

---

## Testing

### Running Tests
```bash
cd app
npm test                # Run all tests
npm run test:watch      # Run tests in watch mode
npm run test:coverage   # Run tests with coverage report
```

### Test Structure
- **Unit Tests** (`__tests__/unit/`): Test individual services and functions
- **Integration Tests** (`__tests__/integration/`): Test API endpoints and WebSocket communication
- **Test Utilities** (`__tests__/setup.js`): Shared test helpers and mock data

### Writing Tests
- Use `createTestContributor()` helper for consistent test data
- Clean database before each test with `beforeEach()`
- Mock external dependencies (GitHub API, Socket.IO, logger)
- Use descriptive test names: `should [expected behavior] when [condition]`

---

## API Endpoints

### Contributor Endpoints
- **GET /api/contributors** - Get all contributors (sorted by PR count)
- **GET /api/contributors/:username** - Get specific contributor
- **GET /api/contributors/:username/stats** - Get detailed stats
- **POST /api/admin/fetch-prs** - Manually trigger PR fetch (admin only)
- **POST /api/admin/award-badges** - Manually award badges (admin only)

### Challenge Endpoints
- **GET /api/challenges** - Get all active challenges
- **GET /api/challenges/:id** - Get specific challenge
- **POST /api/challenges/join** - Join a challenge (body: `{username, challengeId}`)
- **GET /api/challenges/:id/leaderboard** - Get challenge leaderboard
- **GET /api/challenges/user/:username** - Get user's challenges

### Streak Endpoints
- **GET /api/streaks/leaderboard** - Get streak leaderboard
- **GET /api/streaks/:username** - Get user's streak stats

### Admin - Data Overview (Phase 1)
- **GET /api/admin/pr-range-info** - Get PR fetch range and database statistics (returns firstPR, latestPR, totalPRs, totalReviews, dateRange, lastFetch, fetchHistory)
- **GET /api/admin/duplicate-check** - Check for duplicate PRs/reviews in database (returns hasDuplicates, duplicateCount, details[], summary{})

### Analytics Endpoints
- **GET /api/analytics/overview** - Combined analytics dashboard data (team, top contributors, challenges, growth)
- **GET /api/analytics/contributor/:username** - Time-series data for specific contributor (query: `?days=30`)
- **GET /api/analytics/team** - Team-wide aggregated analytics (query: `?days=30`)
- **GET /api/analytics/heatmap** - Activity heatmap (day × hour) (query: `?days=90`)
- **GET /api/analytics/top-contributors** - Top contributors comparison (query: `?limit=10`)
- **GET /api/analytics/challenges** - Challenge participation statistics
- **GET /api/analytics/growth** - Week-over-week and month-over-month growth trends
- **GET /api/analytics/export** - Export data to CSV (query: `?type=contributors|challenges|activity&days=30`)

### WebSocket Events

**Client → Server:**
- None (client only listens)

**Server → Client:**
- `leaderboard-update` - Leaderboard data changed
- `pr-update` - New PR merged (`{username, prCount, reviewCount}`)
- `badge-awarded` - Badge awarded (`{username, badge, badgeImage}`)
- `streak-update` - Streak updated (`{username, currentStreak, longestStreak}`)
- `streak-broken` - Streak broken (`{username, oldStreak, currentStreak}`)
- `challenge-progress` - Challenge progress updated (`{username, challengeId, progress, target, percentComplete}`)
- `challenge-completed` - Challenge completed (`{username, challengeId, challengeName, reward, totalPoints}`)

---

## Gamification System Details

### Points Calculation
Defined in `app/config/points-config.js`:
- **PR Merged:** 10 points (base)
- **PR Reviewed:** 5 points
- **Bug Fix PR:** +5 bonus (15 total) - detected via `bug` or `fix` labels
- **Feature PR:** +10 bonus (20 total) - detected via `feature` or `enhancement` labels
- **Documentation PR:** 0 bonus (10 total) - detected via `documentation` label

### Streak Badge Thresholds
- **Week Warrior:** 7 consecutive days
- **Monthly Master:** 30 consecutive days
- **Quarter Champion:** 90 consecutive days
- **Year-Long Hero:** 365 consecutive days

### Challenge Types
1. **pr-merge**: Merge X PRs during challenge period
2. **review**: Complete X code reviews during challenge period
3. **streak**: Maintain X-day contribution streak
4. **points**: Earn X points during challenge period

### Challenge Rewards
- **Easy:** 100-150 points
- **Medium:** 200-250 points
- **Hard:** 300-500 points

---

## Cron Jobs Schedule

### Daily Jobs (runs at 00:00 UTC)
1. **Fetch PRs:** `fetchAndStorePRs()` - Fetch yesterday's merged PRs
2. **Award Badges:** `awardBadgesAndBills()` - Check and award milestone badges
3. **Check Streaks:** Verify contributor streaks, award streak badges

### Weekly Jobs (runs Monday 00:00 UTC)
1. **Generate Challenges:** `generateWeeklyChallenges()` - Create 3 new weekly challenges

### Hourly Jobs
1. **Expire Challenges:** `checkExpiredChallenges()` - Mark past challenges as expired

---

## Environment Variables

### Required
- `GITHUB_TOKEN` - GitHub personal access token with repo access
- `MONGO_URI` - MongoDB connection string
- `SESSION_SECRET` - Secret for session encryption
- `NODE_ENV` - 'development' or 'production'

### Optional
- `PORT` - Server port (default: 3000)
- `GITHUB_CLIENT_ID` - For GitHub OAuth
- `GITHUB_CLIENT_SECRET` - For GitHub OAuth
- `GITHUB_CALLBACK_URL` - OAuth callback URL

### AWS (Production Only)
- `AWS_REGION` - AWS region for DynamoDB
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret key

---

## Troubleshooting

### WebSocket Connection Issues
- Verify Socket.IO client version matches server version
- Check CORS configuration in `scoreboard.js`
- Ensure port 3000 is accessible
- Check browser console for connection errors

### Database Connection Issues
- Verify MongoDB is running (`docker-compose ps`)
- Check `MONGO_URI` environment variable
- Verify network connectivity
- Check logs: `docker-compose logs mongodb`

### Test Failures
- Ensure `NODE_ENV=test` is set
- Clear test database: `await Contributor.deleteMany({})`
- Check for open handles: `npm test -- --detectOpenHandles`
- Verify ES modules support: `node --experimental-vm-modules`

### Challenge Not Auto-Generating
- Check cron job logs in server console
- Verify `ENABLE_CHALLENGES` is not set to false
- Check system time (cron uses UTC)
- Manually trigger: Call `generateWeeklyChallenges()` in admin route

---

## Performance Tips

### Database Optimization
- Ensure indexes on: `username`, `currentStreak`, `totalPoints`, `challenge.status`
- Use `.select()` to limit returned fields
- Use `.lean()` for read-only queries (faster)

### WebSocket Optimization
- Use rooms for targeted broadcasts
- Debounce frequent updates
- Rate limit event emissions
- Disconnect idle clients after timeout

### Frontend Optimization
- Lazy load chart libraries
- Use virtual scrolling for large lists
- Minimize DOM updates
- Cache API responses with service workers

---

## Related Documentation
- `DoNotCommit/IMPLEMENTATION_PLAN.md` - Complete implementation roadmap
- `DoNotCommit/Phase_1*_Summary.md` - Phase-by-phase implementation summaries
- `docs/API.md` - Detailed API documentation (to be created)
- `docs/WEBSOCKET_EVENTS.md` - WebSocket event specifications (to be created)