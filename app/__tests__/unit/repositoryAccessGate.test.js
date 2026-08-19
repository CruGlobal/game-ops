import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { ensureRepositoryAccess } from '../../middleware/ensureRepositoryAccess.js';

// The middleware short-circuits when NODE_ENV === 'test', which is what keeps the rest
// of the suite working now that it fronts /api. These cases therefore drop the test
// bypass so the real branch runs.
const withoutTestBypass = (fn) => async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const prevDisable = process.env.DISABLE_AUTH;
    delete process.env.DISABLE_AUTH;
    try { await fn(); } finally {
        process.env.NODE_ENV = prev;
        if (prevDisable !== undefined) process.env.DISABLE_AUTH = prevDisable;
    }
};

const mockRes = () => {
    const res = { statusCode: null, body: null, redirectedTo: null };
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (b) => { res.body = b; return res; };
    res.send = (b) => { res.body = b; return res; };
    res.redirect = (u) => { res.redirectedTo = u; return res; };
    return res;
};

describe('ensureRepositoryAccess as the /api gate', () => {
    beforeEach(() => { jest.clearAllMocks(); });
    afterEach(() => { jest.restoreAllMocks(); });

    it('answers an unauthenticated API request with 401 JSON, not an OAuth redirect', withoutTestBypass(async () => {
        const req = { originalUrl: '/api/analytics/export?type=contributors', isAuthenticated: () => false, session: {} };
        const res = mockRes();
        const next = jest.fn();

        await ensureRepositoryAccess(req, res, next);

        expect(next).not.toHaveBeenCalled();
        expect(res.statusCode).toBe(401);
        expect(res.body).toMatchObject({ success: false });
        expect(res.redirectedTo).toBeNull(); // a redirect would be useless to an API client
    }));

    it('still redirects an unauthenticated page request to OAuth', withoutTestBypass(async () => {
        const req = { originalUrl: '/leaderboard', isAuthenticated: () => false, session: {} };
        const res = mockRes();

        await ensureRepositoryAccess(req, res, jest.fn());

        expect(res.redirectedTo).toBe('/auth/github');
        expect(req.session.returnTo).toBe('/leaderboard');
    }));

    it('reuses a cached decision instead of calling GitHub again', withoutTestBypass(async () => {
        // Without this cache, gating /api would put a GitHub round-trip in front of
        // every request and burn the hourly token budget.
        const fetchSpy = jest.spyOn(globalThis, 'fetch');
        const req = {
            originalUrl: '/api/leaderboard/all-time',
            isAuthenticated: () => true,
            user: { username: 'someone' },
            session: { repoAccessGrantedAt: Date.now() }
        };
        const next = jest.fn();

        await ensureRepositoryAccess(req, mockRes(), next);

        expect(next).toHaveBeenCalled();
        expect(fetchSpy).not.toHaveBeenCalled();
    }));

    it('does not honour a cached decision once it has expired', withoutTestBypass(async () => {
        const req = {
            originalUrl: '/api/leaderboard/all-time',
            isAuthenticated: () => true,
            user: { username: 'someone' },
            session: { repoAccessGrantedAt: Date.now() - (16 * 60 * 1000) }
        };
        const next = jest.fn();
        // No GitHub token configured here, so the live check fails closed rather than
        // silently passing on a stale grant.
        await ensureRepositoryAccess(req, mockRes(), next);

        expect(next).not.toHaveBeenCalled();
    }));
});
