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
- **Task Scheduling**: node-cron for daily PR fetching
- **Frontend**: EJS templates with vanilla JavaScript
- **Authentication**: GitHub OAuth via Passport.js

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

### Key Components

**Controllers** (`app/controllers/`):
- `contributorController.js`: PR fetching, badge awarding, scoreboard data
- `adminController.js`: Admin dashboard functionality  
- `authController.js`: GitHub OAuth authentication

**Services** (`app/services/`):
- `contributorService.js`: Core business logic for PR tracking, badge awarding, database operations

**Routes** (`app/routes/`):
- `contributorRoutes.js`: API endpoints for scoreboard data and admin functions

**Views** (`app/views/`):
- EJS templates: `index.ejs`, `charts.ejs`, `activity.ejs`, `admin.ejs`, `top-cat.ejs`
- Shared navigation in `partials/nav.ejs`

### Automation
- Daily cron job fetches merged PRs and reviews using GitHub API
- Automatic badge awarding system with GitHub comment notifications
- Bill/Vonette awards for top contributors (custom reward system)

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
├── scoreboard.js          # Main server entry point
├── config/               # Database and authentication config
├── controllers/          # Request handlers
├── middleware/           # Authentication and error handling
├── models/              # Mongoose schemas
├── routes/              # API route definitions
├── services/            # Business logic layer
├── views/               # EJS templates
└── public/              # Static assets and client-side JavaScript
```

### Key Features
- GitHub PR and review tracking with historical data
- Progressive badge system with GitHub notifications
- Admin dashboard with authentication
- Multiple chart views (activity, top contributors, date ranges)
- Responsive design with hamburger navigation