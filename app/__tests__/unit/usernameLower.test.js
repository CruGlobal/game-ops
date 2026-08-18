import { jest, describe, it, expect, beforeEach } from '@jest/globals';
// Static import keeps the live binding for `prisma` (setup.js assigns it in
// beforeAll). setup.js does not import @octokit/rest, so this is safe to hoist
// above the mock registration below.
import { prisma, createTestContributor } from '../setup.js';

const mockGetByUsername = jest.fn();
jest.unstable_mockModule('@octokit/rest', () => ({
    Octokit: jest.fn().mockImplementation(() => ({
        rest: { users: { getByUsername: mockGetByUsername } }
    }))
}));

const { ensureContributor } = await import('../../services/contributorService.js');

describe('case-insensitive contributor uniqueness', () => {
    beforeEach(() => {
        mockGetByUsername.mockResolvedValue({
            data: { login: 'Cru-Test-User', avatar_url: 'https://avatars.githubusercontent.com/u/1?v=4' }
        });
    });

    it('stores a lowercased key when creating a contributor', async () => {
        const created = await ensureContributor('Cru-Test-User');

        expect(created.username).toBe('Cru-Test-User');
        expect(created.usernameLower).toBe('cru-test-user');
    });

    it('reuses the existing row rather than creating a second one', async () => {
        await ensureContributor('Cru-Test-User');
        const again = await ensureContributor('Cru-Test-User');

        expect(await prisma.contributor.count()).toBe(1);
        expect(again.usernameLower).toBe('cru-test-user');
    });

    it('rejects a case-variant row at the database level', async () => {
        // The guarantee that does not depend on application code remembering to
        // normalise. `username` alone would happily accept both spellings.
        await prisma.contributor.create({
            data: createTestContributor({ username: 'Cru-Test-User', usernameLower: 'cru-test-user' })
        });

        await expect(
            prisma.contributor.create({
                data: createTestContributor({ username: 'cru-test-user', usernameLower: 'cru-test-user' })
            })
        ).rejects.toMatchObject({ code: 'P2002' });

        expect(await prisma.contributor.count()).toBe(1);
    });
});
