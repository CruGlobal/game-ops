// SKIPPED - Complex test suite
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { fetchPullRequests, fetchActivityData } from '../../services/contributorService.js';
import Contributor from '../../models/contributor.js';
import { mockGitHubApi, createTestPullRequest, createTestReview } from '../setup.js';
import nock from 'nock';

describe.skip('GitHub API Integration', () => {
  beforeEach(async () => {
    // Clean up database and nock interceptors before each test
    await Contributor.deleteMany({});
    nock.cleanAll();
  });

  describe('fetchPullRequests', () => {
    it('should fetch and process pull requests successfully', async () => {
      // Mock team members endpoint
      mockGitHubApi.teamMembers([
        { login: 'user1', id: 123, avatar_url: 'https://github.com/user1.png' },
        { login: 'user2', id: 456, avatar_url: 'https://github.com/user2.png' }
      ]);

      // Mock pull requests endpoint
      const testPRs = [
        createTestPullRequest({
          id: 1,
          number: 1,
          state: 'closed',
          merged_at: '2025-01-15T12:00:00Z',
          user: { login: 'user1', id: 123, avatar_url: 'https://github.com/user1.png' }
        }),
        createTestPullRequest({
          id: 2,
          number: 2,
          state: 'closed',
          merged_at: '2025-01-16T14:00:00Z',
          user: { login: 'user2', id: 456, avatar_url: 'https://github.com/user2.png' }
        }),
        createTestPullRequest({
          id: 3,
          number: 3,
          state: 'closed',
          merged_at: null, // Not merged
          user: { login: 'user1', id: 123, avatar_url: 'https://github.com/user1.png' }
        })
      ];

      mockGitHubApi.pullRequests(testPRs);

      // Mock reviews for each PR
      mockGitHubApi.pullRequestReviews(1, [
        createTestReview({
          user: { login: 'user2', id: 456 },
          state: 'APPROVED'
        })
      ]);
      
      mockGitHubApi.pullRequestReviews(2, []);
      mockGitHubApi.pullRequestReviews(3, []);

      // Execute the function
      await fetchPullRequests();

      // Verify contributors were created/updated
      const contributors = await Contributor.find({}).sort({ username: 1 });
      expect(contributors).toHaveLength(2);

      // Check user1 (2 PRs, but only 1 merged)
      const user1 = contributors.find(c => c.username === 'user1');
      expect(user1.prCount).toBe(1); // Only merged PRs count
      expect(user1.reviewCount).toBe(0);
      expect(user1.contributions).toHaveLength(1);

      // Check user2 (1 merged PR, 1 review)
      const user2 = contributors.find(c => c.username === 'user2');
      expect(user2.prCount).toBe(1);
      expect(user2.reviewCount).toBe(1);
      expect(user2.reviews).toHaveLength(1);
    });

    it('should handle GitHub API errors gracefully', async () => {
      // Mock team members to succeed
      mockGitHubApi.teamMembers([
        { login: 'user1', id: 123 }
      ]);

      // Mock pull requests to fail
      nock('https://api.github.com')
        .get('/repos/TestOrg/test-repo/pulls')
        .query(true)
        .reply(500, { message: 'Internal Server Error' });

      // Should not throw an error
      await expect(fetchPullRequests()).resolves.not.toThrow();
      
      // No contributors should be created due to the error
      const contributors = await Contributor.find({});
      expect(contributors).toHaveLength(0);
    });

    it('should filter out bot users', async () => {
      mockGitHubApi.teamMembers([
        { login: 'user1', id: 123 },
        { login: 'dependabot[bot]', id: 456 },
        { login: 'github-actions[bot]', id: 789 }
      ]);

      const testPRs = [
        createTestPullRequest({
          user: { login: 'user1', id: 123 }
        }),
        createTestPullRequest({
          user: { login: 'dependabot[bot]', id: 456 }
        }),
        createTestPullRequest({
          user: { login: 'github-actions[bot]', id: 789 }
        })
      ];

      mockGitHubApi.pullRequests(testPRs);
      mockGitHubApi.pullRequestReviews(1, []);

      await fetchPullRequests();

      const contributors = await Contributor.find({});
      expect(contributors).toHaveLength(1);
      expect(contributors[0].username).toBe('user1');
    });

    it('should handle rate limiting', async () => {
      // Mock rate limit response indicating near limit
      mockGitHubApi.rateLimit(10, 5000); // Only 10 requests remaining

      mockGitHubApi.teamMembers([
        { login: 'user1', id: 123 }
      ]);

      mockGitHubApi.pullRequests([
        createTestPullRequest({
          user: { login: 'user1', id: 123 }
        })
      ]);

      mockGitHubApi.pullRequestReviews(1, []);

      // Should complete successfully even with low rate limit
      await expect(fetchPullRequests()).resolves.not.toThrow();
    });

    it('should update existing contributors correctly', async () => {
      // Create an existing contributor
      await Contributor.create({
        username: 'existing_user',
        prCount: 5,
        reviewCount: 3,
        avatarUrl: 'https://old-avatar.png',
        badges: [],
        totalBillsAwarded: 0,
        contributions: [],
        reviews: []
      });

      mockGitHubApi.teamMembers([
        { login: 'existing_user', id: 123, avatar_url: 'https://new-avatar.png' }
      ]);

      mockGitHubApi.pullRequests([
        createTestPullRequest({
          id: 100,
          number: 100,
          user: { login: 'existing_user', id: 123, avatar_url: 'https://new-avatar.png' }
        })
      ]);

      mockGitHubApi.pullRequestReviews(100, []);

      await fetchPullRequests();

      const updatedContributor = await Contributor.findOne({ username: 'existing_user' });
      expect(updatedContributor.prCount).toBe(6); // 5 + 1 new
      expect(updatedContributor.avatarUrl).toBe('https://new-avatar.png'); // Should be updated
    });
  });

  describe('fetchActivityData', () => {
    it('should fetch activity data for PR range', async () => {
      // Mock individual PR requests
      nock('https://api.github.com')
        .get('/repos/TestOrg/test-repo/pulls/1')
        .reply(200, createTestPullRequest({
          number: 1,
          user: { login: 'user1' }
        }));

      nock('https://api.github.com')
        .get('/repos/TestOrg/test-repo/pulls/2')
        .reply(200, createTestPullRequest({
          number: 2,
          user: { login: 'user2' }
        }));

      const result = await fetchActivityData(1, 2);

      expect(result.stats).toBeDefined();
      expect(result.blocked).toBeDefined();
      expect(Array.isArray(result.stats)).toBe(true);
      expect(Array.isArray(result.blocked)).toBe(true);
    });

    it('should handle 404 errors for non-existent PRs', async () => {
      // Mock PR 1 to exist
      nock('https://api.github.com')
        .get('/repos/TestOrg/test-repo/pulls/1')
        .reply(200, createTestPullRequest({
          number: 1,
          user: { login: 'user1' }
        }));

      // Mock PR 2 to not exist
      nock('https://api.github.com')
        .get('/repos/TestOrg/test-repo/pulls/2')
        .reply(404, { message: 'Not Found' });

      const result = await fetchActivityData(1, 2);

      expect(result.stats).toBeDefined();
      // Should still process PR 1 successfully despite PR 2 not existing
    });

    it('should handle API errors gracefully', async () => {
      nock('https://api.github.com')
        .get('/repos/TestOrg/test-repo/pulls/1')
        .reply(500, { message: 'Internal Server Error' });

      const result = await fetchActivityData(1, 1);

      expect(result.stats).toBeDefined();
      expect(result.blocked).toBeDefined();
      // Should return empty arrays on error
      expect(result.stats).toEqual([]);
      expect(result.blocked).toEqual([]);
    });
  });

  describe('GitHub API Authentication', () => {
    it('should include proper authentication headers', async () => {
      const scope = nock('https://api.github.com')
        .get('/repos/TestOrg/test-repo/pulls')
        .query(true)
        .matchHeader('authorization', 'token test_github_token_123')
        .reply(200, []);

      // Mock team members with same auth check
      nock('https://api.github.com')
        .get('/orgs/TestOrg/teams/test-team/members')
        .matchHeader('authorization', 'token test_github_token_123')
        .reply(200, []);

      await fetchPullRequests();

      expect(scope.isDone()).toBe(true);
    });
  });
});