// DevOps Team Service - GitHub Teams API Integration
// Manages automatic sync of DevOps team members from GitHub Teams API
// and filtering of leaderboards based on DevOps membership

import { Octokit } from '@octokit/rest';
import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger.js';

const prisma = new PrismaClient();
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

const GITHUB_ORG = process.env.GITHUB_ORG || process.env.REPO_OWNER;
const DEVOPS_TEAM_SLUG = process.env.DEVOPS_TEAM_SLUG || 'devops-engineering-team';
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetch all DevOps team members from GitHub Teams API
 * Handles pagination to get all members
 * @returns {Promise<string[]>} Array of GitHub usernames
 */
export async function fetchDevOpsTeamFromGitHub() {
  try {
    logger.info(`Fetching DevOps team members from GitHub org: ${GITHUB_ORG}, team: ${DEVOPS_TEAM_SLUG}`);

    const allMembers = [];
    let page = 1;
    const perPage = 100;

    while (true) {
      const { data: members } = await octokit.rest.teams.listMembersInOrg({
        org: GITHUB_ORG,
        team_slug: DEVOPS_TEAM_SLUG,
        per_page: perPage,
        page: page
      });

      if (members.length === 0) break;

      allMembers.push(...members.map(m => m.login));

      // If we got less than perPage, we've reached the end
      if (members.length < perPage) break;

      page++;
    }

    logger.info(`Fetched ${allMembers.length} DevOps team members from GitHub`);
    return allMembers;

  } catch (error) {
    if (error.status === 404) {
      logger.error(`GitHub team not found: ${GITHUB_ORG}/${DEVOPS_TEAM_SLUG}`);
      throw new Error(`GitHub team '${DEVOPS_TEAM_SLUG}' not found in organization '${GITHUB_ORG}'. Please verify the team exists and GITHUB_TOKEN has read:org permission.`);
    } else if (error.status === 403) {
      logger.error('GitHub API permission denied - token may lack read:org scope');
      throw new Error('GitHub API permission denied. Ensure GITHUB_TOKEN has read:org scope.');
    } else if (error.status === 401) {
      logger.error('GitHub API authentication failed - invalid token');
      throw new Error('GitHub API authentication failed. Check GITHUB_TOKEN is valid.');
    } else {
      logger.error('Failed to fetch DevOps team from GitHub:', error);
      throw error;
    }
  }
}

/**
 * Check if a specific user is in the DevOps team on GitHub
 * @param {string} username - GitHub username
 * @returns {Promise<boolean>} True if user is a team member
 */
export async function isUserInDevOpsTeam(username) {
  try {
    const { data: membership } = await octokit.rest.teams.getMembershipForUserInOrg({
      org: GITHUB_ORG,
      team_slug: DEVOPS_TEAM_SLUG,
      username: username
    });

    return membership.state === 'active';

  } catch (error) {
    if (error.status === 404) {
      // User is not in the team
      return false;
    }
    logger.error(`Error checking DevOps membership for ${username}:`, error);
    throw error;
  }
}

/**
 * Sync DevOps team members from GitHub to database
 * Updates QuarterSettings.devOpsTeamMembers and Contributor.isDevOps flags
 * @param {boolean} forceSync - Force sync even if recently synced
 * @returns {Promise<object>} Sync results with stats
 */
export async function syncDevOpsTeamFromGitHub(forceSync = false) {
  try {
    // Get current settings
    const settings = await prisma.quarterSettings.findUnique({
      where: { id: 'quarter-config' }
    });

    if (!settings) {
      throw new Error('Quarter settings not found. Database may not be initialized.');
    }

    // Check if sync is enabled
    if (!settings.devOpsTeamSyncEnabled && !forceSync) {
      logger.info('DevOps team sync is disabled. Skipping sync.');
      return {
        success: false,
        message: 'DevOps team sync is disabled',
        syncEnabled: false
      };
    }

    // Check if recently synced (within 1 hour) unless forced
    if (!forceSync && settings.devOpsTeamLastSync) {
      const timeSinceLastSync = Date.now() - settings.devOpsTeamLastSync.getTime();
      if (timeSinceLastSync < CACHE_DURATION_MS) {
        logger.info(`DevOps team synced ${Math.round(timeSinceLastSync / 1000 / 60)} minutes ago. Skipping sync.`);
        return {
          success: false,
          message: 'Recently synced (cached)',
          lastSync: settings.devOpsTeamLastSync,
          memberCount: settings.devOpsTeamMembers.length
        };
      }
    }

    // Fetch current team members from GitHub
    const githubMembers = await fetchDevOpsTeamFromGitHub();

    // Get previous team members from database
    const previousMembers = settings.devOpsTeamMembers || [];

    // Calculate changes
    const addedMembers = githubMembers.filter(m => !previousMembers.includes(m));
    const removedMembers = previousMembers.filter(m => !githubMembers.includes(m));

    logger.info(`DevOps team sync: ${addedMembers.length} added, ${removedMembers.length} removed`);

    // Update QuarterSettings with new team members
    await prisma.quarterSettings.update({
      where: { id: 'quarter-config' },
      data: {
        devOpsTeamMembers: githubMembers,
        devOpsTeamLastSync: new Date()
      }
    });

    // Update Contributor.isDevOps flags for ALL GitHub team members
    // This ensures all team members are marked, even on first sync
    if (githubMembers.length > 0) {
      await prisma.contributor.updateMany({
        where: {
          username: { in: githubMembers }
        },
        data: {
          isDevOps: true,
          devOpsTeamSyncedAt: new Date()
        }
      });
    }

    // Update Contributor.isDevOps flags for removed members
    if (removedMembers.length > 0) {
      await prisma.contributor.updateMany({
        where: {
          username: { in: removedMembers }
        },
        data: {
          isDevOps: false,
          devOpsTeamSyncedAt: new Date()
        }
      });
    }

    logger.info(`DevOps team sync completed. Total members: ${githubMembers.length}`);

    return {
      success: true,
      totalMembers: githubMembers.length,
      addedMembers: addedMembers,
      removedMembers: removedMembers,
      lastSync: new Date(),
      syncEnabled: settings.devOpsTeamSyncEnabled
    };

  } catch (error) {
    logger.error('DevOps team sync failed:', error);
    throw error;
  }
}

/**
 * Get current DevOps team settings and cached team members
 * @returns {Promise<object>} Settings object
 */
export async function getDevOpsTeamSettings() {
  try {
    const settings = await prisma.quarterSettings.findUnique({
      where: { id: 'quarter-config' },
      select: {
        devOpsTeamMembers: true,
        excludeDevOpsFromLeaderboards: true,
        devOpsTeamSlug: true,
        devOpsTeamLastSync: true,
        devOpsTeamSyncEnabled: true
      }
    });

    if (!settings) {
      // Return defaults if settings don't exist
      return {
        devOpsTeamMembers: [],
        excludeDevOpsFromLeaderboards: false,
        devOpsTeamSlug: DEVOPS_TEAM_SLUG,
        devOpsTeamLastSync: null,
        devOpsTeamSyncEnabled: true
      };
    }

    return settings;

  } catch (error) {
    logger.error('Failed to get DevOps team settings:', error);
    throw error;
  }
}

/**
 * Toggle DevOps leaderboard filter on/off
 * When enabled, DevOps team members are excluded from leaderboards
 * @param {boolean} exclude - True to exclude DevOps from leaderboards
 * @returns {Promise<object>} Updated settings
 */
export async function toggleDevOpsLeaderboardFilter(exclude) {
  try {
    logger.info(`${exclude ? 'Enabling' : 'Disabling'} DevOps leaderboard filter`);

    const settings = await prisma.quarterSettings.update({
      where: { id: 'quarter-config' },
      data: {
        excludeDevOpsFromLeaderboards: exclude,
        lastModified: new Date()
      }
    });

    return {
      success: true,
      excludeDevOpsFromLeaderboards: settings.excludeDevOpsFromLeaderboards
    };

  } catch (error) {
    logger.error('Failed to toggle DevOps leaderboard filter:', error);
    throw error;
  }
}

/**
 * Toggle DevOps team auto-sync on/off
 * @param {boolean} enabled - True to enable auto-sync
 * @returns {Promise<object>} Updated settings
 */
export async function toggleDevOpsTeamSync(enabled) {
  try {
    logger.info(`${enabled ? 'Enabling' : 'Disabling'} DevOps team auto-sync`);

    const settings = await prisma.quarterSettings.update({
      where: { id: 'quarter-config' },
      data: {
        devOpsTeamSyncEnabled: enabled,
        lastModified: new Date()
      }
    });

    return {
      success: true,
      devOpsTeamSyncEnabled: settings.devOpsTeamSyncEnabled
    };

  } catch (error) {
    logger.error('Failed to toggle DevOps team sync:', error);
    throw error;
  }
}

/**
 * Get count of contributors with/without DevOps filter
 * Useful for showing impact of filter toggle
 * @returns {Promise<object>} Contributor counts
 */
export async function getContributorCounts() {
  try {
    const totalCount = await prisma.contributor.count();
    const devOpsCount = await prisma.contributor.count({
      where: { isDevOps: true }
    });
    const nonDevOpsCount = totalCount - devOpsCount;

    return {
      total: totalCount,
      devOps: devOpsCount,
      nonDevOps: nonDevOpsCount
    };

  } catch (error) {
    logger.error('Failed to get contributor counts:', error);
    throw error;
  }
}

export default {
  fetchDevOpsTeamFromGitHub,
  isUserInDevOpsTeam,
  syncDevOpsTeamFromGitHub,
  getDevOpsTeamSettings,
  toggleDevOpsLeaderboardFilter,
  toggleDevOpsTeamSync,
  getContributorCounts
};
