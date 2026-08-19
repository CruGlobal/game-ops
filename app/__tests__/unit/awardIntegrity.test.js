import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { prisma, createTestContributor } from '../setup.js';

jest.unstable_mockModule('@octokit/rest', () => ({
    Octokit: jest.fn().mockImplementation(() => ({
        rest: { users: { getByUsername: jest.fn() }, pulls: { listReviews: jest.fn(), list: jest.fn() } }
    }))
}));

const { awardAchievement } = await import('../../services/achievementService.js');
const { processWebhookEvent } = await import('../../services/webhookService.js');
const { CRON_TASK_DEFAULTS, isTaskEnabled, setCronTaskSetting, ensureAppSettingsTable } =
    await import('../../lib/appSettings.js');

const ACHIEVEMENT = {
    id: 'first-pr', name: 'First PR', description: 'Merged a first PR',
    category: 'milestone', points: 50
};

describe('award integrity', () => {
    let contributor;

    beforeEach(async () => {
        contributor = await prisma.contributor.create({
            data: createTestContributor({ username: 'award-target', totalPoints: BigInt(0), allTimePoints: BigInt(0) })
        });
    });

    it('pays an achievement bonus exactly once', async () => {
        await awardAchievement(contributor, ACHIEVEMENT);

        const after = await prisma.contributor.findUnique({ where: { id: contributor.id } });
        expect(Number(after.allTimePoints)).toBe(50);
        expect(await prisma.achievement.count({ where: { contributorId: contributor.id } })).toBe(1);
    });

    it('does not pay a second bonus when the achievement is already earned', async () => {
        // The service checks an earned-set first, but that is a read — two concurrent
        // events can both pass it. The unique constraint is the real arbiter, and
        // losing that race must not pay again.
        await awardAchievement(contributor, ACHIEVEMENT);
        const result = await awardAchievement(contributor, ACHIEVEMENT);

        expect(result).toBeNull();
        const after = await prisma.contributor.findUnique({ where: { id: contributor.id } });
        expect(Number(after.allTimePoints)).toBe(50); // not 100
        expect(await prisma.achievement.count({ where: { contributorId: contributor.id } })).toBe(1);
        expect(await prisma.pointHistory.count({ where: { contributorId: contributor.id } })).toBe(1);
    });

    it('leaves no achievement row behind if the award cannot be paid', async () => {
        // Both halves share one transaction, so a failure cannot strand an
        // achievement row that the earned-set would then treat as paid.
        await expect(
            awardAchievement({ id: 'does-not-exist', username: 'ghost' }, ACHIEVEMENT)
        ).rejects.toBeDefined();

        expect(await prisma.achievement.count({ where: { achievementId: ACHIEVEMENT.id } })).toBe(0);
    });
});

describe('webhook redelivery after a failure', () => {
    it('does not treat a failed delivery as already processed', async () => {
        // GitHub reuses the delivery id when it redelivers. Refusing it as a duplicate
        // meant a delivery that failed mid-processing could never be recovered by a
        // webhook — only by the catch-up cron, which is off by default.
        const deliveryId = 'delivery-failed-1';
        await prisma.webhookEvent.create({
            data: { deliveryId, eventType: 'pull_request', action: 'closed', payload: {}, status: 'failed' }
        });

        const result = await processWebhookEvent(deliveryId, 'pull_request', {
            action: 'opened', pull_request: { number: 1, merged: false }
        });

        expect(result.reason).not.toMatch(/duplicate/i);
        // and the row is updated in place rather than colliding on the unique deliveryId
        expect(await prisma.webhookEvent.count({ where: { deliveryId } })).toBe(1);
    });

    it('still refuses a delivery that genuinely succeeded', async () => {
        const deliveryId = 'delivery-ok-1';
        await prisma.webhookEvent.create({
            data: { deliveryId, eventType: 'pull_request', action: 'closed', payload: {}, status: 'processed' }
        });

        const result = await processWebhookEvent(deliveryId, 'pull_request', {
            action: 'closed', pull_request: { number: 2, merged: true }
        });

        expect(JSON.stringify(result)).toMatch(/duplicate/i);
    });
});

describe('streakCheck cron registration', () => {
    it('is a known task, so the gate can pass and the toggle cannot throw', async () => {
        // server.js gates verifyStreaks on this key. Absent from the defaults it
        // resolved to undefined -> disabled forever, and the admin toggle threw
        // "Unknown task", so it could not be enabled either.
        expect(CRON_TASK_DEFAULTS).toHaveProperty('streakCheck');

        await ensureAppSettingsTable();
        await expect(setCronTaskSetting('streakCheck', true)).resolves.not.toThrow();
        await expect(isTaskEnabled('streakCheck')).resolves.toBe(true);
    });
});
