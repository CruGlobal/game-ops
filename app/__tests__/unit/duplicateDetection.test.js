import { describe, it, expect, beforeEach } from '@jest/globals';
import { checkForDuplicates, fixDuplicates } from '../../services/contributorService.js';
import Contributor from '../../models/contributor.js';
import { createTestContributor } from '../setup.js';

describe('Duplicate Detection and Repair', () => {
    beforeEach(async () => {
        await Contributor.deleteMany({});
    });

    describe('checkForDuplicates', () => {
        it('should detect PR count mismatch', async () => {
            await Contributor.create(
                createTestContributor({
                    username: 'testuser',
                    prCount: 10,
                    processedPRs: [
                        { prNumber: 1, action: 'authored', date: new Date() },
                        { prNumber: 2, action: 'authored', date: new Date() },
                        { prNumber: 3, action: 'authored', date: new Date() }
                    ]
                })
            );

            const result = await checkForDuplicates();

            expect(result.hasDuplicates).toBe(true);
            expect(result.summary.prCountMismatches).toBe(1);
            expect(result.details).toHaveLength(1);
            expect(result.details[0].username).toBe('testuser');
            expect(result.details[0].issue).toBe('PR count mismatch');
            expect(result.details[0].currentPRCount).toBe(10);
            expect(result.details[0].correctPRCount).toBe(3);
        });

        it('should detect review count mismatch', async () => {
            await Contributor.create(
                createTestContributor({
                    username: 'testuser',
                    reviewCount: 15,
                    processedReviews: [
                        { reviewId: 1, date: new Date() },
                        { reviewId: 2, date: new Date() },
                        { reviewId: 3, date: new Date() },
                        { reviewId: 4, date: new Date() },
                        { reviewId: 5, date: new Date() }
                    ]
                })
            );

            const result = await checkForDuplicates();

            expect(result.hasDuplicates).toBe(true);
            expect(result.summary.reviewCountMismatches).toBe(1);
            expect(result.details[0].issue).toBe('Review count mismatch');
            expect(result.details[0].currentReviewCount).toBe(15);
            expect(result.details[0].correctReviewCount).toBe(5);
        });

        it('should detect duplicate PR entries', async () => {
            await Contributor.create(
                createTestContributor({
                    username: 'testuser',
                    prCount: 5,
                    processedPRs: [
                        { prNumber: 1, action: 'authored', date: new Date() },
                        { prNumber: 2, action: 'authored', date: new Date() },
                        { prNumber: 1, action: 'authored', date: new Date() }, // Duplicate
                        { prNumber: 3, action: 'authored', date: new Date() },
                        { prNumber: 2, action: 'authored', date: new Date() }  // Duplicate
                    ]
                })
            );

            const result = await checkForDuplicates();

            expect(result.hasDuplicates).toBe(true);
            expect(result.summary.duplicatePREntries).toBe(1);
            const duplicateDetail = result.details.find(d => d.issue === 'Duplicate PR entries');
            expect(duplicateDetail).toBeDefined();
            expect(duplicateDetail.duplicateCount).toBe(2);
        });

        it('should detect duplicate review entries', async () => {
            await Contributor.create(
                createTestContributor({
                    username: 'testuser',
                    reviewCount: 6,
                    processedReviews: [
                        { reviewId: 1, date: new Date() },
                        { reviewId: 2, date: new Date() },
                        { reviewId: 1, date: new Date() }, // Duplicate
                        { reviewId: 3, date: new Date() },
                        { reviewId: 2, date: new Date() }, // Duplicate
                        { reviewId: 3, date: new Date() }  // Duplicate
                    ]
                })
            );

            const result = await checkForDuplicates();

            expect(result.hasDuplicates).toBe(true);
            expect(result.summary.duplicateReviewEntries).toBe(1);
            const duplicateDetail = result.details.find(d => d.issue === 'Duplicate review entries');
            expect(duplicateDetail).toBeDefined();
            expect(duplicateDetail.duplicateCount).toBe(3);
        });

        it('should report no duplicates for clean database', async () => {
            await Contributor.create([
                createTestContributor({
                    username: 'user1',
                    prCount: 3,
                    reviewCount: 2,
                    processedPRs: [
                        { prNumber: 1, action: 'authored', date: new Date() },
                        { prNumber: 2, action: 'authored', date: new Date() },
                        { prNumber: 3, action: 'authored', date: new Date() }
                    ],
                    processedReviews: [
                        { reviewId: 1, date: new Date() },
                        { reviewId: 2, date: new Date() }
                    ]
                }),
                createTestContributor({
                    username: 'user2',
                    prCount: 5,
                    reviewCount: 3,
                    processedPRs: [
                        { prNumber: 4, action: 'authored', date: new Date() },
                        { prNumber: 5, action: 'authored', date: new Date() },
                        { prNumber: 6, action: 'authored', date: new Date() },
                        { prNumber: 7, action: 'authored', date: new Date() },
                        { prNumber: 8, action: 'authored', date: new Date() }
                    ],
                    processedReviews: [
                        { reviewId: 3, date: new Date() },
                        { reviewId: 4, date: new Date() },
                        { reviewId: 5, date: new Date() }
                    ]
                })
            ]);

            const result = await checkForDuplicates();

            expect(result.hasDuplicates).toBe(false);
            expect(result.summary.prCountMismatches).toBe(0);
            expect(result.summary.reviewCountMismatches).toBe(0);
            expect(result.summary.duplicatePREntries).toBe(0);
            expect(result.summary.duplicateReviewEntries).toBe(0);
            expect(result.details).toHaveLength(0);
        });

        it('should handle multiple issues for same contributor', async () => {
            await Contributor.create(
                createTestContributor({
                    username: 'problematic',
                    prCount: 10,
                    reviewCount: 8,
                    processedPRs: [
                        { prNumber: 1, action: 'authored', date: new Date() },
                        { prNumber: 1, action: 'authored', date: new Date() }, // Duplicate
                        { prNumber: 2, action: 'authored', date: new Date() }
                    ],
                    processedReviews: [
                        { reviewId: 1, date: new Date() },
                        { reviewId: 1, date: new Date() }  // Duplicate
                    ]
                })
            );

            const result = await checkForDuplicates();

            expect(result.hasDuplicates).toBe(true);
            expect(result.details.filter(d => d.username === 'problematic')).toHaveLength(4);
        });
    });

    describe('fixDuplicates', () => {
        it('should fix PR count mismatch', async () => {
            await Contributor.create(
                createTestContributor({
                    username: 'testuser',
                    prCount: 10,
                    processedPRs: [
                        { prNumber: 1, action: 'authored', date: new Date() },
                        { prNumber: 2, action: 'authored', date: new Date() },
                        { prNumber: 3, action: 'authored', date: new Date() }
                    ]
                })
            );

            const result = await fixDuplicates();

            expect(result.contributorsFixed).toBe(1);
            expect(result.prCountAdjustments).toBe(-7);

            const user = await Contributor.findOne({ username: 'testuser' });
            expect(user.prCount).toBe(3);
        });

        it('should fix review count mismatch', async () => {
            await Contributor.create(
                createTestContributor({
                    username: 'testuser',
                    reviewCount: 20,
                    processedReviews: [
                        { reviewId: 1, date: new Date() },
                        { reviewId: 2, date: new Date() },
                        { reviewId: 3, date: new Date() },
                        { reviewId: 4, date: new Date() },
                        { reviewId: 5, date: new Date() }
                    ]
                })
            );

            const result = await fixDuplicates();

            expect(result.contributorsFixed).toBe(1);
            expect(result.reviewCountAdjustments).toBe(-15);

            const user = await Contributor.findOne({ username: 'testuser' });
            expect(user.reviewCount).toBe(5);
        });

        it('should remove duplicate PR entries', async () => {
            await Contributor.create(
                createTestContributor({
                    username: 'testuser',
                    prCount: 5,
                    processedPRs: [
                        { prNumber: 1, action: 'authored', date: new Date('2025-01-01') },
                        { prNumber: 2, action: 'authored', date: new Date('2025-01-02') },
                        { prNumber: 1, action: 'authored', date: new Date('2025-01-03') }, // Duplicate
                        { prNumber: 3, action: 'authored', date: new Date('2025-01-04') },
                        { prNumber: 2, action: 'authored', date: new Date('2025-01-05') }  // Duplicate
                    ]
                })
            );

            const result = await fixDuplicates();

            expect(result.duplicatePRsRemoved).toBe(2);

            const user = await Contributor.findOne({ username: 'testuser' });
            expect(user.processedPRs).toHaveLength(3);
            expect(user.prCount).toBe(3);
        });

        it('should remove duplicate review entries', async () => {
            await Contributor.create(
                createTestContributor({
                    username: 'testuser',
                    reviewCount: 6,
                    processedReviews: [
                        { reviewId: 1, date: new Date('2025-01-01') },
                        { reviewId: 2, date: new Date('2025-01-02') },
                        { reviewId: 1, date: new Date('2025-01-03') }, // Duplicate
                        { reviewId: 3, date: new Date('2025-01-04') },
                        { reviewId: 2, date: new Date('2025-01-05') }, // Duplicate
                        { reviewId: 3, date: new Date('2025-01-06') }  // Duplicate
                    ]
                })
            );

            const result = await fixDuplicates();

            expect(result.duplicateReviewsRemoved).toBe(3);

            const user = await Contributor.findOne({ username: 'testuser' });
            expect(user.processedReviews).toHaveLength(3);
            expect(user.reviewCount).toBe(3);
        });

        it('should preserve first occurrence when removing duplicates', async () => {
            const firstDate = new Date('2025-01-01');
            const secondDate = new Date('2025-01-02');

            await Contributor.create(
                createTestContributor({
                    username: 'testuser',
                    prCount: 2,
                    processedPRs: [
                        { prNumber: 1, action: 'authored', date: firstDate },
                        { prNumber: 1, action: 'authored', date: secondDate } // Duplicate
                    ]
                })
            );

            await fixDuplicates();

            const user = await Contributor.findOne({ username: 'testuser' });
            expect(user.processedPRs).toHaveLength(1);
            expect(user.processedPRs[0].date.getTime()).toBe(firstDate.getTime());
        });

        it('should fix multiple contributors in one operation', async () => {
            await Contributor.create([
                createTestContributor({
                    username: 'user1',
                    prCount: 10,
                    processedPRs: [
                        { prNumber: 1, action: 'authored', date: new Date() },
                        { prNumber: 2, action: 'authored', date: new Date() }
                    ]
                }),
                createTestContributor({
                    username: 'user2',
                    reviewCount: 15,
                    processedReviews: [
                        { reviewId: 1, date: new Date() },
                        { reviewId: 2, date: new Date() },
                        { reviewId: 3, date: new Date() }
                    ]
                }),
                createTestContributor({
                    username: 'user3',
                    prCount: 3,
                    processedPRs: [
                        { prNumber: 1, action: 'authored', date: new Date() },
                        { prNumber: 1, action: 'authored', date: new Date() }, // Duplicate
                        { prNumber: 2, action: 'authored', date: new Date() }
                    ]
                })
            ]);

            const result = await fixDuplicates();

            expect(result.contributorsFixed).toBe(3);
            expect(result.prCountAdjustments).toBeGreaterThan(0);
            expect(result.reviewCountAdjustments).toBeGreaterThan(0);
            expect(result.duplicatePRsRemoved).toBe(1);
        });

        it('should not modify contributors with no issues', async () => {
            await Contributor.create(
                createTestContributor({
                    username: 'cleanuser',
                    prCount: 3,
                    reviewCount: 2,
                    processedPRs: [
                        { prNumber: 1, action: 'authored', date: new Date() },
                        { prNumber: 2, action: 'authored', date: new Date() },
                        { prNumber: 3, action: 'authored', date: new Date() }
                    ],
                    processedReviews: [
                        { reviewId: 1, date: new Date() },
                        { reviewId: 2, date: new Date() }
                    ]
                })
            );

            const result = await fixDuplicates();

            expect(result.contributorsFixed).toBe(0);
            expect(result.prCountAdjustments).toBe(0);
            expect(result.reviewCountAdjustments).toBe(0);
            expect(result.duplicatePRsRemoved).toBe(0);
            expect(result.duplicateReviewsRemoved).toBe(0);
        });

        it('should return zero stats for empty database', async () => {
            const result = await fixDuplicates();

            expect(result.contributorsFixed).toBe(0);
            expect(result.prCountAdjustments).toBe(0);
            expect(result.reviewCountAdjustments).toBe(0);
            expect(result.duplicatePRsRemoved).toBe(0);
            expect(result.duplicateReviewsRemoved).toBe(0);
        });
    });

    describe('Edge Cases', () => {
        it('should handle contributor with empty processedPRs array', async () => {
            await Contributor.create(
                createTestContributor({
                    username: 'newuser',
                    prCount: 0,
                    processedPRs: []
                })
            );

            const checkResult = await checkForDuplicates();
            expect(checkResult.hasDuplicates).toBe(false);

            const fixResult = await fixDuplicates();
            expect(fixResult.contributorsFixed).toBe(0);
        });

        it('should handle contributor with missing processedPRs field', async () => {
            const contributor = createTestContributor({
                username: 'olduser',
                prCount: 5
            });
            delete contributor.processedPRs;

            await Contributor.create(contributor);

            const checkResult = await checkForDuplicates();
            expect(checkResult.hasDuplicates).toBe(true);

            const fixResult = await fixDuplicates();
            expect(fixResult.contributorsFixed).toBe(1);

            const user = await Contributor.findOne({ username: 'olduser' });
            expect(user.prCount).toBe(0);
        });

        it('should handle very large duplicate counts', async () => {
            const processedPRs = [];
            for (let i = 0; i < 100; i++) {
                processedPRs.push({ prNumber: 1, action: 'authored', date: new Date() });
            }

            await Contributor.create(
                createTestContributor({
                    username: 'spammer',
                    prCount: 100,
                    processedPRs
                })
            );

            const result = await fixDuplicates();

            expect(result.duplicatePRsRemoved).toBe(99);

            const user = await Contributor.findOne({ username: 'spammer' });
            expect(user.processedPRs).toHaveLength(1);
            expect(user.prCount).toBe(1);
        });
    });
});
