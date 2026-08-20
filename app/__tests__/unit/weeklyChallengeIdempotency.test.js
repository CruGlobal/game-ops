import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { prisma } from '../setup.js';

jest.unstable_mockModule('@octokit/rest', () => ({
    Octokit: jest.fn().mockImplementation(() => ({
        rest: { users: { getByUsername: jest.fn() }, pulls: { listReviews: jest.fn() } }
    }))
}));

const { generateWeeklyChallenges } = await import('../../services/challengeService.js');
const { ensureAppSettingsTable } = await import('../../lib/appSettings.js');

describe('weekly challenge generation is claimed once per week', () => {
    beforeEach(async () => {
        await ensureAppSettingsTable();
    });

    it('generates a set of challenges on the first run', async () => {
        const generated = await generateWeeklyChallenges();

        expect(generated.length).toBeGreaterThan(0);
        expect(await prisma.challenge.count({ where: { challengeCategory: 'weekly' } }))
            .toBe(generated.length);
    });

    it('does not generate a second set when triggered again in the same week', async () => {
        // Two triggers exist — the Monday cron and the MCP generate_weekly_challenges
        // tool. Duplicated challenges carry distinct ids, so a participant could
        // complete both copies and be paid the reward twice.
        const first = await generateWeeklyChallenges();
        const second = await generateWeeklyChallenges();

        expect(first.length).toBeGreaterThan(0);
        expect(second).toEqual([]);
        expect(await prisma.challenge.count({ where: { challengeCategory: 'weekly' } }))
            .toBe(first.length);
    });

    it('does not double-generate when two triggers fire concurrently', async () => {
        const [a, b] = await Promise.all([
            generateWeeklyChallenges(),
            generateWeeklyChallenges()
        ]);

        // Exactly one caller wins the claim; the insert is the arbiter, not a prior read.
        const winners = [a, b].filter(r => r.length > 0);
        expect(winners).toHaveLength(1);
        expect(await prisma.challenge.count({ where: { challengeCategory: 'weekly' } }))
            .toBe(winners[0].length);
    });
});
