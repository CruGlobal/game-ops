import { describe, it, expect, beforeEach } from '@jest/globals';
import { checkForDuplicates, fixDuplicates } from '../../services/contributorService.js';
import Contributor from '../../models/contributor.js';
import { createTestContributor } from '../setup.js';

describe('Duplicate Detection and Repair', () => {
    beforeEach(async () => {
        await Contributor.deleteMany({});
    });

    describe('checkForDuplicates', () => {
        it('should detect duplicate PR entries within contributor', async () => {
            await Contributor.create(
                createTestContributor({
                    username: 'testuser',
                    prCount: 5,
                    processedPRs: [
                        { prNumber: 1, action: 'authored', processedDate: new Date() },
                        { prNumber: 2, action: 'authored', processedDate: new Date() },
                        { prNumber: 1, action: 'authored', processedDate: new Date() }, // Duplicate
                        { prNumber: 3, action: 'authored', processedDate: new Date() },
                        { prNumber: 2, action: 'authored', processedDate: new Date() }  // Duplicate
                    ]
                })
            );

            const result = await checkForDuplicates();

            expect(result.hasDuplicates).toBe(true);
            expect(result.duplicateCount).toBeGreaterThan(0);
            expect(result.details).toBeInstanceOf(Array);
            expect(result.details.length).toBeGreaterThan(0);

            const prDuplicate = result.details.find(d => d.type === 'PR');
            expect(prDuplicate).toBeDefined();
            expect(prDuplicate.contributor).toBe('testuser');
            expect(prDuplicate.occurrences).toBeGreaterThan(1);
        });

        it('should detect duplicate review entries within contributor', async () => {
            await Contributor.create(
                createTestContributor({
                    username: 'testuser',
                    reviewCount: 6,
                    processedReviews: [
                        { prNumber: 100, reviewId: 1, processedDate: new Date() },
                        { prNumber: 101, reviewId: 2, processedDate: new Date() },
                        { prNumber: 100, reviewId: 1, processedDate: new Date() }, // Duplicate
                        { prNumber: 102, reviewId: 3, processedDate: new Date() },
                        { prNumber: 101, reviewId: 2, processedDate: new Date() }, // Duplicate
                        { prNumber: 102, reviewId: 3, processedDate: new Date() }  // Duplicate
                    ]
                })
            );

            const result = await checkForDuplicates();

            expect(result.hasDuplicates).toBe(true);
            expect(result.summary.duplicateReviews).toBeGreaterThan(0);

            const reviewDuplicate = result.details.find(d => d.type === 'Review');
            expect(reviewDuplicate).toBeDefined();
            expect(reviewDuplicate.contributor).toBe('testuser');
        });

        it('should report no duplicates for clean database', async () => {
            await Contributor.create([
                createTestContributor({
                    username: 'user1',
                    prCount: 3,
                    reviewCount: 2,
                    processedPRs: [
                        { prNumber: 1, action: 'authored', processedDate: new Date() },
                        { prNumber: 2, action: 'authored', processedDate: new Date() },
                        { prNumber: 3, action: 'authored', processedDate: new Date() }
                    ],
                    processedReviews: [
                        { prNumber: 10, reviewId: 1, processedDate: new Date() },
                        { prNumber: 11, reviewId: 2, processedDate: new Date() }
                    ]
                })
            ]);

            const result = await checkForDuplicates();

            expect(result.hasDuplicates).toBe(false);
            expect(result.summary.duplicatePRs).toBe(0);
            expect(result.summary.duplicateReviews).toBe(0);
            expect(result.details).toHaveLength(0);
        });

        it('should handle contributor with no duplicates', async () => {
            await Contributor.create(
                createTestContributor({
                    username: 'clean',
                    prCount: 2,
                    processedPRs: [
                        { prNumber: 100, action: 'authored', processedDate: new Date() },
                        { prNumber: 101, action: 'authored', processedDate: new Date() }
                    ]
                })
            );

            const result = await checkForDuplicates();

            // Should not have duplicates within this contributor
            const cleanUserDetails = result.details.filter(d => d.contributor === 'clean');
            expect(cleanUserDetails).toHaveLength(0);
        });
    });

    describe('fixDuplicates', () => {
        it('should remove duplicate PR entries', async () => {
            await Contributor.create(
                createTestContributor({
                    username: 'testuser',
                    prCount: 5,
                    processedPRs: [
                        { prNumber: 1, action: 'authored', processedDate: new Date('2025-01-01') },
                        { prNumber: 2, action: 'authored', processedDate: new Date('2025-01-03') },
                        { prNumber: 1, action: 'authored', processedDate: new Date('2025-01-02') },
                        { prNumber: 3, action: 'authored', processedDate: new Date('2025-01-04') },
                        { prNumber: 2, action: 'authored', processedDate: new Date('2025-01-05') }
                    ]
                })
            );

            const result = await fixDuplicates();

            expect(result.contributorsFixed).toBeGreaterThan(0);
            expect(result.duplicatePRsRemoved).toBe(2);

            const user = await Contributor.findOne({ username: 'testuser' });
            expect(user.processedPRs).toHaveLength(3);
            expect(user.prCount).toBe(3);
        });

        it('should return zero stats for empty database', async () => {
            const result = await fixDuplicates();

            expect(result.contributorsFixed).toBe(0);
            expect(result.duplicatePRsRemoved).toBe(0);
            expect(result.duplicateReviewsRemoved).toBe(0);
        });
    });
});
