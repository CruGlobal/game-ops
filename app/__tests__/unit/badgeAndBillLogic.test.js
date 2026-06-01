import { describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { awardBadges } from '../../services/contributorService.js';
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
            reviewCount: BigInt(0),
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

      it('should award all eligible badges in one pass', async () => {
        await prisma.contributor.create({
          data: createTestContributor({
            username: 'jumper',
            prCount: BigInt(100),
            reviewCount: BigInt(0),
            badges: [] // No prerequisite badges
          })
        });

        const results = await awardBadges();

        // Awards all eligible PR badges in one pass (1, 10, 50, 100)
        expect(results).toHaveLength(4);
        expect(results.map(r => r.badge)).toEqual([
          '1st PR badge',
          '10 PR badge',
          '50 PR badge',
          '100 PR badge'
        ]);
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

        // Single call awards both 1st PR and 1st Review badges
        const results = await awardBadges();
        expect(results).toHaveLength(2);
        expect(results.map(r => r.badge)).toEqual([
          '1st PR badge',
          '1st Review badge'
        ]);

        // Second call awards nothing (already awarded)
        const results2 = await awardBadges();
        expect(results2).toHaveLength(0);
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

        // Awards both 1st PR and 10 PR badges in one pass
        await awardBadges();

        let updatedContributor = await prisma.contributor.findUnique({ where: { username: 'persistent_user' } });
        expect(updatedContributor.badges).toHaveLength(2);
        expect(updatedContributor.badges[0].badge).toBe('1st PR badge');
        expect(updatedContributor.badges[0].date).toBeDefined();
        expect(updatedContributor.badges[1].badge).toBe('10 PR badge');
        expect(updatedContributor.badges[1].date).toBeDefined();

        // Second call awards nothing (already awarded)
        await awardBadges();

        updatedContributor = await prisma.contributor.findUnique({ where: { username: 'persistent_user' } });
        expect(updatedContributor.badges).toHaveLength(2);
      });
    });
  });

});