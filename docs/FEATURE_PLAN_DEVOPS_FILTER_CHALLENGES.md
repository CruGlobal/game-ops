# Feature Implementation Plan: DevOps Filter & Challenge Initialization

**Branch:** `feature/devops-filter-and-challenge-init`
**Date:** November 14, 2025
**Status:** Planning

---

## Feature 1: DevOps Team Filter 🎯

### Overview
Add ability to filter DevOps team members from leaderboards to encourage non-DevOps participation while still tracking their contributions.

### User Stories
1. **As an admin**, I want to designate which users are DevOps team members
2. **As an admin**, I want to toggle whether DevOps members appear on leaderboards
3. **As a non-DevOps contributor**, I want to see my rank among peers (not including DevOps)
4. **As an admin**, I want leaderboards to recalculate when I change the filter

### Database Schema Changes

#### New Model: `LeaderboardSettings`
```prisma
model LeaderboardSettings {
  id                          String   @id @default("leaderboard-settings") // Singleton
  devOpsTeamMembers           Json     @default("[]") // Array of usernames
  excludeDevOpsFromLeaderboards Boolean @default(false)
  lastModified                DateTime @default(now()) @updatedAt
  modifiedBy                  String?  // Admin username who made change

  @@map("leaderboard_settings")
}
```

**Alternative:** Add fields to existing `QuarterSettings` table (simpler)
```prisma
model QuarterSettings {
  // ... existing fields ...
  devOpsTeamMembers           Json     @default("[]")
  excludeDevOpsFromLeaderboards Boolean @default(false)
}
```

#### Add to `Contributor` model
```prisma
model Contributor {
  // ... existing fields ...
  isDevOps    Boolean @default(false) @map("is_devops")
  // Denormalized for query performance
}
```

### Admin UI Design

#### Location
**Admin Page → New Section: "🎯 Team Management"**

```html
<div class="card">
  <h2>🎯 Team Management</h2>
  <p class="settings-description">
    Manage DevOps team members and leaderboard visibility settings.
  </p>

  <!-- DevOps Team Members List -->
  <div class="form-group">
    <label>DevOps Team Members</label>
    <div id="devops-members-list" class="members-list">
      <!-- Dynamic list of members with remove buttons -->
    </div>

    <!-- Add Member Input -->
    <div class="input-with-button">
      <input type="text" id="devops-username-input"
             placeholder="Enter GitHub username" />
      <button id="add-devops-member" class="btn btn-secondary">
        ➕ Add Member
      </button>
    </div>
  </div>

  <!-- Filter Toggle -->
  <div class="form-group">
    <label class="toggle-label">
      <input type="checkbox" id="exclude-devops-toggle" />
      <span>Exclude DevOps team from leaderboards</span>
    </label>
    <small class="form-hint">
      When enabled, DevOps team members won't appear on leaderboards
      but their contributions will still be tracked.
    </small>
  </div>

  <!-- Status Indicator -->
  <div id="devops-filter-status" class="info-box">
    <strong>Current Status:</strong>
    <span id="filter-status-text">DevOps team visible on leaderboards</span>
    <br>
    <strong>DevOps Members:</strong> <span id="devops-count">0</span>
  </div>

  <!-- Action Buttons -->
  <div class="action-buttons" style="margin-top: 1rem;">
    <button id="save-devops-settings" class="btn btn-primary">
      💾 Save Settings
    </button>
    <button id="recalculate-leaderboards" class="btn btn-warning">
      🔄 Recalculate Leaderboards
    </button>
  </div>
</div>
```

### API Endpoints

#### 1. Get DevOps Settings
```
GET /api/admin/devops-settings
Response: {
  devOpsTeamMembers: ['user1', 'user2', 'user3'],
  excludeDevOpsFromLeaderboards: true,
  lastModified: '2025-11-14T10:00:00Z',
  modifiedBy: 'admin_username'
}
```

#### 2. Update DevOps Team List
```
POST /api/admin/devops-settings/team
Body: {
  action: 'add' | 'remove',
  username: 'github_username'
}
Response: {
  success: true,
  devOpsTeamMembers: ['...'],
  message: 'User added to DevOps team'
}
```

#### 3. Toggle DevOps Filter
```
POST /api/admin/devops-settings/toggle
Body: {
  excludeDevOps: true
}
Response: {
  success: true,
  excludeDevOpsFromLeaderboards: true,
  message: 'DevOps filter enabled. Recalculate leaderboards to see changes.'
}
```

#### 4. Recalculate Leaderboards
```
POST /api/admin/devops-settings/recalculate
Response: {
  success: true,
  message: 'Leaderboards recalculated',
  affectedLeaderboards: ['all-time', 'current-quarter', 'hall-of-fame'],
  devOpsFiltered: 3,
  newLeaders: {
    allTime: { username: 'user1', totalPoints: 1000 },
    currentQuarter: { username: 'user2', quarterlyPoints: 500 }
  }
}
```

### Backend Implementation

#### Service: `leaderboardService.js` (new file)
```javascript
// Get DevOps filter settings
export async function getDevOpsSettings() {
  // Get from QuarterSettings or LeaderboardSettings
}

// Add/remove DevOps team member
export async function updateDevOpsTeam(action, username) {
  // Update settings
  // Update Contributor.isDevOps flag
  // Emit WebSocket event
}

// Toggle DevOps filter
export async function toggleDevOpsFilter(excludeDevOps) {
  // Update settings
  // Return recalculate recommendation
}

// Recalculate all leaderboards with filter
export async function recalculateLeaderboardsWithFilter() {
  // Recalculate all-time leaderboard
  // Recalculate current quarter
  // Recalculate Hall of Fame (if needed)
  // Return new leaders
}
```

#### Update Existing Services
Modify all leaderboard queries to respect DevOps filter:

**contributorService.js:**
```javascript
export async function getAllTimeLeaderboard(limit = 50) {
  const settings = await getDevOpsSettings();

  const where = {};
  if (settings.excludeDevOpsFromLeaderboards) {
    where.isDevOps = false;
  }

  return await prisma.contributor.findMany({
    where,
    orderBy: { totalPoints: 'desc' },
    take: limit,
    select: { username: true, totalPoints: true, avatarUrl: true }
  });
}
```

**quarterlyService.js:**
```javascript
// Similar filter for quarterly leaderboards
```

### Testing Plan

1. **Unit Tests:**
   - Add/remove DevOps team member
   - Toggle filter on/off
   - Leaderboard filtering logic

2. **Integration Tests:**
   - Recalculate leaderboards with filter
   - Verify DevOps members excluded correctly
   - Verify non-DevOps rankings adjust

3. **Manual Tests:**
   - Add DevOps members via admin UI
   - Toggle filter and verify leaderboards update
   - Check that DevOps stats still tracked (just not displayed)

---

## Feature 2: Challenge Initialization from Admin 🎯

### Overview
Allow admins to manually create challenges from the admin page instead of relying solely on weekly auto-generation.

### User Stories
1. **As an admin**, I want to create a custom challenge at any time
2. **As an admin**, I want to set challenge parameters (type, target, duration, reward)
3. **As an admin**, I want to see all active challenges
4. **As an admin**, I want to delete challenges that are no longer relevant

### Admin UI Design

#### Location
**Admin Page → New Section: "🎯 Challenge Management"**

```html
<div class="card">
  <h2>🎯 Challenge Management</h2>
  <p class="settings-description">
    Create and manage custom challenges for contributors.
  </p>

  <!-- Create Challenge Form -->
  <div class="challenge-create-form">
    <h3>Create New Challenge</h3>

    <div class="form-grid">
      <!-- Title -->
      <div class="form-group">
        <label for="challenge-title">Title *</label>
        <input type="text" id="challenge-title"
               placeholder="e.g., Merge 10 PRs This Week"
               class="form-control" required />
      </div>

      <!-- Description -->
      <div class="form-group full-width">
        <label for="challenge-description">Description *</label>
        <textarea id="challenge-description"
                  placeholder="Describe the challenge..."
                  class="form-control" rows="3" required></textarea>
      </div>

      <!-- Type -->
      <div class="form-group">
        <label for="challenge-type">Type *</label>
        <select id="challenge-type" class="form-control" required>
          <option value="">Select type...</option>
          <option value="pr-merge">PR Merge</option>
          <option value="review">Code Review</option>
          <option value="streak">Streak</option>
          <option value="points">Points</option>
        </select>
      </div>

      <!-- Target -->
      <div class="form-group">
        <label for="challenge-target">Target *</label>
        <input type="number" id="challenge-target"
               placeholder="e.g., 10"
               class="form-control" min="1" required />
        <small class="form-hint">Number to achieve</small>
      </div>

      <!-- Difficulty -->
      <div class="form-group">
        <label for="challenge-difficulty">Difficulty *</label>
        <select id="challenge-difficulty" class="form-control" required>
          <option value="">Select difficulty...</option>
          <option value="easy">Easy (100-150 pts)</option>
          <option value="medium">Medium (200-250 pts)</option>
          <option value="hard">Hard (300-500 pts)</option>
        </select>
      </div>

      <!-- Duration -->
      <div class="form-group">
        <label for="challenge-duration">Duration *</label>
        <select id="challenge-duration" class="form-control" required>
          <option value="">Select duration...</option>
          <option value="7">1 Week (7 days)</option>
          <option value="14">2 Weeks (14 days)</option>
          <option value="30">1 Month (30 days)</option>
          <option value="90">1 Quarter (90 days)</option>
        </select>
      </div>

      <!-- Reward (auto-calculated) -->
      <div class="form-group">
        <label for="challenge-reward">Reward Points</label>
        <input type="number" id="challenge-reward"
               placeholder="Auto-calculated"
               class="form-control" readonly />
        <small class="form-hint">Based on difficulty</small>
      </div>

      <!-- Category (optional) -->
      <div class="form-group">
        <label for="challenge-category">Category</label>
        <input type="text" id="challenge-category"
               placeholder="e.g., Team Goal"
               class="form-control" />
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="action-buttons" style="margin-top: 1rem;">
      <button id="create-challenge-btn" class="btn btn-primary">
        ➕ Create Challenge
      </button>
      <button id="reset-challenge-form" class="btn btn-secondary">
        🔄 Reset Form
      </button>
    </div>
  </div>

  <!-- Active Challenges List -->
  <div class="challenges-section" style="margin-top: 2rem;">
    <h3>Active Challenges</h3>
    <div id="active-challenges-list" class="challenges-grid">
      <!-- Dynamically populated -->
    </div>
  </div>
</div>
```

### API Endpoints

#### 1. Create Challenge
```
POST /api/admin/challenges/create
Body: {
  title: 'Merge 10 PRs This Week',
  description: 'Help the team by merging 10 pull requests',
  type: 'pr-merge',
  target: 10,
  difficulty: 'medium',
  durationDays: 7,
  reward: 200, // Optional - auto-calculated if not provided
  category: 'Team Goal'
}
Response: {
  success: true,
  challenge: { id, title, startDate, endDate, ... },
  message: 'Challenge created successfully'
}
```

#### 2. List All Challenges (Admin View)
```
GET /api/admin/challenges
Response: {
  success: true,
  active: [{ id, title, participants: 5, ... }],
  expired: [{ id, title, completedBy: 3, ... }],
  upcoming: []
}
```

#### 3. Delete Challenge
```
DELETE /api/admin/challenges/:id
Response: {
  success: true,
  message: 'Challenge deleted',
  participantsNotified: 5
}
```

#### 4. Auto-Calculate Reward
```
GET /api/admin/challenges/calculate-reward?difficulty=medium&type=pr-merge&target=10
Response: {
  success: true,
  recommendedReward: 200,
  calculation: {
    baseDifficulty: 200,
    typeMultiplier: 1.0,
    targetBonus: 0
  }
}
```

### Backend Implementation

#### Controller: `adminController.js` (extend)
```javascript
export async function createChallengeController(req, res) {
  try {
    const { title, description, type, target, difficulty, durationDays, reward, category } = req.body;

    // Validate inputs
    if (!title || !type || !target || !difficulty || !durationDays) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields'
      });
    }

    // Calculate dates
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + durationDays);

    // Calculate reward if not provided
    const finalReward = reward || calculateReward(difficulty, type, target);

    // Create challenge
    const challenge = await prisma.challenge.create({
      data: {
        title,
        description,
        type,
        target,
        difficulty,
        reward: finalReward,
        category: category || 'Custom',
        startDate,
        endDate,
        status: 'active',
        createdBy: req.user?.username || 'admin'
      }
    });

    // Emit WebSocket event
    emitEvent('challenge-created', challenge);

    res.json({
      success: true,
      challenge,
      message: 'Challenge created successfully'
    });
  } catch (error) {
    console.error('Error creating challenge:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create challenge'
    });
  }
}

function calculateReward(difficulty, type, target) {
  const baseRewards = {
    easy: 125,
    medium: 225,
    hard: 400
  };

  let reward = baseRewards[difficulty] || 200;

  // Adjust based on target (higher target = more reward)
  if (target > 20) reward += 50;
  if (target > 50) reward += 100;

  return reward;
}
```

### Testing Plan

1. **Unit Tests:**
   - Validate challenge creation parameters
   - Test reward calculation logic
   - Test date calculation

2. **Integration Tests:**
   - Create challenge via API
   - List challenges
   - Delete challenge
   - Verify WebSocket events

3. **Manual Tests:**
   - Create challenge via admin UI
   - Verify challenge appears on challenges page
   - Join challenge as user
   - Delete challenge and verify cleanup

---

## Implementation Priority

### Phase 1: DevOps Filter (Higher Priority)
1. Database schema changes (add fields to QuarterSettings)
2. Admin UI for managing DevOps team
3. Admin UI for toggle + recalculate button
4. Backend service for DevOps filtering
5. Update all leaderboard queries
6. Testing

### Phase 2: Challenge Initialization
1. Admin UI form for creating challenges
2. Backend API for manual challenge creation
3. Admin UI to list/delete challenges
4. Reward calculation logic
5. Testing

---

## Database Migration

### Prisma Schema Updates
```prisma
// Add to QuarterSettings model
model QuarterSettings {
  id                          String   @id @default("quarter-config")
  systemType                  String   @default("calendar")
  q1StartMonth                Int      @default(1)
  modifiedAt                  DateTime @default(now()) @updatedAt
  modifiedBy                  String?

  // NEW: DevOps filter settings
  devOpsTeamMembers           Json     @default("[]")
  excludeDevOpsFromLeaderboards Boolean @default(false)

  @@map("quarter_settings")
}

// Add to Contributor model
model Contributor {
  // ... existing fields ...

  // NEW: DevOps flag (denormalized for performance)
  isDevOps    Boolean @default(false) @map("is_devops")

  // ... rest of fields ...
}
```

### Migration Steps
```bash
# 1. Update schema
# Edit prisma/schema.prisma

# 2. Create migration
npx prisma migrate dev --name add_devops_filter_settings

# 3. Apply migration
npx prisma migrate deploy
```

---

## Success Metrics

### DevOps Filter
- ✅ Can add/remove DevOps team members from admin UI
- ✅ Toggle filter on/off from admin UI
- ✅ Leaderboards exclude DevOps when filter enabled
- ✅ Recalculate updates all leaderboards correctly
- ✅ DevOps stats still tracked (not lost)

### Challenge Initialization
- ✅ Can create custom challenge from admin UI
- ✅ Challenge appears on challenges page immediately
- ✅ Users can join manually-created challenges
- ✅ Reward calculation accurate
- ✅ Can delete challenges from admin UI

---

## Next Steps

1. ✅ Create feature branch
2. ⬜ Implement DevOps filter Phase 1
3. ⬜ Test DevOps filter
4. ⬜ Implement Challenge initialization Phase 2
5. ⬜ Test Challenge initialization
6. ⬜ Create PR for review
7. ⬜ Deploy to production

---

**Document Version:** 1.0
**Last Updated:** November 14, 2025
**Status:** Ready for implementation
