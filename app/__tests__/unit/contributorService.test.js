import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  awardBadges,
  awardBillsAndVonettes,
  getTopContributors,
  getTopReviewers,
  initializeDatabase
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
      // Create a contributor with 1 PR but no badges
      await prisma.contributor.create({
        data: createTestContributor({ 
          username: 'newuser', 
          prCount: 1, 
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

  describe('awardBillsAndVonettes', () => {
    it('should award Bill for 10+ PRs', async () => {
      await prisma.contributor.create({
        data: createTestContributor({ 
          username: 'productive', 
          prCount: 10,
          reviewCount: 0,
          totalBillsAwarded: 0,
          first10PrsAwarded: false
        })
      });

      const result = await awardBillsAndVonettes();
      
      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('productive');
      expect(result[0].bills).toBe('Bill');
      expect(result[0].billsImage).toBe('1_bill_57X27.png');

      // Check that the contributor was updated in the database
      const updatedContributor = await prisma.contributor.findUnique({ 
        where: { username: 'productive' }
      });
      expect(Number(updatedContributor.totalBillsAwarded)).toBe(1);
      expect(updatedContributor.first10PrsAwarded).toBe(true);
    });

    it('should award Bill for 10+ reviews', async () => {
      await prisma.contributor.create({
        data: createTestContributor({ 
          username: 'reviewer', 
          prCount: 0,
          reviewCount: 10,
          totalBillsAwarded: 0,
          first10ReviewsAwarded: false
        })
      });

      const result = await awardBillsAndVonettes();
      
      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('reviewer');
      expect(result[0].bills).toBe('Bill');

      const updatedContributor = await prisma.contributor.findUnique({ 
        where: { username: 'reviewer' }
      });
      expect(updatedContributor.first10ReviewsAwarded).toBe(true);
    });

    it('should award Vonette for 500+ PRs', async () => {
      await prisma.contributor.create({
        data: createTestContributor({ 
          username: 'superstar', 
          prCount: 500,
          reviewCount: 0,
          totalBillsAwarded: 0,
          first500PrsAwarded: false
        })
      });

      const result = await awardBillsAndVonettes();
      
      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('superstar');
      expect(result[0].bills).toBe('Vonette');
      expect(result[0].billsImage).toBe('5_vonett_57_25.png');

      const updatedContributor = await prisma.contributor.findUnique({ 
        where: { username: 'superstar' }
      });
      expect(Number(updatedContributor.totalBillsAwarded)).toBe(5);
      expect(updatedContributor.first500PrsAwarded).toBe(true);
    });

    it('should award incremental Bills based on total contributions', async () => {
      await prisma.contributor.create({
        data: createTestContributor({ 
          username: 'consistent', 
          prCount: 150,
          reviewCount: 50,
          totalBillsAwarded: 1, // Already awarded 1 bill for first 10
          first10PrsAwarded: true
        })
      });

      const result = await awardBillsAndVonettes();
      
      expect(result).toHaveLength(1);
      expect(result[0].username).toBe('consistent');
      expect(result[0].bills).toBe('Bill');

      // Total contributions = 200, so should get 2 bills total (200/100)
      // Already had 1, so should get 1 more
      const updatedContributor = await prisma.contributor.findUnique({ 
        where: { username: 'consistent' }
      });
      expect(Number(updatedContributor.totalBillsAwarded)).toBe(2);
    });

    it('should not award bills to already-awarded contributors', async () => {
      await prisma.contributor.create({
        data: createTestContributor({ 
          username: 'maxed', 
          prCount: 10,
          reviewCount: 0,
          totalBillsAwarded: 1,
          first10PrsAwarded: true
        })
      });

      const result = await awardBillsAndVonettes();
      
      expect(result).toHaveLength(0);
    });

    it('should skip bot users when awarding bills', async () => {
      await prisma.contributor.create({
        data: createTestContributor({ 
          username: 'github-actions[bot]', 
          prCount: 20,
          reviewCount: 0,
          totalBillsAwarded: 0
        })
      });

      const result = await awardBillsAndVonettes();
      
      expect(result).toHaveLength(0);
    });
  });
});