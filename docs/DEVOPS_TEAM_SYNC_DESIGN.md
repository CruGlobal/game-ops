# DevOps Team Dynamic Sync via GitHub Teams API

**Feature:** Automatically detect DevOps team members from GitHub Teams
**Team Name:** `devops-engineering-team`
**Method:** GitHub Teams API with caching

---

## Overview

Instead of manually maintaining a list of DevOps team members, we'll automatically fetch team membership from the GitHub Teams API and sync it to our database.

---

## GitHub Teams API Integration

### Required Environment Variables

Add to `.env`:
```bash
# Organization Configuration
GITHUB_ORG=your-organization-name
GITHUB_DEVOPS_TEAM_SLUG=devops-engineering-team

# Optional: Override team slug
DEVOPS_TEAM_SLUG=devops-engineering-team
```

### API Endpoints We'll Use

#### 1. List Team Members
```javascript
const { data: members } = await octokit.rest.teams.listMembersInOrg({
  org: process.env.GITHUB_ORG,
  team_slug: 'devops-engineering-team',
  per_page: 100
});

// Returns array of:
// [{ login: 'username1', ... }, { login: 'username2', ... }]
```

#### 2. Check Individual Membership
```javascript
const { data: membership } = await octokit.rest.teams.getMembershipForUserInOrg({
  org: process.env.GITHUB_ORG,
  team_slug: 'devops-engineering-team',
  username: 'github-username'
});

// Returns: { state: 'active', role: 'member' }
```

---

## Database Schema Changes

### Update QuarterSettings Model

```prisma
model QuarterSettings {
  id                          String   @id @default("quarter-config")
  systemType                  String   @default("calendar")
  q1StartMonth                Int      @default(1)
  modifiedAt                  DateTime @default(now()) @updatedAt
  modifiedBy                  String?

  // DevOps Filter Settings
  devOpsTeamMembers           Json     @default("[]")     // Cached from GitHub API
  excludeDevOpsFromLeaderboards Boolean @default(false)
  devOpsTeamSlug              String?  @default("devops-engineering-team")
  devOpsTeamLastSync          DateTime?  // When we last synced from GitHub
  devOpsTeamSyncEnabled       Boolean  @default(true)     // Auto-sync on/off

  @@map("quarter_settings")
}
```

### Update Contributor Model

```prisma
model Contributor {
  // ... existing fields ...

  isDevOps              Boolean  @default(false) @map("is_devops")
  devOpsTeamSyncedAt    DateTime? @map("devops_team_synced_at")  // When flag was set

  // ... rest of fields ...
}
```

---

## Service: `devOpsTeamService.js`

Create new service for GitHub Teams integration:

```javascript
import { Octokit } from '@octokit/rest';
import { prisma } from '../lib/prisma.js';

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

const GITHUB_ORG = process.env.GITHUB_ORG || process.env.REPO_OWNER;
const DEVOPS_TEAM_SLUG = process.env.DEVOPS_TEAM_SLUG || 'devops-engineering-team';

/**
 * Fetch DevOps team members from GitHub Teams API
 * @returns {Promise<string[]>} Array of GitHub usernames
 */
export async function fetchDevOpsTeamFromGitHub() {
  try {
    console.log(`Fetching DevOps team from GitHub: ${GITHUB_ORG}/${DEVOPS_TEAM_SLUG}`);

    const members = [];
    let page = 1;
    let hasMore = true;

    // Paginate through all team members
    while (hasMore) {
      const { data } = await octokit.rest.teams.listMembersInOrg({
        org: GITHUB_ORG,
        team_slug: DEVOPS_TEAM_SLUG,
        per_page: 100,
        page
      });

      members.push(...data.map(member => member.login));
      hasMore = data.length === 100;
      page++;
    }

    console.log(`✅ Found ${members.length} DevOps team members from GitHub`);
    return members;
  } catch (error) {
    console.error('❌ Error fetching DevOps team from GitHub:', error.message);
    if (error.status === 404) {
      console.error(`Team not found: ${GITHUB_ORG}/${DEVOPS_TEAM_SLUG}`);
      console.error('Check that:');
      console.error('  1. GITHUB_ORG is correct');
      console.error('  2. Team slug "devops-engineering-team" exists');
      console.error('  3. GitHub token has "read:org" permissions');
    }
    throw error;
  }
}

/**
 * Check if a specific user is in the DevOps team
 * @param {string} username - GitHub username
 * @returns {Promise<boolean>}
 */
export async function isUserInDevOpsTeam(username) {
  try {
    const { data } = await octokit.rest.teams.getMembershipForUserInOrg({
      org: GITHUB_ORG,
      team_slug: DEVOPS_TEAM_SLUG,
      username
    });

    return data.state === 'active';
  } catch (error) {
    if (error.status === 404) {
      // User not in team
      return false;
    }
    console.error(`Error checking team membership for ${username}:`, error.message);
    return false;
  }
}

/**
 * Sync DevOps team members from GitHub to database
 * @param {boolean} forceSync - Force sync even if recently synced
 * @returns {Promise<Object>} Sync results
 */
export async function syncDevOpsTeamFromGitHub(forceSync = false) {
  try {
    // Get current settings
    const settings = await prisma.quarterSettings.findUnique({
      where: { id: 'quarter-config' }
    });

    if (!settings) {
      throw new Error('Quarter settings not found. Run database migrations.');
    }

    // Check if sync is enabled
    if (!settings.devOpsTeamSyncEnabled && !forceSync) {
      console.log('DevOps team sync is disabled. Skipping.');
      return {
        success: false,
        message: 'Sync disabled',
        synced: false
      };
    }

    // Check if recently synced (within last hour, unless forced)
    if (!forceSync && settings.devOpsTeamLastSync) {
      const hoursSinceSync = (Date.now() - settings.devOpsTeamLastSync.getTime()) / (1000 * 60 * 60);
      if (hoursSinceSync < 1) {
        console.log(`DevOps team synced ${hoursSinceSync.toFixed(1)} hours ago. Skipping.`);
        return {
          success: true,
          message: 'Recently synced',
          synced: false,
          lastSync: settings.devOpsTeamLastSync
        };
      }
    }

    // Fetch from GitHub
    const githubMembers = await fetchDevOpsTeamFromGitHub();

    // Get current cached members
    const currentMembers = Array.isArray(settings.devOpsTeamMembers)
      ? settings.devOpsTeamMembers
      : [];

    // Calculate changes
    const added = githubMembers.filter(m => !currentMembers.includes(m));
    const removed = currentMembers.filter(m => !githubMembers.includes(m));

    // Update settings with new member list
    await prisma.quarterSettings.update({
      where: { id: 'quarter-config' },
      data: {
        devOpsTeamMembers: githubMembers,
        devOpsTeamLastSync: new Date()
      }
    });

    // Update Contributor.isDevOps flags
    const now = new Date();

    // Set isDevOps = true for GitHub team members
    if (githubMembers.length > 0) {
      await prisma.contributor.updateMany({
        where: {
          username: { in: githubMembers }
        },
        data: {
          isDevOps: true,
          devOpsTeamSyncedAt: now
        }
      });
    }

    // Set isDevOps = false for those removed from team
    if (removed.length > 0) {
      await prisma.contributor.updateMany({
        where: {
          username: { in: removed }
        },
        data: {
          isDevOps: false,
          devOpsTeamSyncedAt: now
        }
      });
    }

    console.log('✅ DevOps team sync complete:');
    console.log(`   Total members: ${githubMembers.length}`);
    console.log(`   Added: ${added.length}`);
    console.log(`   Removed: ${removed.length}`);

    return {
      success: true,
      message: 'Sync complete',
      synced: true,
      totalMembers: githubMembers.length,
      added: added.length,
      removed: removed.length,
      addedMembers: added,
      removedMembers: removed,
      lastSync: now
    };
  } catch (error) {
    console.error('❌ Error syncing DevOps team:', error);
    return {
      success: false,
      message: error.message,
      synced: false,
      error: error.message
    };
  }
}

/**
 * Get DevOps team settings and cached members
 * @returns {Promise<Object>}
 */
export async function getDevOpsTeamSettings() {
  const settings = await prisma.quarterSettings.findUnique({
    where: { id: 'quarter-config' }
  });

  if (!settings) {
    return {
      devOpsTeamMembers: [],
      excludeDevOpsFromLeaderboards: false,
      devOpsTeamSlug: DEVOPS_TEAM_SLUG,
      devOpsTeamLastSync: null,
      devOpsTeamSyncEnabled: true
    };
  }

  return {
    devOpsTeamMembers: Array.isArray(settings.devOpsTeamMembers) ? settings.devOpsTeamMembers : [],
    excludeDevOpsFromLeaderboards: settings.excludeDevOpsFromLeaderboards,
    devOpsTeamSlug: settings.devOpsTeamSlug || DEVOPS_TEAM_SLUG,
    devOpsTeamLastSync: settings.devOpsTeamLastSync,
    devOpsTeamSyncEnabled: settings.devOpsTeamSyncEnabled
  };
}

/**
 * Enable/disable DevOps leaderboard filter
 * @param {boolean} exclude - Whether to exclude DevOps from leaderboards
 * @returns {Promise<Object>}
 */
export async function toggleDevOpsLeaderboardFilter(exclude) {
  await prisma.quarterSettings.update({
    where: { id: 'quarter-config' },
    data: {
      excludeDevOpsFromLeaderboards: exclude
    }
  });

  return {
    success: true,
    excludeDevOpsFromLeaderboards: exclude,
    message: exclude
      ? 'DevOps team will be excluded from leaderboards'
      : 'DevOps team will be included in leaderboards'
  };
}

/**
 * Enable/disable automatic sync from GitHub
 * @param {boolean} enabled - Whether auto-sync is enabled
 * @returns {Promise<Object>}
 */
export async function toggleDevOpsTeamSync(enabled) {
  await prisma.quarterSettings.update({
    where: { id: 'quarter-config' },
    data: {
      devOpsTeamSyncEnabled: enabled
    }
  });

  return {
    success: true,
    devOpsTeamSyncEnabled: enabled,
    message: enabled ? 'Auto-sync enabled' : 'Auto-sync disabled'
  };
}
```

---

## Admin UI Design

### Updated Admin Page Section

```html
<div class="card">
  <h2>🎯 DevOps Team Management</h2>
  <p class="settings-description">
    Automatically sync DevOps team members from GitHub Teams API
    or manage manually.
  </p>

  <!-- GitHub Team Sync Settings -->
  <div class="form-group">
    <label>GitHub Team Configuration</label>
    <div class="config-display">
      <strong>Organization:</strong> <span id="github-org">Loading...</span><br>
      <strong>Team Slug:</strong> <span id="devops-team-slug">devops-engineering-team</span><br>
      <strong>Last Synced:</strong> <span id="last-sync-time">Never</span>
    </div>
  </div>

  <!-- Auto-Sync Toggle -->
  <div class="form-group">
    <label class="toggle-label">
      <input type="checkbox" id="enable-auto-sync" checked />
      <span>Enable automatic sync from GitHub Teams</span>
    </label>
    <small class="form-hint">
      When enabled, DevOps team members are automatically detected from
      the "devops-engineering-team" GitHub team.
    </small>
  </div>

  <!-- Sync Status -->
  <div id="sync-status" class="info-box">
    <strong>🔄 Current Status:</strong>
    <span id="sync-status-text">Auto-sync enabled</span><br>
    <strong>👥 DevOps Members:</strong> <span id="devops-count">0</span>
  </div>

  <!-- DevOps Team Members List (Read-only when auto-sync enabled) -->
  <div class="form-group">
    <label>DevOps Team Members (from GitHub)</label>
    <div id="devops-members-list" class="members-list readonly">
      <!-- Dynamically populated from GitHub API -->
    </div>
  </div>

  <!-- Action Buttons -->
  <div class="action-buttons" style="margin-top: 1rem; gap: 0.5rem;">
    <button id="sync-devops-now" class="btn btn-primary">
      🔄 Sync from GitHub Now
    </button>
    <button id="toggle-devops-filter" class="btn btn-secondary">
      <span id="filter-toggle-text">Enable Filter</span>
    </button>
    <button id="recalculate-leaderboards" class="btn btn-warning" style="display:none;">
      ♻️ Recalculate Leaderboards
    </button>
  </div>

  <!-- Leaderboard Filter Status -->
  <div id="filter-status" class="info-box" style="margin-top: 1rem; display:none;">
    <strong>🏆 Leaderboard Filter:</strong>
    <span id="filter-status-text">DevOps team visible on leaderboards</span><br>
    <small>Click "Recalculate Leaderboards" to update rankings.</small>
  </div>
</div>
```

---

## API Endpoints

### 1. Sync DevOps Team from GitHub
```
POST /api/admin/devops-team/sync
Body: {
  force: true  // Optional - force sync even if recently synced
}
Response: {
  success: true,
  synced: true,
  totalMembers: 12,
  added: 2,
  removed: 1,
  addedMembers: ['newuser1', 'newuser2'],
  removedMembers: ['olduser1'],
  lastSync: '2025-11-14T10:00:00Z'
}
```

### 2. Get DevOps Team Settings
```
GET /api/admin/devops-team/settings
Response: {
  success: true,
  devOpsTeamMembers: ['user1', 'user2', ...],
  excludeDevOpsFromLeaderboards: false,
  devOpsTeamSlug: 'devops-engineering-team',
  devOpsTeamLastSync: '2025-11-14T10:00:00Z',
  devOpsTeamSyncEnabled: true
}
```

### 3. Toggle Auto-Sync
```
POST /api/admin/devops-team/toggle-sync
Body: {
  enabled: true
}
Response: {
  success: true,
  devOpsTeamSyncEnabled: true,
  message: 'Auto-sync enabled'
}
```

### 4. Toggle Leaderboard Filter
```
POST /api/admin/devops-team/toggle-filter
Body: {
  excludeDevOps: true
}
Response: {
  success: true,
  excludeDevOpsFromLeaderboards: true,
  message: 'DevOps team will be excluded from leaderboards'
}
```

---

## Cron Job Integration

Add daily sync to existing cron jobs:

```javascript
// In scoreboard.js or cron setup file

import { syncDevOpsTeamFromGitHub } from './services/devOpsTeamService.js';

// Daily at 2 AM - Sync DevOps team from GitHub
cron.schedule('0 2 * * *', async () => {
  if (cronEnabled) {
    console.log('🔄 Running daily DevOps team sync...');
    try {
      const result = await syncDevOpsTeamFromGitHub(false);
      if (result.synced) {
        console.log(`✅ DevOps team sync complete: ${result.totalMembers} members`);
      }
    } catch (error) {
      console.error('❌ DevOps team sync failed:', error);
    }
  }
}, {
  scheduled: true,
  timezone: "UTC"
});
```

---

## GitHub Token Permissions

### Required Scopes

Your `GITHUB_TOKEN` must have the following permissions:

**For Organization:**
- ✅ `read:org` - Read organization membership and teams

**For Team Members:**
- ✅ `read:org` - Read team members

### How to Check/Update Permissions

1. Go to GitHub Settings → Developer Settings → Personal Access Tokens
2. Click on your token
3. Ensure "read:org" is checked
4. If not, regenerate token with correct permissions

---

## Error Handling

### Team Not Found
```javascript
if (error.status === 404) {
  console.error('Team "devops-engineering-team" not found');
  console.error('Possible reasons:');
  console.error('  1. Team slug is incorrect (check GitHub Teams page)');
  console.error('  2. Organization name is wrong');
  console.error('  3. Token lacks "read:org" permission');
  // Fall back to cached list
}
```

### Rate Limiting
```javascript
if (error.status === 403) {
  console.error('GitHub API rate limit exceeded');
  console.error('Using cached DevOps team list');
  // Use cached devOpsTeamMembers from database
}
```

### API Unavailable
```javascript
if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
  console.error('GitHub API unavailable');
  console.error('Using cached DevOps team list');
  // Use cached devOpsTeamMembers from database
}
```

---

## Benefits of Dynamic Sync

### ✅ Advantages
1. **No Manual Maintenance** - Team list updates automatically
2. **Always Current** - Reflects real-time GitHub team membership
3. **Single Source of Truth** - GitHub Teams is the authoritative source
4. **Cached for Performance** - Database caches team list to avoid rate limits
5. **Resilient** - Falls back to cached list if API fails

### 🔄 Sync Strategy
- **Automatic:** Daily sync at 2 AM UTC
- **Manual:** Admin can trigger sync anytime
- **Smart Caching:** Skips sync if done within last hour
- **Force Sync:** Admin can override cache with force flag

### 📊 Observability
- Last sync timestamp displayed in UI
- Added/removed members logged
- Sync status visible to admin
- WebSocket notification when sync completes

---

## Migration Steps

### 1. Update Environment Variables
```bash
# Add to .env
GITHUB_ORG=your-organization-name
DEVOPS_TEAM_SLUG=devops-engineering-team
```

### 2. Update Prisma Schema
```bash
# Edit prisma/schema.prisma (add fields to QuarterSettings and Contributor)
npx prisma migrate dev --name add_devops_team_sync
```

### 3. Initialize Settings
```bash
# Run once to create settings record if it doesn't exist
npx prisma studio
# Or via SQL:
INSERT INTO quarter_settings (id, devops_team_sync_enabled)
VALUES ('quarter-config', true)
ON CONFLICT (id) DO NOTHING;
```

### 4. Initial Sync
```bash
# Trigger first sync from admin UI or via API:
curl -X POST http://localhost:3000/api/admin/devops-team/sync \
  -H "Content-Type: application/json" \
  -d '{"force": true}'
```

---

## Testing Plan

### Manual Testing
1. ✅ Verify team members fetched from GitHub
2. ✅ Sync updates database correctly
3. ✅ Admin UI shows correct member count
4. ✅ Toggle filter excludes DevOps from leaderboards
5. ✅ Recalculate updates rankings correctly
6. ✅ Cron job runs daily sync

### Edge Cases
1. ✅ Team not found (404 error)
2. ✅ Token lacks permissions (403 error)
3. ✅ GitHub API down (connection error)
4. ✅ Member added to team (sync detects and updates)
5. ✅ Member removed from team (sync detects and updates)
6. ✅ Sync disabled (respects setting)

---

## Next Steps

1. ✅ Create `devOpsTeamService.js`
2. ⬜ Add Prisma migration for new fields
3. ⬜ Create admin UI for sync management
4. ⬜ Add API endpoints
5. ⬜ Add cron job for daily sync
6. ⬜ Test with real GitHub team
7. ⬜ Update leaderboard queries to use filter
8. ⬜ Document in README

---

**Status:** Ready to implement with GitHub Teams API integration
**Advantage:** Fully automated, no manual maintenance required
