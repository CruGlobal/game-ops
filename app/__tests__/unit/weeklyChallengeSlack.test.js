import { jest, describe, it, expect, beforeEach } from '@jest/globals';

jest.unstable_mockModule('@octokit/rest', () => ({
    Octokit: jest.fn().mockImplementation(() => ({
        rest: { users: { getByUsername: jest.fn() }, pulls: { listReviews: jest.fn() } }
    }))
}));

const mockPostNewChallengesSlack = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule('../../services/slackService.js', () => ({
    postNewChallengesSlack: mockPostNewChallengesSlack,
    postQuarterlyWinnersSlack: jest.fn().mockResolvedValue(undefined)
}));

const mockPostNewChallengesDiscussion = jest.fn().mockResolvedValue(undefined);
jest.unstable_mockModule('../../services/discussionService.js', () => ({
    postNewChallengesDiscussion: mockPostNewChallengesDiscussion,
    postQuarterlyWinnersDiscussion: jest.fn().mockResolvedValue(undefined)
}));

const { generateWeeklyChallenges, createChallenge } = await import('../../services/challengeService.js');
const { ensureAppSettingsTable } = await import('../../lib/appSettings.js');

describe('new-challenge announcements', () => {
    beforeEach(async () => {
        await ensureAppSettingsTable();
        mockPostNewChallengesSlack.mockClear();
        mockPostNewChallengesDiscussion.mockClear();
    });

    it('does not post the weekly challenges to Slack', async () => {
        // Everyone is auto-enrolled, so the weekly Slack post asked nobody to do
        // anything and was noise in a shared channel.
        const generated = await generateWeeklyChallenges();

        expect(generated.length).toBeGreaterThan(0);
        expect(mockPostNewChallengesSlack).not.toHaveBeenCalled();
    });

    it('still posts the weekly challenges as one GitHub Discussion', async () => {
        const generated = await generateWeeklyChallenges();

        expect(mockPostNewChallengesDiscussion).toHaveBeenCalledTimes(1);
        expect(mockPostNewChallengesDiscussion).toHaveBeenCalledWith(generated);
    });

    it('still posts a challenge created one at a time to Slack', async () => {
        const challenge = await createChallenge({
            title: 'Sprint Master',
            description: 'Merge PRs',
            type: 'pr-merge',
            target: 5,
            reward: 250,
            status: 'active',
            startDate: new Date(2026, 5, 1),
            endDate: new Date(2026, 5, 8),
            difficulty: 'medium',
            category: 'individual'
        });

        expect(mockPostNewChallengesSlack).toHaveBeenCalledTimes(1);
        expect(mockPostNewChallengesSlack).toHaveBeenCalledWith([challenge]);
    });
});
