import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { prisma, createTestContributor } from '../setup.js';

jest.unstable_mockModule('@octokit/rest', () => ({
    Octokit: jest.fn().mockImplementation(() => ({
        rest: {
            users: {
                getByUsername: jest.fn().mockResolvedValue({
                    data: { login: 'compensated', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' }
                })
            },
            pulls: { listReviews: jest.fn(), list: jest.fn() }
        },
        paginate: { iterator: jest.fn() }
    }))
}));

// Fail the points award so the compensation path actually runs. Without this the
// rollback is unexercised — the failure it guards against only happens when an
// award throws after the claim and counter have already committed.
const mockAwardPoints = jest.fn();
const mockAwardReviewPoints = jest.fn();
jest.unstable_mockModule('../services/pointsService.js', () => ({
    awardPoints: mockAwardPoints,
    awardReviewPoints: mockAwardReviewPoints,
    calculatePoints: () => ({ points: 40, type: 'default' }),
    getPointsLeaderboard: jest.fn(),
    getPointsHistory: jest.fn(),
    getPointsSummary: jest.fn()
}));

const { processSingleMergedPR, processSingleReview } = await import('../../services/contributorService.js');

describe('claim compensation when an award fails', () => {
    beforeEach(async () => {
        mockAwardPoints.mockReset();
        mockAwardReviewPoints.mockReset();
        await prisma.contributor.create({
            data: createTestContributor({ username: 'compensated', prCount: BigInt(0), reviewCount: BigInt(0) })
        });
    });

    it('rolls back the PR claim and the counter when awarding points fails', async () => {
        mockAwardPoints.mockRejectedValue(new Error('points backend down'));

        await expect(processSingleMergedPR({
            number: 7001, title: 'compensated PR', username: 'compensated',
            mergedAt: '2026-08-19T10:00:00Z', labels: []
        })).rejects.toThrow('points backend down');

        const after = await prisma.contributor.findUnique({ where: { username: 'compensated' } });
        // Both must be undone. A surviving claim makes every retry a no-op, so the PR
        // would stay miscounted forever with no way to repair it.
        expect(await prisma.processedPR.count({ where: { prNumber: BigInt(7001) } })).toBe(0);
        expect(Number(after.prCount)).toBe(0);
    });

    it('leaves the PR processable on a later run once the award succeeds', async () => {
        mockAwardPoints.mockRejectedValueOnce(new Error('transient'));
        await expect(processSingleMergedPR({
            number: 7002, title: 'retried PR', username: 'compensated',
            mergedAt: '2026-08-19T10:00:00Z', labels: []
        })).rejects.toThrow('transient');

        mockAwardPoints.mockResolvedValue({ points: 40 });
        const result = await processSingleMergedPR({
            number: 7002, title: 'retried PR', username: 'compensated',
            mergedAt: '2026-08-19T10:00:00Z', labels: []
        });

        expect(result.processed).toBe(true);
        expect(await prisma.processedPR.count({ where: { prNumber: BigInt(7002) } })).toBe(1);
        const after = await prisma.contributor.findUnique({ where: { username: 'compensated' } });
        expect(Number(after.prCount)).toBe(1);
    });

    it('rolls back the review claim and counter when awarding review points fails', async () => {
        mockAwardReviewPoints.mockRejectedValue(new Error('points backend down'));

        await expect(processSingleReview({
            reviewId: 900001, username: 'compensated', submittedAt: '2026-08-19T10:00:00Z',
            prNumber: 7003, state: 'APPROVED', prAuthor: 'someone-else'
        })).rejects.toThrow('points backend down');

        const after = await prisma.contributor.findUnique({ where: { username: 'compensated' } });
        expect(await prisma.processedReview.count({ where: { prNumber: BigInt(7003) } })).toBe(0);
        expect(Number(after.reviewCount)).toBe(0);
    });
});
