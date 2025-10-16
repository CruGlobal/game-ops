# API Documentation

Complete API reference for the GitHub PR Scoreboard application.

**Base URL:** `http://localhost:3000` (development)

---

## Table of Contents
- [Authentication](#authentication)
- [Contributor Endpoints](#contributor-endpoints)
- [Challenge Endpoints](#challenge-endpoints)
- [Streak Endpoints](#streak-endpoints)
- [Admin Endpoints](#admin-endpoints)
- [WebSocket Events](#websocket-events)
- [Error Responses](#error-responses)

---

## Authentication

Most endpoints are publicly accessible. Admin endpoints require authentication via GitHub OAuth.

### GitHub OAuth Flow
1. Redirect user to `/auth/github`
2. GitHub redirects to callback URL
3. Session cookie is set
4. Access admin endpoints with session cookie

---

## Contributor Endpoints

### GET /api/contributors

Get all contributors sorted by PR count.

**Query Parameters:**
- `limit` (optional) - Number of results (default: 100)
- `offset` (optional) - Offset for pagination (default: 0)
- `sortBy` (optional) - Sort field: `prCount`, `reviewCount`, `totalPoints`, `currentStreak` (default: `prCount`)

**Response:**
```json
{
  "contributors": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "username": "johndoe",
      "avatarUrl": "https://avatars.githubusercontent.com/u/123456",
      "prCount": 156,
      "reviewCount": 89,
      "totalPoints": 1650,
      "currentStreak": 15,
      "longestStreak": 42,
      "badges": [
        {
          "badge": "100 PR badge",
          "date": "2025-09-15T10:30:00.000Z",
          "_id": "507f1f77bcf86cd799439012"
        }
      ],
      "totalBillsAwarded": 15
    }
  ],
  "total": 247,
  "limit": 100,
  "offset": 0
}
```

**Example:**
```bash
curl http://localhost:3000/api/contributors?limit=10&sortBy=totalPoints
```

---

### GET /api/contributors/:username

Get detailed information for a specific contributor.

**URL Parameters:**
- `username` (required) - GitHub username

**Response:**
```json
{
  "username": "johndoe",
  "avatarUrl": "https://avatars.githubusercontent.com/u/123456",
  "prCount": 156,
  "reviewCount": 89,
  "totalPoints": 1650,
  "currentStreak": 15,
  "longestStreak": 42,
  "lastContributionDate": "2025-10-15T00:00:00.000Z",
  "badges": [
    {
      "badge": "1st PR badge",
      "date": "2025-01-10T10:00:00.000Z"
    },
    {
      "badge": "100 PR badge",
      "date": "2025-09-15T10:30:00.000Z"
    }
  ],
  "streakBadges": {
    "sevenDay": true,
    "thirtyDay": true,
    "ninetyDay": false,
    "yearLong": false
  },
  "pointsHistory": [
    {
      "points": 15,
      "reason": "PR #1234 merged (bug-fix bonus)",
      "prNumber": 1234,
      "timestamp": "2025-10-15T14:30:00.000Z"
    }
  ],
  "activeChallenges": [
    {
      "challengeId": "507f1f77bcf86cd799439013",
      "progress": 3,
      "target": 5,
      "joined": "2025-10-14T00:00:00.000Z"
    }
  ],
  "completedChallenges": [
    {
      "challengeId": "507f1f77bcf86cd799439014",
      "completedAt": "2025-10-08T23:45:00.000Z",
      "reward": 250
    }
  ],
  "totalBillsAwarded": 15,
  "first10PrsAwarded": true,
  "first500PrsAwarded": false
}
```

**Example:**
```bash
curl http://localhost:3000/api/contributors/johndoe
```

---

### GET /api/contributors/:username/stats

Get aggregated statistics for a contributor.

**URL Parameters:**
- `username` (required) - GitHub username

**Response:**
```json
{
  "username": "johndoe",
  "stats": {
    "totalContributions": 245,
    "prCount": 156,
    "reviewCount": 89,
    "totalPoints": 1650,
    "rank": {
      "byPRs": 5,
      "byReviews": 12,
      "byPoints": 3,
      "byStreak": 8
    },
    "streak": {
      "current": 15,
      "longest": 42
    },
    "challenges": {
      "active": 2,
      "completed": 15,
      "successRate": 88.2
    },
    "badges": {
      "total": 12,
      "pr": 6,
      "review": 4,
      "streak": 2
    }
  }
}
```

**Example:**
```bash
curl http://localhost:3000/api/contributors/johndoe/stats
```

---

## Challenge Endpoints

### GET /api/challenges

Get all active challenges.

**Query Parameters:**
- `status` (optional) - Filter by status: `active`, `expired`, `completed` (default: `active`)
- `difficulty` (optional) - Filter by difficulty: `easy`, `medium`, `hard`
- `type` (optional) - Filter by type: `pr-merge`, `review`, `streak`, `points`

**Response:**
```json
{
  "challenges": [
    {
      "_id": "507f1f77bcf86cd799439013",
      "title": "Sprint Master",
      "description": "Merge 5 PRs this week",
      "type": "pr-merge",
      "target": 5,
      "reward": 250,
      "difficulty": "medium",
      "category": "individual",
      "status": "active",
      "startDate": "2025-10-14T00:00:00.000Z",
      "endDate": "2025-10-21T00:00:00.000Z",
      "participants": [
        {
          "username": "johndoe",
          "progress": 3,
          "completed": false,
          "joinedAt": "2025-10-14T08:00:00.000Z"
        }
      ]
    }
  ],
  "total": 3
}
```

**Example:**
```bash
curl http://localhost:3000/api/challenges?status=active&difficulty=medium
```

---

### GET /api/challenges/:id

Get detailed information for a specific challenge.

**URL Parameters:**
- `id` (required) - Challenge ID

**Response:**
```json
{
  "_id": "507f1f77bcf86cd799439013",
  "title": "Sprint Master",
  "description": "Merge 5 PRs this week",
  "type": "pr-merge",
  "target": 5,
  "reward": 250,
  "difficulty": "medium",
  "category": "individual",
  "status": "active",
  "startDate": "2025-10-14T00:00:00.000Z",
  "endDate": "2025-10-21T00:00:00.000Z",
  "participants": [
    {
      "username": "johndoe",
      "progress": 3,
      "completed": false,
      "joinedAt": "2025-10-14T08:00:00.000Z"
    },
    {
      "username": "janedoe",
      "progress": 5,
      "completed": true,
      "joinedAt": "2025-10-14T09:15:00.000Z"
    }
  ],
  "participantCount": 42
}
```

**Example:**
```bash
curl http://localhost:3000/api/challenges/507f1f77bcf86cd799439013
```

---

### POST /api/challenges/join

Join an active challenge.

**Request Body:**
```json
{
  "username": "johndoe",
  "challengeId": "507f1f77bcf86cd799439013"
}
```

**Response:**
```json
{
  "message": "Successfully joined challenge",
  "challenge": {
    "_id": "507f1f77bcf86cd799439013",
    "title": "Sprint Master",
    "target": 5,
    "reward": 250
  },
  "participant": {
    "username": "johndoe",
    "progress": 0,
    "target": 5,
    "joined": "2025-10-15T14:30:00.000Z"
  }
}
```

**Error Responses:**
- `400 Bad Request` - Missing username or challengeId
- `404 Not Found` - Challenge not found or contributor not found
- `409 Conflict` - Already joined this challenge
- `422 Unprocessable Entity` - Challenge is not active

**Example:**
```bash
curl -X POST http://localhost:3000/api/challenges/join \
  -H "Content-Type: application/json" \
  -d '{"username":"johndoe","challengeId":"507f1f77bcf86cd799439013"}'
```

---

### GET /api/challenges/:id/leaderboard

Get the leaderboard for a specific challenge.

**URL Parameters:**
- `id` (required) - Challenge ID

**Query Parameters:**
- `limit` (optional) - Number of results (default: 20)

**Response:**
```json
{
  "challengeId": "507f1f77bcf86cd799439013",
  "title": "Sprint Master",
  "target": 5,
  "leaderboard": [
    {
      "username": "janedoe",
      "progress": 5,
      "completed": true,
      "joinedAt": "2025-10-14T09:15:00.000Z"
    },
    {
      "username": "johndoe",
      "progress": 3,
      "completed": false,
      "joinedAt": "2025-10-14T08:00:00.000Z"
    }
  ]
}
```

**Example:**
```bash
curl http://localhost:3000/api/challenges/507f1f77bcf86cd799439013/leaderboard
```

---

### GET /api/challenges/user/:username

Get all challenges (active and completed) for a specific user.

**URL Parameters:**
- `username` (required) - GitHub username

**Response:**
```json
{
  "username": "johndoe",
  "activeChallenges": [
    {
      "challengeId": {
        "_id": "507f1f77bcf86cd799439013",
        "title": "Sprint Master",
        "type": "pr-merge",
        "target": 5,
        "reward": 250,
        "endDate": "2025-10-21T00:00:00.000Z"
      },
      "progress": 3,
      "target": 5,
      "joined": "2025-10-14T08:00:00.000Z"
    }
  ],
  "completedChallenges": [
    {
      "challengeId": {
        "_id": "507f1f77bcf86cd799439014",
        "title": "Review Champion",
        "type": "review",
        "reward": 200
      },
      "completedAt": "2025-10-08T23:45:00.000Z",
      "reward": 200
    }
  ],
  "totalCompleted": 15
}
```

**Example:**
```bash
curl http://localhost:3000/api/challenges/user/johndoe
```

---

## Streak Endpoints

### GET /api/streaks/leaderboard

Get the streak leaderboard.

**Query Parameters:**
- `limit` (optional) - Number of results (default: 10)

**Response:**
```json
{
  "leaderboard": [
    {
      "username": "janedoe",
      "avatarUrl": "https://avatars.githubusercontent.com/u/789012",
      "currentStreak": 87,
      "longestStreak": 120,
      "streakBadges": {
        "sevenDay": true,
        "thirtyDay": true,
        "ninetyDay": false,
        "yearLong": false
      }
    },
    {
      "username": "johndoe",
      "avatarUrl": "https://avatars.githubusercontent.com/u/123456",
      "currentStreak": 42,
      "longestStreak": 42,
      "streakBadges": {
        "sevenDay": true,
        "thirtyDay": true,
        "ninetyDay": false,
        "yearLong": false
      }
    }
  ]
}
```

**Example:**
```bash
curl http://localhost:3000/api/streaks/leaderboard?limit=20
```

---

### GET /api/streaks/:username

Get streak statistics for a specific user.

**URL Parameters:**
- `username` (required) - GitHub username

**Response:**
```json
{
  "username": "johndoe",
  "currentStreak": 42,
  "longestStreak": 42,
  "lastContributionDate": "2025-10-15T00:00:00.000Z",
  "streakBadges": {
    "sevenDay": true,
    "thirtyDay": true,
    "ninetyDay": false,
    "yearLong": false
  }
}
```

**For non-existent users:**
```json
{
  "username": "nonexistent",
  "currentStreak": 0,
  "longestStreak": 0,
  "lastContributionDate": null,
  "streakBadges": {
    "sevenDay": false,
    "thirtyDay": false,
    "ninetyDay": false,
    "yearLong": false
  }
}
```

**Example:**
```bash
curl http://localhost:3000/api/streaks/johndoe
```

---

## Admin Endpoints

All admin endpoints require authentication via GitHub OAuth.

### POST /api/admin/fetch-prs

Manually trigger PR fetching process.

**Authentication:** Required

**Response:**
```json
{
  "message": "PR fetch initiated",
  "timestamp": "2025-10-15T14:30:00.000Z"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/admin/fetch-prs \
  -H "Cookie: connect.sid=your_session_cookie"
```

---

### POST /api/admin/award-badges

Manually trigger badge awarding process.

**Authentication:** Required

**Response:**
```json
{
  "message": "Badge awarding completed",
  "badgesAwarded": 5,
  "billsAwarded": 2,
  "timestamp": "2025-10-15T14:30:00.000Z"
}
```

**Example:**
```bash
curl -X POST http://localhost:3000/api/admin/award-badges \
  -H "Cookie: connect.sid=your_session_cookie"
```

---

### POST /api/admin/generate-challenges

Manually generate weekly challenges.

**Authentication:** Required

**Response:**
```json
{
  "message": "Weekly challenges generated",
  "challenges": [
    {
      "_id": "507f1f77bcf86cd799439015",
      "title": "Sprint Master",
      "type": "pr-merge",
      "target": 5,
      "reward": 250
    }
  ],
  "timestamp": "2025-10-15T14:30:00.000Z"
}
```

---

## WebSocket Events

Connect to Socket.IO at the base URL: `http://localhost:3000`

### Client Connection

```javascript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
  console.log('Connected to server');
});
```

---

### Server → Client Events

#### leaderboard-update

Emitted when leaderboard data changes.

**Payload:**
```json
{
  "timestamp": "2025-10-15T14:30:00.000Z",
  "topContributors": [
    {
      "username": "johndoe",
      "prCount": 156,
      "totalPoints": 1650
    }
  ]
}
```

---

#### pr-update

Emitted when a new PR is merged.

**Payload:**
```json
{
  "username": "johndoe",
  "prCount": 157,
  "reviewCount": 89,
  "totalPoints": 1660,
  "prNumber": 1234,
  "prTitle": "Fix authentication bug"
}
```

---

#### badge-awarded

Emitted when a badge is awarded to a user.

**Payload:**
```json
{
  "username": "johndoe",
  "badge": "100 PR badge",
  "badgeImage": "100_pr_badge.png",
  "timestamp": "2025-10-15T14:30:00.000Z"
}
```

---

#### streak-update

Emitted when a user's streak continues.

**Payload:**
```json
{
  "username": "johndoe",
  "currentStreak": 43,
  "longestStreak": 43
}
```

---

#### streak-broken

Emitted when a user's streak is broken.

**Payload:**
```json
{
  "username": "johndoe",
  "oldStreak": 42,
  "currentStreak": 1,
  "lastContributionDate": "2025-10-13T00:00:00.000Z"
}
```

---

#### challenge-progress

Emitted when a user makes progress on a challenge.

**Payload:**
```json
{
  "username": "johndoe",
  "challengeId": "507f1f77bcf86cd799439013",
  "challengeName": "Sprint Master",
  "progress": 3,
  "target": 5,
  "percentComplete": 60
}
```

---

#### challenge-completed

Emitted when a user completes a challenge.

**Payload:**
```json
{
  "username": "johndoe",
  "challengeId": "507f1f77bcf86cd799439013",
  "challengeName": "Sprint Master",
  "reward": 250,
  "totalPoints": 1650
}
```

---

## Error Responses

All endpoints return errors in the following format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": "Additional details if available"
}
```

### HTTP Status Codes

- `200 OK` - Request successful
- `201 Created` - Resource created successfully
- `400 Bad Request` - Invalid request parameters
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions
- `404 Not Found` - Resource not found
- `409 Conflict` - Resource conflict (e.g., already joined challenge)
- `422 Unprocessable Entity` - Validation error
- `500 Internal Server Error` - Server error

### Common Error Codes

- `MISSING_PARAMETER` - Required parameter not provided
- `INVALID_PARAMETER` - Parameter value is invalid
- `RESOURCE_NOT_FOUND` - Requested resource doesn't exist
- `ALREADY_EXISTS` - Resource already exists
- `UNAUTHORIZED` - Authentication required
- `FORBIDDEN` - Insufficient permissions
- `VALIDATION_ERROR` - Input validation failed
- `INTERNAL_ERROR` - Unexpected server error

---

## Rate Limiting

API endpoints are rate limited to prevent abuse:

- **General endpoints:** 100 requests per 15 minutes per IP
- **Admin endpoints:** 30 requests per 15 minutes per authenticated user
- **WebSocket connections:** 10 connections per IP

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1634308800
```

---

## Pagination

Endpoints that return lists support pagination:

**Query Parameters:**
- `limit` - Number of results per page (default: varies by endpoint)
- `offset` - Number of results to skip (default: 0)

**Response Format:**
```json
{
  "data": [...],
  "total": 247,
  "limit": 20,
  "offset": 40,
  "hasMore": true
}
```

---

## Examples

### Complete Workflow Example

```javascript
// 1. Get all contributors
const contributors = await fetch('http://localhost:3000/api/contributors')
  .then(res => res.json());

// 2. Get detailed stats for a specific user
const userStats = await fetch('http://localhost:3000/api/contributors/johndoe/stats')
  .then(res => res.json());

// 3. Get active challenges
const challenges = await fetch('http://localhost:3000/api/challenges?status=active')
  .then(res => res.json());

// 4. Join a challenge
const joinResult = await fetch('http://localhost:3000/api/challenges/join', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'johndoe',
    challengeId: challenges.challenges[0]._id
  })
}).then(res => res.json());

// 5. Connect to WebSocket for real-time updates
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('challenge-progress', (data) => {
  console.log(`${data.username} is ${data.percentComplete}% complete`);
});

socket.on('challenge-completed', (data) => {
  console.log(`${data.username} completed ${data.challengeName}!`);
});
```

---

## Changelog

### Version 2.0.0 (2025-10-15)
- Added challenge endpoints
- Added streak endpoints
- Added WebSocket events
- Enhanced contributor endpoints with gamification data
- Added pagination support
- Added rate limiting

### Version 1.0.0 (Initial Release)
- Basic contributor tracking
- Badge awarding system
- Admin endpoints

---

## Support

For API questions or issues:
- GitHub Issues: [github.com/yourusername/github-pr-scoreboard/issues](https://github.com/yourusername/github-pr-scoreboard/issues)
- Email: your.email@example.com

---

**Last Updated:** October 2025
