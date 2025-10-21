import { beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { execSync } from 'child_process';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import nock from 'nock';
import { createRequire } from 'module';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load test environment variables
dotenv.config({ path: '.env.test' });

let prisma;

// Global test setup
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.GITHUB_TOKEN = 'test_github_token_123';
  process.env.REPO_OWNER = 'TestOrg';
  process.env.REPO_NAME = 'test-repo';
  process.env.ADMIN_USERNAME = 'testadmin';
  process.env.ADMIN_PASSWORD = 'testpassword';
  process.env.JWT_SECRET = 'test_jwt_secret';
  process.env.GITHUB_CLIENT_ID = 'test_client_id';
  process.env.GITHUB_CLIENT_SECRET = 'test_client_secret';
  process.env.GITHUB_ORG = 'TestOrg';
  process.env.GITHUB_TEAM_SLUG = 'test-team';
  process.env.SESSION_SECRET = 'test_session_secret';
  process.env.DOMAIN = 'https://test.example.com';

  // Import Prisma after env vars are set
  const { prisma: prismaInstance } = await import('../lib/prisma.js');
  prisma = prismaInstance;
});

// Global test teardown
afterAll(async () => {
  // Disconnect Prisma
  if (prisma) {
    await prisma.$disconnect();
  }
  
  // Clean up nock
  nock.cleanAll();
  nock.restore();
});

// Clean up between tests
beforeEach(() => {
  // Clean up any remaining nock interceptors
  nock.cleanAll();
});

afterEach(async () => {
  // Clean up all tables between tests in reverse dependency order
  if (prisma) {
    try {
      await prisma.challengeParticipant.deleteMany({});
      await prisma.completedChallenge.deleteMany({});
      await prisma.challenge.deleteMany({});
      await prisma.processedReview.deleteMany({});
      await prisma.processedPR.deleteMany({});
      await prisma.pointHistory.deleteMany({});
      await prisma.achievement.deleteMany({});
      await prisma.review.deleteMany({});
      await prisma.contribution.deleteMany({});
      await prisma.quarterlyWinner.deleteMany({});
      await prisma.quarterSettings.deleteMany({});
      await prisma.contributor.deleteMany({});
    } catch (error) {
      console.error('Error cleaning up test data:', error);
    }
  }
  
  // Clean up nock interceptors
  nock.cleanAll();
});

// Export prisma instance for tests
export { prisma };

// Helper function to create GitHub API mocks
export const mockGitHubApi = {
  // Mock rate limit endpoint
  rateLimit: (remaining = 5000, limit = 5000) => {
    return nock('https://api.github.com')
      .get('/rate_limit')
      .reply(200, {
        resources: {
          core: {
            limit,
            used: limit - remaining,
            remaining,
            reset: Date.now() + 3600
          }
        },
        rate: {
          limit,
          used: limit - remaining,
          remaining,
          reset: Date.now() + 3600
        }
      });
  },
  
  // Mock pull requests endpoint
  pullRequests: (pulls = []) => {
    return nock('https://api.github.com')
      .get('/repos/TestOrg/test-repo/pulls')
      .query(true) // Accept any query parameters
      .reply(200, pulls);
  },
  
  // Mock specific pull request endpoint
  pullRequest: (number, prData) => {
    return nock('https://api.github.com')
      .get(`/repos/TestOrg/test-repo/pulls/${number}`)
      .reply(200, prData);
  },
  
  // Mock pull request reviews endpoint
  pullRequestReviews: (number, reviews = []) => {
    return nock('https://api.github.com')
      .get(`/repos/TestOrg/test-repo/pulls/${number}/reviews`)
      .reply(200, reviews);
  },
  
  // Mock team members endpoint
  teamMembers: (members = []) => {
    return nock('https://api.github.com')
      .get('/orgs/TestOrg/teams/test-team/members')
      .reply(200, members);
  }
};

// Helper function to create test contributors (returns data suitable for Prisma)
export const createTestContributor = (overrides = {}) => {
  const baseContributor = {
    username: 'testuser',
    prCount: BigInt(5),
    reviewCount: BigInt(3),
    avatarUrl: 'https://github.com/testuser.png',
    badges: [], // JSON array for PostgreSQL
    totalBillsAwarded: BigInt(0),
    totalPoints: BigInt(0),
    currentStreak: BigInt(0),
    longestStreak: BigInt(0),
    firstPrAwarded: false,
    firstReviewAwarded: false,
    first10PrsAwarded: false,
    first10ReviewsAwarded: false,
    first50PrsAwarded: false,
    first50ReviewsAwarded: false,
    first100PrsAwarded: false,
    first100ReviewsAwarded: false,
    first500PrsAwarded: false,
    first500ReviewsAwarded: false,
    first1000PrsAwarded: false,
    first1000ReviewsAwarded: false,
    sevenDayBadge: false,
    thirtyDayBadge: false,
    ninetyDayBadge: false,
    yearLongBadge: false,
    ...overrides
  };

  // Convert numeric fields to BigInt if they aren't already
  if (typeof baseContributor.prCount === 'number') {
    baseContributor.prCount = BigInt(baseContributor.prCount);
  }
  if (typeof baseContributor.reviewCount === 'number') {
    baseContributor.reviewCount = BigInt(baseContributor.reviewCount);
  }
  if (typeof baseContributor.totalBillsAwarded === 'number') {
    baseContributor.totalBillsAwarded = BigInt(baseContributor.totalBillsAwarded);
  }
  if (typeof baseContributor.totalPoints === 'number') {
    baseContributor.totalPoints = BigInt(baseContributor.totalPoints);
  }
  if (typeof baseContributor.currentStreak === 'number') {
    baseContributor.currentStreak = BigInt(baseContributor.currentStreak);
  }
  if (typeof baseContributor.longestStreak === 'number') {
    baseContributor.longestStreak = BigInt(baseContributor.longestStreak);
  }

  // Auto-set boolean flags based on badges array
  if (baseContributor.badges && Array.isArray(baseContributor.badges) && baseContributor.badges.length > 0) {
    baseContributor.badges.forEach(badgeObj => {
      const badge = badgeObj.badge || badgeObj;
      if (badge === '1st PR badge') baseContributor.firstPrAwarded = true;
      if (badge === '1st Review badge') baseContributor.firstReviewAwarded = true;
      if (badge === '10 PR badge') baseContributor.first10PrsAwarded = true;
      if (badge === '10 Reviews badge') baseContributor.first10ReviewsAwarded = true;
      if (badge === '50 PR badge') baseContributor.first50PrsAwarded = true;
      if (badge === '50 Reviews badge') baseContributor.first50ReviewsAwarded = true;
      if (badge === '100 PR badge') baseContributor.first100PrsAwarded = true;
      if (badge === '100 Reviews badge') baseContributor.first100ReviewsAwarded = true;
      if (badge === '500 PR badge') baseContributor.first500PrsAwarded = true;
      if (badge === '500 Reviews badge') baseContributor.first500ReviewsAwarded = true;
      if (badge === '1000 PR badge') baseContributor.first1000PrsAwarded = true;
      if (badge === '1000 Reviews badge') baseContributor.first1000ReviewsAwarded = true;
    });
  }

  // Handle contributions - create nested Contribution records if provided
  if (overrides.contributions && Array.isArray(overrides.contributions)) {
    baseContributor.contributions = {
      create: overrides.contributions.map(contrib => ({
        date: contrib.date instanceof Date ? contrib.date : new Date(contrib.date),
        count: contrib.count || 0,
        merged: contrib.merged || false
      }))
    };
    delete overrides.contributions; // Remove from overrides since we've handled it
  }

  // Handle reviews - create nested Review records if provided
  if (overrides.reviews && Array.isArray(overrides.reviews)) {
    baseContributor.reviews = {
      create: overrides.reviews.map(review => ({
        date: review.date instanceof Date ? review.date : new Date(review.date),
        count: review.count || 0
      }))
    };
    delete overrides.reviews; // Remove from overrides since we've handled it
  }

  return baseContributor;
};

// Helper function to create test PR data
export const createTestPullRequest = (overrides = {}) => {
  return {
    id: 123,
    number: 1,
    title: 'Test PR',
    state: 'closed',
    merged_at: '2025-01-01T12:00:00Z',
    created_at: '2025-01-01T10:00:00Z',
    updated_at: '2025-01-01T12:00:00Z',
    user: {
      login: 'testuser',
      id: 123,
      avatar_url: 'https://github.com/testuser.png'
    },
    base: {
      ref: 'main'
    },
    head: {
      ref: 'feature-branch'
    },
    ...overrides
  };
};

// Helper function to create test review data
export const createTestReview = (overrides = {}) => {
  return {
    id: 456,
    user: {
      login: 'reviewer',
      id: 456,
      avatar_url: 'https://github.com/reviewer.png'
    },
    state: 'APPROVED',
    submitted_at: '2025-01-01T11:30:00Z',
    ...overrides
  };
};