import { describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { awardBadges, awardBillsAndVonettes } from '../../services/contributorService.js';
import { prisma } from '../../lib/prisma.js';
import { createTestContributor } from '../setup.js';

describe('Badge and Bill Awarding Logic', () => {
  beforeEach(async () => {
    await prisma.processedPR.deleteMany({});
    await prisma.processedReview.deleteMany({});
    await prisma.contributor.deleteMany({});
  });

  afterEach(async () => {
    await prisma.processedPR.deleteMany({});
    await prisma.processedReview.deleteMany({});
    await prisma.contributor.deleteMany({});
  });

  afterAll(async () => {
    // Disconnect Prisma to allow Jest to exit
    await prisma.$disconnect();
  });

  describe('Badge Awarding Logic', () => {
    describe('PR Badges', () => {
      it('should award 1st PR badge for first contribution', async () => {
        await prisma.contributor.create({
          data: createTestContributor({ 
            username: 'newcomer', 
            prCount: BigInt(1), 
            badges: [] 
          })
        });

        const results = await awardBadges();
        
        expect(results).toHaveLength(1);
        expect(results[0]).toEqual({
          username: 'newcomer',
          badge: '1st PR badge',
          badgeImage: '1st_pr_badge.png'
        });
      });

      it('should award milestone PR badges at correct thresholds', async () => {
        const testCases = [
          {
            prCount: 10,
            expectedBadge: '10 PR badge',
            expectedImage: '10_prs_badge.png',
            badges: [{ badge: '1st PR badge', date: new Date() }]
          },
          {
            prCount: 50,
            expectedBadge: '50 PR badge',
            expectedImage: '50_prs_badge.png',
            badges: [
              { badge: '1st PR badge', date: new Date() },
              { badge: '10 PR badge', date: new Date() }
            ]
          },
          {
            prCount: 100,
            expectedBadge: '100 PR badge',
            expectedImage: '100_prs_badge.png',
            badges: [
              { badge: '1st PR badge', date: new Date() },
              { badge: '10 PR badge', date: new Date() },
              { badge: '50 PR badge', date: new Date() }
            ]
          },
          {
            prCount: 500,
            expectedBadge: '500 PR badge',
            expectedImage: '500_prs_badge.png',
            badges: [
              { badge: '1st PR badge', date: new Date() },
              { badge: '10 PR badge', date: new Date() },
              { badge: '50 PR badge', date: new Date() },
              { badge: '100 PR badge', date: new Date() }
            ]
          },
          {
            prCount: 1000,
            expectedBadge: '1000 PR badge',
            expectedImage: '1000_prs_badge.png',
            badges: [
              { badge: '1st PR badge', date: new Date() },
              { badge: '10 PR badge', date: new Date() },
              { badge: '50 PR badge', date: new Date() },
              { badge: '100 PR badge', date: new Date() },
              { badge: '500 PR badge', date: new Date() }
            ]
          }
        ];

        for (const testCase of testCases) {
          await prisma.processedPR.deleteMany({});
          await prisma.processedReview.deleteMany({});
          await prisma.contributor.deleteMany({});

          await prisma.contributor.create({
            data: createTestContributor({
              username: `user_${testCase.prCount}`,
              prCount: BigInt(testCase.prCount),
              reviewCount: BigInt(0), // Set to 0 to avoid awarding review badges
              badges: testCase.badges // Has all prerequisite badges
            })
          });

          const results = await awardBadges();

          const milestoneResult = results.find(r => r.badge === testCase.expectedBadge);
          expect(milestoneResult).toBeDefined();
          expect(milestoneResult.badgeImage).toBe(testCase.expectedImage);
        }
      });

      it('should not award higher tier badges without prerequisite badges', async () => {
        await prisma.contributor.create({
          data: createTestContributor({ 
            username: 'jumper', 
            prCount: BigInt(100), 
            badges: [] // No prerequisite badges
          })
        });

        const results = await awardBadges();
        
        // Should only get 1st PR badge
        expect(results).toHaveLength(1);
        expect(results[0].badge).toBe('1st PR badge');
      });
    });

    describe('Review Badges', () => {
      it('should award review badges at correct thresholds', async () => {
        const testCases = [
          {
            reviewCount: 1,
            expectedBadge: '1st Review badge',
            expectedImage: '1st_review_badge.png',
            badges: []
          },
          {
            reviewCount: 10,
            expectedBadge: '10 Reviews badge',
            expectedImage: '10_reviews_badge.png',
            badges: [{ badge: '1st Review badge', date: new Date() }]
          },
          {
            reviewCount: 50,
            expectedBadge: '50 Reviews badge',
            expectedImage: '50_reviews_badge.png',
            badges: [
              { badge: '1st Review badge', date: new Date() },
              { badge: '10 Reviews badge', date: new Date() }
            ]
          },
          {
            reviewCount: 100,
            expectedBadge: '100 Reviews badge',
            expectedImage: '100_reviews_badge.png',
            badges: [
              { badge: '1st Review badge', date: new Date() },
              { badge: '10 Reviews badge', date: new Date() },
              { badge: '50 Reviews badge', date: new Date() }
            ]
          },
          {
            reviewCount: 500,
            expectedBadge: '500 Reviews badge',
            expectedImage: '500_reviews_badge.png',
            badges: [
              { badge: '1st Review badge', date: new Date() },
              { badge: '10 Reviews badge', date: new Date() },
              { badge: '50 Reviews badge', date: new Date() },
              { badge: '100 Reviews badge', date: new Date() }
            ]
          },
          {
            reviewCount: 1000,
            expectedBadge: '1000 Reviews badge',
            expectedImage: '1000_reviews_badge.png',
            badges: [
              { badge: '1st Review badge', date: new Date() },
              { badge: '10 Reviews badge', date: new Date() },
              { badge: '50 Reviews badge', date: new Date() },
              { badge: '100 Reviews badge', date: new Date() },
              { badge: '500 Reviews badge', date: new Date() }
            ]
          }
        ];

        for (const testCase of testCases) {
          await prisma.processedPR.deleteMany({});
          await prisma.processedReview.deleteMany({});
          await prisma.contributor.deleteMany({});

          await prisma.contributor.create({
            data: createTestContributor({
              username: `reviewer_${testCase.reviewCount}`,
              prCount: BigInt(0),
              reviewCount: BigInt(testCase.reviewCount),
              badges: testCase.badges
            })
          });

          const results = await awardBadges();

          const reviewResult = results.find(r => r.badge === testCase.expectedBadge);
          expect(reviewResult).toBeDefined();
          expect(reviewResult.badgeImage).toBe(testCase.expectedImage);
        }
      });

      it('should award both PR and review badges to active contributors', async () => {
        await prisma.contributor.create({
          data: createTestContributor({
            username: 'active_contributor',
            prCount: BigInt(1),
            reviewCount: BigInt(1),
            badges: []
          })
        });

        // First call awards 1st PR badge
        const results1 = await awardBadges();
        expect(results1).toHaveLength(1);
        expect(results1[0].badge).toBe('1st PR badge');

        // Second call awards 1st Review badge
        const results2 = await awardBadges();
        expect(results2).toHaveLength(1);
        expect(results2[0].badge).toBe('1st Review badge');
      });
    });

    describe('Badge Persistence', () => {
      it('should save awarded badges to the database', async () => {
        await prisma.contributor.create({
          data: createTestContributor({
            username: 'persistent_user',
            prCount: BigInt(10),
            reviewCount: BigInt(0),
            badges: []
          })
        });

        // First call awards 1st PR badge
        await awardBadges();

        let updatedContributor = await prisma.contributor.findUnique({ where: { username: 'persistent_user' } });
        expect(updatedContributor.badges).toHaveLength(1);
        expect(updatedContributor.badges[0].badge).toBe('1st PR badge');
        expect(updatedContributor.badges[0].date).toBeDefined();

        // Second call awards 10 PR badge
        await awardBadges();

        updatedContributor = await prisma.contributor.findUnique({ where: { username: 'persistent_user' } });
        expect(updatedContributor.badges).toHaveLength(2);
        expect(updatedContributor.badges[1].badge).toBe('10 PR badge');
        expect(updatedContributor.badges[1].date).toBeDefined();
      });
    });
  });

  describe('Bill and Vonette Awarding Logic', () => {
    describe('Initial Milestone Awards', () => {
      it('should award Bill for reaching 10 PRs', async () => {
        await prisma.contributor.create({
          data: createTestContributor({ 
            username: 'ten_pr_user', 
            prCount: BigInt(10),
            reviewCount: BigInt(0),
            totalBillsAwarded: BigInt(0),
            first10PrsAwarded: false
          })
        });

        const results = await awardBillsAndVonettes();
        
        expect(results).toHaveLength(1);
        expect(results[0]).toEqual({
          username: 'ten_pr_user',
          bills: 'Bill',
          billsImage: '1_bill_57X27.png'
        });

        const updatedUser = await prisma.contributor.findUnique({ where: { username: 'ten_pr_user' } });
        expect(Number(updatedUser.totalBillsAwarded)).toBe(1);
        expect(updatedUser.first10PrsAwarded).toBe(true);
      });

      it('should award Bill for reaching 10 reviews', async () => {
        await prisma.contributor.create({
          data: createTestContributor({ 
            username: 'ten_review_user', 
            prCount: BigInt(0),
            reviewCount: BigInt(10),
            totalBillsAwarded: BigInt(0),
            first10ReviewsAwarded: false
          })
        });

        const results = await awardBillsAndVonettes();
        
        expect(results).toHaveLength(1);
        expect(results[0].bills).toBe('Bill');
        
        const updatedUser = await prisma.contributor.findUnique({ where: { username: 'ten_review_user' } });
        expect(updatedUser.first10ReviewsAwarded).toBe(true);
      });

      it('should award Vonette for reaching 500 PRs', async () => {
        await prisma.contributor.create({
          data: createTestContributor({ 
            username: 'superstar_pr', 
            prCount: BigInt(500),
            reviewCount: BigInt(0),
            totalBillsAwarded: BigInt(0),
            first500PrsAwarded: false
          })
        });

        const results = await awardBillsAndVonettes();
        
        expect(results).toHaveLength(1);
        expect(results[0].bills).toBe('Vonette');
        expect(results[0].billsImage).toBe('5_vonett_57_25.png');
        
        const updatedUser = await prisma.contributor.findUnique({ where: { username: 'superstar_pr' } });
        expect(Number(updatedUser.totalBillsAwarded)).toBe(5); // Vonette = 5 bills
        expect(updatedUser.first500PrsAwarded).toBe(true);
      });

      it('should award Vonette for reaching 500 reviews', async () => {
        await prisma.contributor.create({
          data: createTestContributor({ 
            username: 'superstar_reviewer', 
            prCount: BigInt(0),
            reviewCount: BigInt(500),
            totalBillsAwarded: BigInt(0),
            first500ReviewsAwarded: false
          })
        });

        const results = await awardBillsAndVonettes();
        
        expect(results).toHaveLength(1);
        expect(results[0].bills).toBe('Vonette');
        
        const updatedUser = await prisma.contributor.findUnique({ where: { username: 'superstar_reviewer' } });
        expect(updatedUser.first500ReviewsAwarded).toBe(true);
      });
    });

    describe('Incremental Bill Awards', () => {
      it('should award incremental Bills for every 100 total contributions', async () => {
        await prisma.contributor.create({
          data: createTestContributor({ 
            username: 'consistent_contributor', 
            prCount: BigInt(150),
            reviewCount: BigInt(50), // Total = 200
            totalBillsAwarded: BigInt(1), // Already has 1 bill from first 10
            first10PrsAwarded: true
          })
        });

        const results = await awardBillsAndVonettes();
        
        expect(results).toHaveLength(1);
        expect(results[0].bills).toBe('Bill');
        
        // Should now have 2 bills total (200/100 = 2)
        const updatedUser = await prisma.contributor.findUnique({ where: { username: 'consistent_contributor' } });
        expect(Number(updatedUser.totalBillsAwarded)).toBe(2);
      });

      it('should award multiple incremental Bills if needed', async () => {
        await prisma.contributor.create({
          data: createTestContributor({
            username: 'super_contributor',
            prCount: BigInt(200),
            reviewCount: BigInt(100), // Total = 300
            totalBillsAwarded: BigInt(0),
            first10PrsAwarded: false
          })
        });

        // First call awards initial milestone (10 PRs) → 1 bill
        let results = await awardBillsAndVonettes();
        expect(results).toHaveLength(1);
        expect(results[0].bills).toBe('Bill');

        let updatedUser = await prisma.contributor.findUnique({ where: { username: 'super_contributor' } });
        expect(Number(updatedUser.totalBillsAwarded)).toBe(1);

        // Second call awards incremental bills (300/100 - 1 = 2 more) → 3 bills total
        results = await awardBillsAndVonettes();
        expect(results).toHaveLength(1);
        expect(results[0].bills).toBe('Bill');

        updatedUser = await prisma.contributor.findUnique({ where: { username: 'super_contributor' } });
        expect(Number(updatedUser.totalBillsAwarded)).toBe(3);
      });

      it('should not award bills if no new milestones reached', async () => {
        await prisma.contributor.create({
          data: createTestContributor({ 
            username: 'static_user', 
            prCount: BigInt(10),
            reviewCount: BigInt(0),
            totalBillsAwarded: BigInt(1), // Already got bill for 10 PRs
            first10PrsAwarded: true
          })
        });

        const results = await awardBillsAndVonettes();
        
        expect(results).toHaveLength(0);
      });
    });

    describe('Complex Scenarios', () => {
      it('should handle both milestone and incremental awards correctly', async () => {
        await prisma.contributor.create({
          data: createTestContributor({
            username: 'complex_case',
            prCount: BigInt(500), // Triggers 500 PR Vonette
            reviewCount: BigInt(100), // Total contributions = 600
            totalBillsAwarded: BigInt(0),
            first10PrsAwarded: false,
            first500PrsAwarded: false
          })
        });

        // First call awards Vonette (5 bills) - highest priority milestone
        const results = await awardBillsAndVonettes();

        expect(results).toHaveLength(1);
        expect(results[0].bills).toBe('Vonette');

        const updatedUser = await prisma.contributor.findUnique({ where: { username: 'complex_case' } });
        // Vonette awards 5 bills (milestones take precedence over incremental)
        expect(Number(updatedUser.totalBillsAwarded)).toBe(5);
        expect(updatedUser.first500PrsAwarded).toBe(true);
      });

      it('should prioritize Vonette over incremental Bills in display', async () => {
        await prisma.contributor.create({
          data: createTestContributor({ 
            username: 'vonette_user', 
            prCount: BigInt(400),
            reviewCount: BigInt(200), // Total = 600, triggers both incremental and could be close to Vonette
            totalBillsAwarded: BigInt(4), // Already has some bills
            first500ReviewsAwarded: false
          })
        });

        // Manually set reviewCount to 500 to trigger Vonette
        await prisma.contributor.update({
          where: { username: 'vonette_user' }, 
          data: { reviewCount: BigInt(500) }
        });

        const results = await awardBillsAndVonettes();
        
        // Should show Vonette in results even if incremental bills also awarded
        const vonetteBills = results.find(r => r.bills === 'Vonette');
        expect(vonetteBills).toBeDefined();
      });
    });

    describe('Edge Cases', () => {
      it('should handle users with zero contributions', async () => {
        await prisma.contributor.create({
          data: createTestContributor({ 
            username: 'inactive_user', 
            prCount: BigInt(0),
            reviewCount: BigInt(0),
            totalBillsAwarded: BigInt(0)
          })
        });

        const results = await awardBillsAndVonettes();
        
        expect(results).toHaveLength(0);
      });

      it('should handle users who already have all possible milestone awards', async () => {
        await prisma.contributor.create({
          data: createTestContributor({ 
            username: 'maxed_user', 
            prCount: BigInt(600),
            reviewCount: BigInt(600),
            totalBillsAwarded: BigInt(12), // 1 + 5 + 6 (from incremental)
            first10PrsAwarded: true,
            first10ReviewsAwarded: true,
            first500PrsAwarded: true,
            first500ReviewsAwarded: true
          })
        });

        const results = await awardBillsAndVonettes();
        
        expect(results).toHaveLength(0);
      });

      it('should skip bot users', async () => {
        await prisma.contributor.create({
          data: createTestContributor({ 
            username: 'dependabot[bot]', 
            prCount: BigInt(50),
            reviewCount: BigInt(0),
            totalBillsAwarded: BigInt(0)
          })
        });

        const results = await awardBillsAndVonettes();
        
        expect(results).toHaveLength(0);
      });
    });
  });
});