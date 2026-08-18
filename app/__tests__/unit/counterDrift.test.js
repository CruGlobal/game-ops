import { jest, describe, it, expect, beforeEach } from '@jest/globals';
// Static import keeps the live binding for `prisma` (setup.js assigns it in
// beforeAll). setup.js does not import @octokit/rest, so this is safe to hoist
// above the mock registration below.
import { prisma, createTestContributor } from '../setup.js';

// contributorService and its dependencies construct an Octokit at module load.
const mockGetByUsername = jest.fn();
jest.unstable_mockModule('@octokit/rest', () => ({
    Octokit: jest.fn().mockImplementation(() => ({
        rest: {
            users: { getByUsername: mockGetByUsername },
            pulls: { listCommits: jest.fn().mockResolvedValue({ data: [] }) }
        }
    }))
}));

const { processSingleMergedPR } = await import('../../services/contributorService.js');

const PR = {
    number: 4242,
    title: 'race the cron',
    username: 'racer',
    mergedAt: '2026-08-18T12:00:00Z',
    labels: []
};

describe('counter / processed-row consistency', () => {
    beforeEach(async () => {
        // Deliberately slow. The old path called GitHub from inside
        // updateContributor *before* writing the processed-row, so this delay holds
        // both racers in that window with the counter already committed to being
        // bumped and neither row written yet — which is exactly the interleaving the
        // drift needs. Resolving instantly lets the two calls accidentally serialise
        // and the race never happens.
        mockGetByUsername.mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 50));
            return { data: { login: 'racer', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' } };
        });
        await prisma.contributor.create({
            data: createTestContributor({ username: 'racer', prCount: BigInt(0), reviewCount: BigInt(0) })
        });
    });

    it('increments prCount exactly once for a merged PR', async () => {
        const result = await processSingleMergedPR(PR);

        expect(result.processed).toBe(true);
        const contributor = await prisma.contributor.findUnique({ where: { username: 'racer' } });
        expect(Number(contributor.prCount)).toBe(1);
        expect(await prisma.processedPR.count({ where: { prNumber: BigInt(PR.number) } })).toBe(1);
    });

    it('leaves no orphan increment when two workers race for the same PR', async () => {
        // The already-processed check is a read, so both callers pass it and both go
        // on to write. Before the claim-before-increment reorder, the loser had
        // already bumped prCount by the time it hit P2002 and bailed out, leaving a
        // counter one ahead of the processed-row table — the drift that
        // /api/admin/fix-duplicates exists to mop up.
        const results = await Promise.all([
            processSingleMergedPR(PR),
            processSingleMergedPR(PR)
        ]);

        expect(results.filter(r => r.processed)).toHaveLength(1);
        expect(results.some(r => ['duplicate', 'duplicate_concurrent'].includes(r.reason))).toBe(true);

        const contributor = await prisma.contributor.findUnique({ where: { username: 'racer' } });
        const rows = await prisma.processedPR.count({ where: { prNumber: BigInt(PR.number) } });

        expect(rows).toBe(1);
        expect(Number(contributor.prCount)).toBe(1); // was 2 before the fix
        expect(Number(contributor.prCount)).toBe(rows);
    });
});
