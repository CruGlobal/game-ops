import { describe, it, expect, beforeEach } from '@jest/globals';
import { awardBadges, awardBillsAndVonettes } from '../../services/contributorService.js';
import Contributor from '../../models/contributor.js';
import { createTestContributor } from '../setup.js';

describe('Badge and Bill Awarding Logic', () => {
  beforeEach(async () => {
    await Contributor.deleteMany({});
  });

  describe('Badge Awarding Logic', () => {
    describe('PR Badges', () => {
      it('should award 1st PR badge for first contribution', async () => {
        await Contributor.create(
          createTestContributor({ 
            username: 'newcomer', 
            prCount: 1, 
            badges: [] 
          })
        );

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
          { prCount: 10, expectedBadge: '10 PR badge', expectedImage: '10_pr_badge.png' },
          { prCount: 50, expectedBadge: '50 PR badge', expectedImage: '50_pr_badge.png' },
          { prCount: 100, expectedBadge: '100 PR badge', expectedImage: '100_pr_badge.png' },
          { prCount: 500, expectedBadge: '500 PR badge', expectedImage: '500_pr_badge.png' },
          { prCount: 1000, expectedBadge: '1000 PR badge', expectedImage: '1000_pr_badge.png' }
        ];

        for (const testCase of testCases) {
          await Contributor.deleteMany({});
          
          await Contributor.create(
            createTestContributor({ 
              username: `user_${testCase.prCount}`, 
              prCount: testCase.prCount,
              badges: [{ badge: '1st PR badge', date: new Date() }] // Has prerequisite badge
            })
          );

          const results = await awardBadges();
          
          const milestoneResult = results.find(r => r.badge === testCase.expectedBadge);
          expect(milestoneResult).toBeDefined();
          expect(milestoneResult.badgeImage).toBe(testCase.expectedImage);
        }
      });

      it('should not award higher tier badges without prerequisite badges', async () => {
        await Contributor.create(
          createTestContributor({ 
            username: 'jumper', 
            prCount: 100, 
            badges: [] // No prerequisite badges
          })
        );

        const results = await awardBadges();
        
        // Should only get 1st PR badge
        expect(results).toHaveLength(1);
        expect(results[0].badge).toBe('1st PR badge');
      });
    });

    describe('Review Badges', () => {
      it('should award review badges at correct thresholds', async () => {
        const testCases = [
          { reviewCount: 1, expectedBadge: '1st Review badge', expectedImage: '1st_review_badge.png' },
          { reviewCount: 10, expectedBadge: '10 Review badge', expectedImage: '10_review_badge.png' },
          { reviewCount: 50, expectedBadge: '50 Review badge', expectedImage: '50_review_badge.png' },
          { reviewCount: 100, expectedBadge: '100 Review badge', expectedImage: '100_review_badge.png' },
          { reviewCount: 500, expectedBadge: '500 Review badge', expectedImage: '500_review_badge.png' },
          { reviewCount: 1000, expectedBadge: '1000 Review badge', expectedImage: '1000_review_badge.png' }
        ];

        for (const testCase of testCases) {
          await Contributor.deleteMany({});
          
          const existingBadges = testCase.reviewCount > 1 
            ? [{ badge: '1st Review badge', date: new Date() }]
            : [];

          await Contributor.create(
            createTestContributor({ 
              username: `reviewer_${testCase.reviewCount}`, 
              prCount: 0,
              reviewCount: testCase.reviewCount,
              badges: existingBadges
            })
          );

          const results = await awardBadges();
          
          const reviewResult = results.find(r => r.badge === testCase.expectedBadge);
          expect(reviewResult).toBeDefined();
          expect(reviewResult.badgeImage).toBe(testCase.expectedImage);
        }
      });

      it('should award both PR and review badges to active contributors', async () => {
        await Contributor.create(
          createTestContributor({ 
            username: 'active_contributor', 
            prCount: 1,
            reviewCount: 1,
            badges: []
          })
        );

        const results = await awardBadges();
        
        expect(results).toHaveLength(2);
        expect(results.some(r => r.badge === '1st PR badge')).toBe(true);
        expect(results.some(r => r.badge === '1st Review badge')).toBe(true);
      });
    });

    describe('Badge Persistence', () => {
      it('should save awarded badges to the database', async () => {
        await Contributor.create(
          createTestContributor({ 
            username: 'persistent_user', 
            prCount: 10,
            badges: []
          })
        );

        await awardBadges();

        const updatedContributor = await Contributor.findOne({ username: 'persistent_user' });
        expect(updatedContributor.badges).toHaveLength(2); // 1st PR + 10 PR badges
        expect(updatedContributor.badges[0].badge).toBe('1st PR badge');
        expect(updatedContributor.badges[0].date).toBeDefined();
        expect(updatedContributor.badges[1].badge).toBe('10 PR badge');
      });
    });
  });

  describe('Bill and Vonette Awarding Logic', () => {
    describe('Initial Milestone Awards', () => {
      it('should award Bill for reaching 10 PRs', async () => {
        await Contributor.create(
          createTestContributor({ 
            username: 'ten_pr_user', 
            prCount: 10,
            reviewCount: 0,
            totalBillsAwarded: 0,
            first10PrsAwarded: false
          })
        );

        const results = await awardBillsAndVonettes();
        
        expect(results).toHaveLength(1);
        expect(results[0]).toEqual({
          username: 'ten_pr_user',
          bills: 'Bill',
          billsImage: '1_bill_57X27.png'
        });

        const updatedUser = await Contributor.findOne({ username: 'ten_pr_user' });
        expect(updatedUser.totalBillsAwarded).toBe(1);
        expect(updatedUser.first10PrsAwarded).toBe(true);
      });

      it('should award Bill for reaching 10 reviews', async () => {
        await Contributor.create(
          createTestContributor({ 
            username: 'ten_review_user', 
            prCount: 0,
            reviewCount: 10,
            totalBillsAwarded: 0,
            first10ReviewsAwarded: false
          })
        );

        const results = await awardBillsAndVonettes();
        
        expect(results).toHaveLength(1);
        expect(results[0].bills).toBe('Bill');
        
        const updatedUser = await Contributor.findOne({ username: 'ten_review_user' });
        expect(updatedUser.first10ReviewsAwarded).toBe(true);
      });

      it('should award Vonette for reaching 500 PRs', async () => {
        await Contributor.create(
          createTestContributor({ 
            username: 'superstar_pr', 
            prCount: 500,
            reviewCount: 0,
            totalBillsAwarded: 0,
            first500PrsAwarded: false
          })
        );

        const results = await awardBillsAndVonettes();
        
        expect(results).toHaveLength(1);
        expect(results[0].bills).toBe('Vonette');
        expect(results[0].billsImage).toBe('5_vonett_57_25.png');
        
        const updatedUser = await Contributor.findOne({ username: 'superstar_pr' });
        expect(updatedUser.totalBillsAwarded).toBe(5); // Vonette = 5 bills
        expect(updatedUser.first500PrsAwarded).toBe(true);
      });

      it('should award Vonette for reaching 500 reviews', async () => {
        await Contributor.create(
          createTestContributor({ 
            username: 'superstar_reviewer', 
            prCount: 0,
            reviewCount: 500,
            totalBillsAwarded: 0,
            first500ReviewsAwarded: false
          })
        );

        const results = await awardBillsAndVonettes();
        
        expect(results).toHaveLength(1);
        expect(results[0].bills).toBe('Vonette');
        
        const updatedUser = await Contributor.findOne({ username: 'superstar_reviewer' });
        expect(updatedUser.first500ReviewsAwarded).toBe(true);
      });
    });

    describe('Incremental Bill Awards', () => {
      it('should award incremental Bills for every 100 total contributions', async () => {
        await Contributor.create(
          createTestContributor({ 
            username: 'consistent_contributor', 
            prCount: 150,
            reviewCount: 50, // Total = 200
            totalBillsAwarded: 1, // Already has 1 bill from first 10
            first10PrsAwarded: true
          })
        );

        const results = await awardBillsAndVonettes();
        
        expect(results).toHaveLength(1);
        expect(results[0].bills).toBe('Bill');
        
        // Should now have 2 bills total (200/100 = 2)
        const updatedUser = await Contributor.findOne({ username: 'consistent_contributor' });
        expect(updatedUser.totalBillsAwarded).toBe(2);
      });

      it('should award multiple incremental Bills if needed', async () => {
        await Contributor.create(
          createTestContributor({ 
            username: 'super_contributor', 
            prCount: 200,
            reviewCount: 100, // Total = 300
            totalBillsAwarded: 0,
            first10PrsAwarded: false
          })
        );

        const results = await awardBillsAndVonettes();
        
        expect(results).toHaveLength(1);
        expect(results[0].bills).toBe('Bill');
        
        // Should get 4 bills total: 1 for first 10 PRs + 3 for incremental (300/100 = 3)
        const updatedUser = await Contributor.findOne({ username: 'super_contributor' });
        expect(updatedUser.totalBillsAwarded).toBe(4);
      });

      it('should not award bills if no new milestones reached', async () => {
        await Contributor.create(
          createTestContributor({ 
            username: 'static_user', 
            prCount: 10,
            reviewCount: 0,
            totalBillsAwarded: 1, // Already got bill for 10 PRs
            first10PrsAwarded: true
          })
        );

        const results = await awardBillsAndVonettes();
        
        expect(results).toHaveLength(0);
      });
    });

    describe('Complex Scenarios', () => {
      it('should handle both milestone and incremental awards correctly', async () => {
        await Contributor.create(
          createTestContributor({ 
            username: 'complex_case', 
            prCount: 500, // Triggers 500 PR Vonette
            reviewCount: 100, // Total contributions = 600
            totalBillsAwarded: 0,
            first10PrsAwarded: false,
            first500PrsAwarded: false
          })
        );

        const results = await awardBillsAndVonettes();
        
        expect(results).toHaveLength(1);
        expect(results[0].bills).toBe('Vonette'); // Should get Vonette (highest award)
        
        const updatedUser = await Contributor.findOne({ username: 'complex_case' });
        // Should get: 1 (first 10 PRs) + 5 (500 PR Vonette) + 0 (incremental already covered)
        expect(updatedUser.totalBillsAwarded).toBe(6);
        expect(updatedUser.first10PrsAwarded).toBe(true);
        expect(updatedUser.first500PrsAwarded).toBe(true);
      });

      it('should prioritize Vonette over incremental Bills in display', async () => {
        await Contributor.create(
          createTestContributor({ 
            username: 'vonette_user', 
            prCount: 400,
            reviewCount: 200, // Total = 600, triggers both incremental and could be close to Vonette
            totalBillsAwarded: 4, // Already has some bills
            first500ReviewsAwarded: false
          })
        );

        // Manually set reviewCount to 500 to trigger Vonette
        await Contributor.updateOne(
          { username: 'vonette_user' }, 
          { reviewCount: 500 }
        );

        const results = await awardBillsAndVonettes();
        
        // Should show Vonette in results even if incremental bills also awarded
        const vonetteBills = results.find(r => r.bills === 'Vonette');
        expect(vonetteBills).toBeDefined();
      });
    });

    describe('Edge Cases', () => {
      it('should handle users with zero contributions', async () => {
        await Contributor.create(
          createTestContributor({ 
            username: 'inactive_user', 
            prCount: 0,
            reviewCount: 0,
            totalBillsAwarded: 0
          })
        );

        const results = await awardBillsAndVonettes();
        
        expect(results).toHaveLength(0);
      });

      it('should handle users who already have all possible milestone awards', async () => {
        await Contributor.create(
          createTestContributor({ 
            username: 'maxed_user', 
            prCount: 600,
            reviewCount: 600,
            totalBillsAwarded: 12, // 1 + 5 + 6 (from incremental)
            first10PrsAwarded: true,
            first10ReviewsAwarded: true,
            first500PrsAwarded: true,
            first500ReviewsAwarded: true
          })
        );

        const results = await awardBillsAndVonettes();
        
        expect(results).toHaveLength(0);
      });

      it('should skip bot users', async () => {
        await Contributor.create(
          createTestContributor({ 
            username: 'dependabot[bot]', 
            prCount: 50,
            reviewCount: 0,
            totalBillsAwarded: 0
          })
        );

        const results = await awardBillsAndVonettes();
        
        expect(results).toHaveLength(0);
      });
    });
  });
});