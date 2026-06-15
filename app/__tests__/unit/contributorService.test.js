import { describe, it, expect, beforeEach, afterEach, afterAll, jest } from '@jest/globals';
import {
  awardBadges,
  getTopContributors,
  getTopReviewers,
  initializeDatabase,
  processSingleReview
} from '../../services/contributorService.js';
import { prisma, createTestContributor, mockGitHubApi } from '../setup.js';

// Note: GitHub API mocking is handled via nock or other HTTP mocking libraries
// The service will use real Octokit but with mocked HTTP responses

describe('ContributorService', () => {
  beforeEach(async () => {
    // Clean up database before each test
    await prisma.contributor.deleteMany({});
  });

  afterEach(async () => {
    // Also cleanup after each test to prevent data leaks
    await prisma.contributor.deleteMany({});
  });

  describe('initializeDatabase', () => {
    it('should initialize database successfully', async () => {
      const result = await initializeDatabase();
      expect(result).toBe('Database initialized successfully.');
    });
  });

  describe('getTopContributors', () => {
    it('should return top contributors sorted by PR count', async () => {
      // Create test contributors
      await prisma.contributor.createMany({
        data: [
          createTestContributor({ username: 'user1', prCount: 10 }),
          createTestContributor({ username: 'user2', prCount: 15 }),
          createTestContributor({ username: 'user3', prCount: 5 })
        ]
      });

      const result = await getTopContributors();
      
      expect(result).toHaveLength(3);
      expect(result[0].username).toBe('user2');
      expect(Number(result[0].prCount)).toBe(15);
      expect(result[1].username).toBe('user1');
      expect(Number(result[1].prCount)).toBe(10);
    });

    it('should exclude bot users from results', async () => {
      await prisma.contributor.createMany({
        data: [
          createTestContributor({ username: 'user1', prCount: 10 }),
          createTestContributor({ username: 'dependabot[bot]', prCount: 15 }),
          createTestContributor({ username: 'github-actions[bot]', prCount: 8 })
        ]
      });

      const result = await getTopContributors();
      
      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('user1');
    });
  });

  describe('getTopReviewers', () => {
    it('should return top reviewers sorted by review count', async () => {
      await prisma.contributor.createMany({
        data: [
          createTestContributor({ username: 'reviewer1', reviewCount: 20 }),
          createTestContributor({ username: 'reviewer2', reviewCount: 30 }),
          createTestContributor({ username: 'reviewer3', reviewCount: 10 })
        ]
      });

      const result = await getTopReviewers();
      
      expect(result).toHaveLength(3);
      expect(result[0].username).toBe('reviewer2');
      expect(Number(result[0].reviewCount)).toBe(30);
      expect(result[1].username).toBe('reviewer1');
      expect(Number(result[1].reviewCount)).toBe(20);
    });
  });

  describe('awardBadges', () => {
    it('should award 1st PR badge to new contributors', async () => {
      // Create a contributor with 1 PR but no badges (reviewCount: 0 to isolate PR badge)
      await prisma.contributor.create({
        data: createTestContributor({
          username: 'newuser',
          prCount: 1,
          reviewCount: 0,
          badges: []
        })
      });

      const result = await awardBadges();

      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('newuser');
      expect(result[0].badge).toBe('1st PR badge');
      expect(result[0].badgeImage).toBe('1st_pr_badge.png');
    });

    it('should award 10 PR badge to contributors with 10+ PRs', async () => {
      await prisma.contributor.create({
        data: createTestContributor({ 
          username: 'experienced', 
          prCount: 10,
          reviewCount: 0,
          badges: [{ badge: '1st PR badge', date: new Date() }],
          firstPrAwarded: true
        })
      });

      const result = await awardBadges();
      
      const tenPrBadge = result.find(r => r.badge === '10 PR badge');
      expect(tenPrBadge).toBeDefined();
      expect(tenPrBadge.username).toBe('experienced');
    });

    it('should award review badges to reviewers', async () => {
      await prisma.contributor.create({
        data: createTestContributor({ 
          username: 'reviewer', 
          prCount: 0,
          reviewCount: 1, 
          badges: [] 
        })
      });

      const result = await awardBadges();
      
      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('reviewer');
      expect(result[0].badge).toBe('1st Review badge');
      expect(result[0].badgeImage).toBe('1st_review_badge.png');
    });

    it('should not award duplicate badges', async () => {
      await prisma.contributor.create({
        data: createTestContributor({ 
          username: 'existing', 
          prCount: 1, 
          badges: [{ badge: '1st PR badge', date: new Date() }] 
        })
      });

      const result = await awardBadges();
      
      // Should not award 1st PR badge again
      const firstPrBadge = result.find(r => r.badge === '1st PR badge');
      expect(firstPrBadge).toBeUndefined();
    });

    it('should skip bot users when awarding badges', async () => {
      await prisma.contributor.create({
        data: createTestContributor({ 
          username: 'dependabot[bot]', 
          prCount: 5, 
          badges: [] 
        })
      });

      const result = await awardBadges();
      
      expect(result).toHaveLength(0);
    });
  });


  describe('processSingleReview guards', () => {
    // These guards return before any DB/GitHub call, so no mocking is needed.
    const base = {
      reviewId: 1,
      submittedAt: '2026-06-13T18:26:45Z',
      prNumber: 999,
      prAuthor: 'some-author'
    };

    it('skips proxy-bot reviews (TerraBloks auto-approval as cru-devops)', async () => {
      const result = await processSingleReview({ ...base, username: 'cru-devops', state: 'APPROVED' });
      expect(result).toEqual({ processed: false, reason: 'proxy_bot_review' });
    });

    it('skips non-crediting review states (COMMENTED/DISMISSED/PENDING, any case)', async () => {
      for (const state of ['COMMENTED', 'DISMISSED', 'PENDING', 'commented', 'dismissed']) {
        const result = await processSingleReview({ ...base, username: 'human-reviewer', state });
        expect(result).toEqual({ processed: false, reason: 'non_crediting_state' });
      }
    });
  });

  afterAll(async () => {
    // Disconnect Prisma to allow Jest to exit
    await prisma.$disconnect();
  });
});