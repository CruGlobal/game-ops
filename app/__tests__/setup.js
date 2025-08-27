import { beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import nock from 'nock';

// Load test environment variables
dotenv.config({ path: '.env.test' });

let mongoServer;

// Global test setup
beforeAll(async () => {
  // Start in-memory MongoDB instance
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  // Connect to the in-memory database
  await mongoose.connect(mongoUri);
  
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.MONGO_URI = mongoUri;
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
});

// Global test teardown
afterAll(async () => {
  // Close database connection
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  
  // Stop the in-memory MongoDB instance
  await mongoServer.stop();
  
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
  // Clean up collections between tests
  const collections = mongoose.connection.collections;
  
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
  
  // Clean up nock interceptors
  nock.cleanAll();
});

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

// Helper function to create test contributors
export const createTestContributor = (overrides = {}) => {
  return {
    username: 'testuser',
    prCount: 5,
    reviewCount: 3,
    avatarUrl: 'https://github.com/testuser.png',
    badges: [],
    totalBillsAwarded: 0,
    first10PrsAwarded: false,
    first10ReviewsAwarded: false,
    first500PrsAwarded: false,
    first500ReviewsAwarded: false,
    contributions: [],
    reviews: [],
    ...overrides
  };
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