import { jest, describe, it, expect } from '@jest/globals';

// contributorService constructs an Octokit at module load; planCounterRepair itself
// touches neither GitHub nor the database.
jest.unstable_mockModule('@octokit/rest', () => ({
    Octokit: jest.fn().mockImplementation(() => ({ rest: { users: { getByUsername: jest.fn() } } }))
}));

const { planCounterRepair } = await import('../../services/contributorService.js');

const pr = (id, prNumber, action = 'authored') => ({ id, prNumber, action });
const review = (id, prNumber, reviewId) => ({ id, prNumber, reviewId });

describe('planCounterRepair', () => {
    it('reconciles a counter to the processed-row count', () => {
        const plan = planCounterRepair({
            prCount: 5,
            reviewCount: 0,
            processedPRs: [pr('a', 1), pr('b', 2)],
            processedReviews: []
        });

        expect(plan.updateData).toEqual({ prCount: 2 });
        expect(plan.prCountAdjustment).toBe(3);
        expect(plan.prsToDelete).toEqual([]);
    });

    it('counts the surviving rows, not the rows present before the deletes', () => {
        // The ordering this function exists to get right. prCount 3 with a duplicate
        // pair present: two rows survive, so the counter must land on 2. Computing it
        // before the delete lands writes 3 — a fresh mismatch created by the very
        // function meant to remove them.
        const plan = planCounterRepair({
            prCount: 3,
            reviewCount: 0,
            processedPRs: [pr('a', 1), pr('dupe', 1), pr('c', 2)],
            processedReviews: []
        });

        expect(plan.prsToDelete).toEqual(['dupe']);
        expect(plan.updateData).toEqual({ prCount: 2 });
    });

    it('applies the same rule to reviews, keyed on (prNumber, reviewId)', () => {
        const plan = planCounterRepair({
            prCount: 0,
            reviewCount: 4,
            processedPRs: [],
            processedReviews: [review('a', 10, 100), review('dupe', 10, 100), review('c', 10, 101)]
        });

        expect(plan.reviewsToDelete).toEqual(['dupe']);
        expect(plan.updateData).toEqual({ reviewCount: 2 });
        expect(plan.reviewCountAdjustment).toBe(2);
    });

    it('treats a differing action on the same PR as distinct', () => {
        const plan = planCounterRepair({
            prCount: 2,
            reviewCount: 0,
            processedPRs: [pr('a', 1, 'authored'), pr('b', 1, 'reviewed')],
            processedReviews: []
        });

        expect(plan.prsToDelete).toEqual([]);
        expect(plan.updateData).toEqual({});
    });

    it('plans nothing when counters already agree and there are no duplicates', () => {
        const plan = planCounterRepair({
            prCount: 2,
            reviewCount: 1,
            processedPRs: [pr('a', 1), pr('b', 2)],
            processedReviews: [review('r', 5, 50)]
        });

        expect(plan).toEqual({
            prsToDelete: [],
            reviewsToDelete: [],
            updateData: {},
            prCountAdjustment: 0,
            reviewCountAdjustment: 0
        });
    });

    it('handles a contributor with no processed rows at all', () => {
        const plan = planCounterRepair({ prCount: 7, reviewCount: 3 });

        expect(plan.updateData).toEqual({ prCount: 0, reviewCount: 0 });
    });
});
