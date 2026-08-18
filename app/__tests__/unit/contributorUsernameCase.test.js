import { jest, describe, it, expect, beforeEach } from '@jest/globals';
// Static import keeps the live binding for `prisma` (setup.js assigns it in
// beforeAll). setup.js does not import @octokit/rest, so this is safe to hoist
// above the mock registration below.
import { prisma, createTestContributor } from '../setup.js';

// attributionService constructs an Octokit at module load, so the mock has to be
// registered before the dynamic import below.
const mockGetByUsername = jest.fn();
jest.unstable_mockModule('@octokit/rest', () => ({
    Octokit: jest.fn().mockImplementation(() => ({
        rest: { users: { getByUsername: mockGetByUsername } }
    }))
}));

const { resolveContributorUsername } = await import('../../services/attributionService.js');

async function seedContributor(username, createdAt) {
    return prisma.contributor.create({
        data: createTestContributor({ username, createdAt })
    });
}

describe('resolveContributorUsername', () => {
    beforeEach(() => {
        mockGetByUsername.mockReset();
    });

    it('returns the stored spelling when the login differs only by case', async () => {
        await seedContributor('cru-Luis-Rodriguez', new Date('2026-03-16T00:00:00Z'));

        // What resolveProxyAuthor hands back for a TerraBloks PR.
        await expect(resolveContributorUsername('cru-luis-rodriguez')).resolves.toBe('cru-Luis-Rodriguez');
        expect(mockGetByUsername).not.toHaveBeenCalled();
    });

    it('returns the login untouched when it already matches the stored row', async () => {
        await seedContributor('cru-Luis-Rodriguez', new Date('2026-03-16T00:00:00Z'));

        await expect(resolveContributorUsername('cru-Luis-Rodriguez')).resolves.toBe('cru-Luis-Rodriguez');
    });

    it('routes to the oldest row when a case fork already exists', async () => {
        // The state this bug left behind in production: the original row plus the
        // stray lowercase one. Both spellings must land on the row holding the
        // history, so the two stop drifting further apart.
        await seedContributor('cru-Luis-Rodriguez', new Date('2026-03-16T00:00:00Z'));
        await seedContributor('cru-luis-rodriguez', new Date('2026-06-15T00:00:00Z'));

        await expect(resolveContributorUsername('cru-luis-rodriguez')).resolves.toBe('cru-Luis-Rodriguez');
        await expect(resolveContributorUsername('CRU-LUIS-RODRIGUEZ')).resolves.toBe('cru-Luis-Rodriguez');
    });

    it('asks GitHub for the canonical casing when the contributor is new', async () => {
        mockGetByUsername.mockResolvedValue({ data: { login: 'Omicron7' } });

        await expect(resolveContributorUsername('omicron7')).resolves.toBe('Omicron7');
        expect(mockGetByUsername).toHaveBeenCalledWith({ username: 'omicron7' });
    });

    it('falls back to the given login when the GitHub lookup fails', async () => {
        mockGetByUsername.mockRejectedValue(new Error('404 Not Found'));

        await expect(resolveContributorUsername('ghost-user')).resolves.toBe('ghost-user');
    });

    it('passes empty input straight through', async () => {
        await expect(resolveContributorUsername(null)).resolves.toBeNull();
        await expect(resolveContributorUsername('')).resolves.toBe('');
        expect(mockGetByUsername).not.toHaveBeenCalled();
    });
});
