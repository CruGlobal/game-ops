# 🏆 GitHub PR Scoreboard

A gamified GitHub Pull Request tracking and leaderboard system with real-time updates, streak tracking, weekly challenges, and achievement badges.

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-green)
![License](https://img.shields.io/badge/license-MIT-orange)

---

## 🌟 Features

### Core Tracking
- **📊 PR & Review Tracking** - Automatic daily fetching of merged PRs and code reviews
- **🏅 Progressive Badge System** - Awards at 1, 10, 50, 100, 500, 1000 milestones
- **💵 Bill/Vonette Awards** - Custom reward system for top contributors
- **📈 Historical Data** - Time-series contribution and review tracking
- **👥 Multi-Timeframe Leaderboards** - All-Time, Quarterly, and 4 category views (PRs, reviews, points, streaks)
- **🏆 Quarterly Competition** - Fresh quarterly leaderboards with automatic reset and winner archiving
- **📜 Hall of Fame** - Historical archive of past quarterly champions and top 3 contributors

### ⚡ Real-time Features (Socket.IO)
- **Live Updates** - Leaderboard updates without page refresh
- **Toast Notifications** - Real-time alerts for:
  - Badge awards
  - Challenge completions
  - Streak milestones
  - PR merges
- **Broadcast System** - Updates pushed to all connected clients
- **Auto-reconnection** - Handles network interruptions gracefully

### 🎮 Gamification System
- **🔥 Streak Tracking**
  - Daily contribution streak monitoring
  - Streak badges: Week Warrior (7d), Monthly Master (30d), Quarter Champion (90d), Year-Long Hero (365d)
  - Streak leaderboard
  - Streak continuation/break notifications

- **⭐ Points System**
  - Base points for PRs (10pts) and reviews (5pts)
  - Label-based bonuses:
    - Bug fix: +5 bonus
    - Feature: +10 bonus
    - Documentation: base points
  - Points history with timestamps
  - Points leaderboard

- **🎯 Weekly Challenges**
  - Auto-generated every Monday (3 new challenges)
  - Challenge types: PR merges, code reviews, streaks, points
  - Difficulty levels: Easy, Medium, Hard
  - Real-time progress tracking
  - Challenge leaderboards
  - Point rewards: 100-500 pts based on difficulty
  - Achievement system for completions

### 🎨 Modern UI/UX
- **🌓 Dark Mode** - Theme toggle with persistence
- **🎭 Design System** - 60+ CSS custom properties (design tokens)
- **✨ Smooth Animations** - fadeIn, slideInUp, scaleIn transitions
- **🃏 Card Components** - Modern card-based layouts with hover effects
- **🔔 Toast System** - 5 notification types (success, info, warning, error, achievement)
- **📱 Responsive Design** - Mobile-first approach with breakpoints
- **🎛️ Utility Classes** - Comprehensive spacing, color, and layout utilities

### 🧪 Testing Infrastructure
- **Jest Framework** - ES modules support
- **69 Test Cases** covering:
  - Unit tests for streak service (24 tests)
  - Unit tests for challenge service (27 tests)
  - Integration tests for WebSocket (18 tests)
- **75-80% Coverage** for gamification features
- **Mock Implementations** for external dependencies

---

## 🚀 Quick Start

### Prerequisites
- Node.js >= 18.0.0
- MongoDB (or Docker)
- GitHub Personal Access Token with repo access

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/github-pr-scoreboard.git
cd github-pr-scoreboard
```

2. **Set up environment variables**
```bash
cd app
cp .env.example .env
```

Edit `.env` and add your credentials:
```env
GITHUB_TOKEN=your_github_token_here
MONGO_URI=mongodb://localhost:27017/scoreboard
SESSION_SECRET=your_random_secret_here
NODE_ENV=development
```

3. **Install dependencies**
```bash
npm install
```

4. **Start the application**
```bash
npm start
```

The app will be available at `http://localhost:3000`

### Docker Setup (Recommended)

```bash
# Build and run with Docker Compose (includes MongoDB and Mongo Express)
docker-compose up --build

# Access points:
# - Application: http://localhost:3000
# - Mongo Express (DB admin): http://localhost:8081 (admin/admin)
```

---

## 📖 Usage

### For Contributors

1. **View Your Stats**
   - Navigate to the homepage to see the main leaderboard
   - Find your username to view your PR count, reviews, badges, and streak

2. **Join Challenges**
   - Visit `/challenges` page
   - Browse active weekly challenges
   - Click "Join Challenge" to participate
   - Track your progress in real-time

3. **Track Your Streak**
   - Make daily contributions to build your streak
   - Earn streak badges at 7, 30, 90, and 365-day milestones
   - View your current and longest streak on your profile

4. **Earn Points**
   - Merge PRs: 10 points base
   - Review code: 5 points
   - Add labels to PRs for bonuses:
     - `bug` or `fix` label: +5 points
     - `feature` or `enhancement` label: +10 points

### For Admins

1. **Access Admin Dashboard**
   - Navigate to `/admin` (requires authentication)

2. **Manual Operations**
   - Trigger PR fetch manually
   - Award badges manually
   - View system statistics

3. **Monitor Challenges**
   - View all active and expired challenges
   - See participant counts and progress

---

## 🏗️ Architecture

### Technology Stack
- **Backend**: Express.js with ES modules
- **Database**: MongoDB (development) / DynamoDB (production)
- **Real-time**: Socket.IO for WebSocket communication
- **GitHub**: Octokit REST API for PR/review data
- **Scheduling**: node-cron for automated tasks
- **Frontend**: EJS templates, vanilla JavaScript, modern CSS
- **Authentication**: GitHub OAuth via Passport.js
- **Testing**: Jest with ES modules

### Key Components
```
app/
├── scoreboard.js         # Server entry point with Socket.IO
├── controllers/          # Request handlers
├── services/             # Business logic (contributor, streak, challenge)
├── models/              # Mongoose schemas (Contributor, Challenge)
├── routes/              # API endpoints
├── utils/               # Utilities (socketEmitter, logger)
├── views/               # EJS templates
├── public/              # Static assets (CSS, JS, images)
└── __tests__/           # Unit and integration tests
```

### Database Models

**Contributor:**
- Basic info: username, PR/review counts, avatar
- Badges: milestone tracking flags
- Streaks: current, longest, last contribution date
- Points: total, history with timestamps
- Challenges: active and completed lists

**Challenge:**
- Metadata: title, description, type, target
- Status: active, expired, completed
- Participants: username, progress, completion status
- Rewards: point values based on difficulty

**QuarterSettings:**
- System type: calendar, fiscal, academic, custom
- Configuration: Q1 start month (1-12)
- Helper methods: quarter calculation utilities
- Singleton pattern for single configuration

**QuarterlyWinner:**
- Quarter identification: "YYYY-QX" format
- Winner details: username, avatar, quarterly stats
- Top 3 contributors: rank, username, stats
- Metadata: total participants, archived date

---

## 🔧 Configuration

### Environment Variables

**Required:**
- `GITHUB_TOKEN` - GitHub PAT with repo access
- `MONGO_URI` - MongoDB connection string
- `SESSION_SECRET` - Session encryption key
- `NODE_ENV` - 'development' or 'production'

**Optional:**
- `PORT` - Server port (default: 3000)
- `GITHUB_CLIENT_ID` - OAuth app ID
- `GITHUB_CLIENT_SECRET` - OAuth app secret
- `GITHUB_CALLBACK_URL` - OAuth callback

**AWS (Production):**
- `AWS_REGION` - AWS region
- `AWS_ACCESS_KEY_ID` - AWS access key
- `AWS_SECRET_ACCESS_KEY` - AWS secret

### Points Configuration

Edit `app/config/points-config.js` to customize point values:
```javascript
export const POINTS = {
  PR_MERGED: 10,
  PR_REVIEWED: 5,
  BUG_FIX_BONUS: 5,
  FEATURE_BONUS: 10,
  DOCUMENTATION_BONUS: 0
};
```

---

## 📡 API Documentation

### Contributor Endpoints
- `GET /api/contributors` - Get all contributors
- `GET /api/contributors/:username` - Get specific contributor
- `GET /api/contributors/:username/stats` - Get detailed stats

### Challenge Endpoints
- `GET /api/challenges` - Get active challenges
- `GET /api/challenges/:id` - Get specific challenge
- `POST /api/challenges/join` - Join a challenge
- `GET /api/challenges/:id/leaderboard` - Get challenge rankings
- `GET /api/challenges/user/:username` - Get user's challenges

### Streak Endpoints
- `GET /api/streaks/leaderboard` - Get streak rankings
- `GET /api/streaks/:username` - Get user's streak stats

### Quarterly Leaderboard Endpoints
- `GET /api/leaderboard/all-time` - Get all-time rankings by total points
- `GET /api/leaderboard/quarterly` - Get current quarter rankings
- `GET /api/leaderboard/quarterly/:quarter` - Get specific quarter rankings
- `GET /api/leaderboard/hall-of-fame` - Get past quarterly winners

### Admin - Quarter Configuration
- `GET /api/admin/quarter-config` - Get quarter configuration
- `POST /api/admin/quarter-config` - Update quarter system (requires auth)

### Admin - Data Integrity (Phase 1)
- `GET /api/admin/pr-range-info` - Get PR fetch range and database statistics
- `GET /api/admin/duplicate-check` - Check for duplicate PRs/reviews
- `POST /api/admin/fix-duplicates` - Repair duplicate data (requires auth)

### WebSocket Events

**Server → Client:**
- `leaderboard-update` - Leaderboard data changed
- `pr-update` - New PR merged
- `badge-awarded` - Badge awarded to user
- `streak-update` - Streak continued
- `streak-broken` - Streak broken
- `challenge-progress` - Challenge progress updated
- `challenge-completed` - Challenge completed

For detailed API documentation, see [docs/API.md](docs/API.md) (coming soon).

---

## ⏰ Automated Tasks

### Daily (00:00 UTC)
1. Fetch yesterday's merged PRs
2. Award milestone badges
3. Verify and update contributor streaks
4. Award streak badges
5. Check for new quarter and reset if needed
   - Archive top 3 contributors to Hall of Fame
   - Reset all quarterly stats to 0
   - Broadcast quarter change notifications

### Weekly (Monday 00:00 UTC)
1. Generate 3 new weekly challenges

### Hourly
1. Mark expired challenges

---

## 🧪 Testing

### Run Tests
```bash
cd app
npm test                # Run all tests
npm run test:watch      # Watch mode
npm run test:coverage   # With coverage report
```

### Test Coverage
- **Unit Tests:** 51 test cases
  - Streak service (24 tests)
  - Challenge service (27 tests)
- **Integration Tests:** 18 test cases
  - WebSocket communication
  - API endpoints
- **Coverage:** 75-80% for gamification features

### Writing Tests
```javascript
import { createTestContributor } from '../setup.js';

it('should award streak badge', async () => {
  const contributor = await Contributor.create(
    createTestContributor({ username: 'test', currentStreak: 7 })
  );
  const badges = await checkStreakBadges(contributor);
  expect(badges).toHaveLength(1);
  expect(badges[0].name).toBe('Week Warrior');
});
```

---

## 🎯 Roadmap

### Phase 1: Core Enhancements ✅ (Complete)
- [x] Real-time updates with Socket.IO
- [x] Streak tracking system
- [x] Points system with bonuses
- [x] Weekly challenges
- [x] Modern UI with dark mode
- [x] Comprehensive testing
- [x] PR range visibility and duplicate detection
- [x] Data integrity validation and repair tools

### Phase 2: Quarterly Leaderboard System ✅ (Complete)
- [x] Multi-timeframe leaderboards (All-Time, Quarterly, Hall of Fame)
- [x] Configurable quarter calculation (Calendar, Fiscal, Academic, Custom)
- [x] Automatic quarter boundary detection and reset
- [x] Winner archiving to Hall of Fame
- [x] Historical data backfill (27 quarters archived from 2019-2025)
- [x] Modern Hall of Fame UI with compact cards
- [x] Quarterly stats tracking per contributor
- [x] Admin quarter configuration panel

### Phase 3: Analytics & Advanced Features (Planned)
- [ ] Team challenges
- [ ] Custom achievement creation
- [ ] Analytics dashboard with time-series visualizations
- [ ] Mobile app (React Native)
- [ ] Integration with Slack/Discord

### Phase 3: Enterprise Features (Planned)
- [ ] Multi-repository support
- [ ] Organization-wide leaderboards
- [ ] Custom badge designs
- [ ] Advanced analytics
- [ ] SSO integration

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines
- Follow ES module syntax
- Write tests for new features
- Update documentation
- Follow existing code style
- Test with `npm test` before committing

---

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **GitHub API** - For providing comprehensive PR and review data
- **Socket.IO** - For real-time communication
- **MongoDB** - For flexible data storage
- **Express.js** - For robust server framework
- **Jest** - For comprehensive testing

---

## 📞 Support

For questions, issues, or feature requests:
- **Issues**: [GitHub Issues](https://github.com/yourusername/github-pr-scoreboard/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/github-pr-scoreboard/discussions)
- **Email**: your.email@example.com

---

## 🔗 Links

- **Documentation**: [CLAUDE.md](CLAUDE.md) - Detailed architecture guide
- **Implementation Plan**: [DoNotCommit/IMPLEMENTATION_PLAN.md](DoNotCommit/IMPLEMENTATION_PLAN.md)
- **Phase Summaries**: [DoNotCommit/](DoNotCommit/) - Detailed phase-by-phase summaries

---

**Built with ❤️ by Luis Rodriguez and Claude Code**

Last Updated: October 2025
