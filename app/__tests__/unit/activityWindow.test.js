import { jest, describe, it, expect } from '@jest/globals';

jest.unstable_mockModule('@octokit/rest', () => ({
    Octokit: jest.fn().mockImplementation(() => ({ rest: { users: { getByUsername: jest.fn() } } }))
}));

// If validation lets a request through, this is what pays for it: two sequential
// GitHub calls per PR in the window, on the token everything else shares.
const mockFetchActivityData = jest.fn().mockResolvedValue({ stats: [], blocked: [] });
jest.unstable_mockModule('../services/contributorService.js', () => ({
    fetchActivityData: mockFetchActivityData,
    fetchPullRequests: jest.fn(), awardBadges: jest.fn(),
    getTopContributors: jest.fn(), getTopReviewers: jest.fn(),
    getTopContributorsDateRange: jest.fn(), getTopReviewersDateRange: jest.fn(),
    getContributorByUsername: jest.fn()
}));

const { fetchActivityController } = await import('../../controllers/contributorController.js');

const mockRes = () => {
    const res = { statusCode: 200, body: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    return res;
};

describe('activity window validation', () => {
    it('rejects a range large enough to exhaust the GitHub token', async () => {
        const res = mockRes();
        await fetchActivityController({ query: { prFrom: '1', prTo: '100000' } }, res);

        expect(res.statusCode).toBe(400);
        expect(mockFetchActivityData).not.toHaveBeenCalled();
    });

    it('rejects missing parameters instead of silently returning nothing', async () => {
        // parseInt(undefined) is NaN, and the loop `for (i = NaN; i <= NaN; i++)` never
        // runs — so this used to answer 200 with an empty result, which reads as "no
        // activity" rather than "you forgot the parameters".
        const res = mockRes();
        await fetchActivityController({ query: {} }, res);

        expect(res.statusCode).toBe(400);
        expect(mockFetchActivityData).not.toHaveBeenCalled();
    });

    it('rejects an inverted range', async () => {
        const res = mockRes();
        await fetchActivityController({ query: { prFrom: '500', prTo: '100' } }, res);
        expect(res.statusCode).toBe(400);
    });

    it('allows a window within the cap', async () => {
        const res = mockRes();
        await fetchActivityController({ query: { prFrom: '100', prTo: '150' } }, res);

        expect(res.statusCode).toBe(200);
        expect(mockFetchActivityData).toHaveBeenCalledWith(100, 150);
    });
});
