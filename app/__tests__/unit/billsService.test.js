import { jest, describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
// Static import keeps the live binding for `prisma` (setup.js assigns it in
// beforeAll). setup.js does not import @octokit/rest, so this is safe to hoist
// above the mock registration below.
import { prisma, createTestContributor } from '../setup.js';

// Mock the GitHub client BEFORE importing the service (billsService constructs
// an Octokit at module load, like devOpsTeamService).
const mockGetByUsername = jest.fn();
jest.unstable_mockModule('@octokit/rest', () => ({
    Octokit: jest.fn().mockImplementation(() => ({
        rest: { users: { getByUsername: mockGetByUsername } }
    }))
}));

const { resolveBillsEmail, sendTertileWinnerBills, retryBillGift } = await import('../../services/billsService.js');

const QUARTER = '2026-T2';

// Build a fetch Response-like object.
function fetchResponse(status, jsonBody) {
    return {
        status,
        ok: status >= 200 && status < 300,
        json: async () => jsonBody,
        text: async () => JSON.stringify(jsonBody)
    };
}

async function seedSettings(overrides = {}) {
    return prisma.quarterSettings.create({
        data: {
            id: 'quarter-config',
            systemType: 'tertile',
            q1StartMonth: 10,
            enableBillsGifts: true,
            ...overrides
        }
    });
}

async function seedContributor(overrides = {}) {
    return prisma.contributor.create({
        data: createTestContributor(overrides)
    });
}

function nonDevOpsAwards() {
    return {
        nonDevOpsAwards: [
            { username: 'first', rank: 1, type: 'Vonette', value: 5, points: 500 },
            { username: 'second', rank: 2, type: 'Bill', value: 1, points: 300 }
        ],
        devOpsAwards: []
    };
}

describe('billsService', () => {
    let fetchMock;

    beforeEach(() => {
        fetchMock = jest.fn();
        global.fetch = fetchMock;
        mockGetByUsername.mockReset();
        delete process.env.BILLS_API_KEY;
        delete process.env.BILLS_API_URL;
    });

    afterEach(async () => {
        delete process.env.BILLS_API_KEY;
        delete process.env.BILLS_API_URL;
        await prisma.billGift.deleteMany({});
        await prisma.quarterlyAward.deleteMany({});
        await prisma.quarterSettings.deleteMany({});
        await prisma.contributor.deleteMany({});
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    describe('sendTertileWinnerBills — guards', () => {
        it('does nothing when the toggle is off (no fetch, no rows)', async () => {
            await seedSettings({ enableBillsGifts: false });
            process.env.BILLS_API_KEY = 'bk_test';
            await seedContributor({ username: 'first', billsEmail: 'first@cru.org', billsEmailSource: 'admin' });

            const summary = await sendTertileWinnerBills(QUARTER, nonDevOpsAwards());

            expect(fetchMock).not.toHaveBeenCalled();
            expect(summary).toEqual({ sent: 0, pendingEmail: 0, failed: 0 });
            expect(await prisma.billGift.count()).toBe(0);
        });

        it('does nothing when enabled but BILLS_API_KEY is missing', async () => {
            await seedSettings({ enableBillsGifts: true });
            await seedContributor({ username: 'first', billsEmail: 'first@cru.org', billsEmailSource: 'admin' });

            const summary = await sendTertileWinnerBills(QUARTER, nonDevOpsAwards());

            expect(fetchMock).not.toHaveBeenCalled();
            expect(summary.sent).toBe(0);
            expect(await prisma.billGift.count()).toBe(0);
        });
    });

    describe('email resolution', () => {
        beforeEach(async () => {
            await seedSettings({ enableBillsGifts: true });
            process.env.BILLS_API_KEY = 'bk_test';
        });

        it('uses a stored billsEmail as-is without calling GitHub', async () => {
            await seedContributor({ username: 'first', billsEmail: 'contractor@example.com', billsEmailSource: 'admin' });
            fetchMock.mockResolvedValue(fetchResponse(201, { gift: { id: 'g1' } }));

            const email = await resolveBillsEmail('first');

            expect(email).toBe('contractor@example.com');
            expect(mockGetByUsername).not.toHaveBeenCalled();
        });

        it('persists a cru.org GitHub profile email with source "github"', async () => {
            await seedContributor({ username: 'first' });
            mockGetByUsername.mockResolvedValue({ data: { email: 'First.Last@Cru.org' } });

            const email = await resolveBillsEmail('first');

            expect(email).toBe('First.Last@Cru.org');
            const c = await prisma.contributor.findUnique({ where: { username: 'first' } });
            expect(c.billsEmail).toBe('First.Last@Cru.org');
            expect(c.billsEmailSource).toBe('github');
        });

        it('rejects a non-cru.org GitHub email (returns null, does not persist)', async () => {
            await seedContributor({ username: 'first' });
            mockGetByUsername.mockResolvedValue({ data: { email: 'someone@gmail.com' } });

            const email = await resolveBillsEmail('first');

            expect(email).toBeNull();
            const c = await prisma.contributor.findUnique({ where: { username: 'first' } });
            expect(c.billsEmail).toBeNull();
        });

        it('returns null on a GitHub API error', async () => {
            await seedContributor({ username: 'first' });
            mockGetByUsername.mockRejectedValue(new Error('boom'));

            const email = await resolveBillsEmail('first');
            expect(email).toBeNull();
        });

        it('leaves a winner pending_email when the GitHub email is non-cru.org', async () => {
            await seedContributor({ username: 'first' });
            mockGetByUsername.mockResolvedValue({ data: { email: 'someone@gmail.com' } });

            const summary = await sendTertileWinnerBills(QUARTER, {
                nonDevOpsAwards: [{ username: 'first', rank: 1, value: 5, points: 500 }],
                devOpsAwards: []
            });

            expect(fetchMock).not.toHaveBeenCalled();
            expect(summary.pendingEmail).toBe(1);
            const row = await prisma.billGift.findUnique({ where: { quarter_username: { quarter: QUARTER, username: 'first' } } });
            expect(row.status).toBe('pending_email');
            expect(row.attempts).toBe(0);
        });

        it('leaves a winner pending_email when GitHub lookup errors', async () => {
            await seedContributor({ username: 'first' });
            mockGetByUsername.mockRejectedValue(new Error('rate limited'));

            await sendTertileWinnerBills(QUARTER, {
                nonDevOpsAwards: [{ username: 'first', rank: 1, value: 5, points: 500 }],
                devOpsAwards: []
            });

            expect(fetchMock).not.toHaveBeenCalled();
            const row = await prisma.billGift.findUnique({ where: { quarter_username: { quarter: QUARTER, username: 'first' } } });
            expect(row.status).toBe('pending_email');
        });
    });

    describe('sendTertileWinnerBills — delivery', () => {
        beforeEach(async () => {
            await seedSettings({ enableBillsGifts: true });
            process.env.BILLS_API_KEY = 'bk_secret';
        });

        it('sends a gift and records it with the correct request body/headers', async () => {
            await seedContributor({ username: 'first', billsEmail: 'first@cru.org', billsEmailSource: 'admin' });
            fetchMock.mockResolvedValue(fetchResponse(201, { gift: { id: 'gift-123' } }));

            const summary = await sendTertileWinnerBills(QUARTER, {
                nonDevOpsAwards: [{ username: 'first', rank: 1, value: 5, points: 500 }],
                devOpsAwards: []
            });

            expect(summary.sent).toBe(1);

            const row = await prisma.billGift.findUnique({ where: { quarter_username: { quarter: QUARTER, username: 'first' } } });
            expect(row.status).toBe('sent');
            expect(row.billsGiftId).toBe('gift-123');
            expect(row.email).toBe('first@cru.org');
            expect(row.sentAt).not.toBeNull();
            expect(row.attempts).toBe(1);
            expect(row.error).toBeNull();

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [url, options] = fetchMock.mock.calls[0];
            expect(url).toBe('https://bills.ustech.app/api/v1/gifts');
            expect(options.method).toBe('POST');
            expect(options.headers.Authorization).toBe('Bearer bk_secret');
            expect(options.headers['Idempotency-Key']).toMatch(/^game-ops:2026-T2:first:[0-9a-f]{8}$/);
            const body = JSON.parse(options.body);
            expect(body.toEmail).toBe('first@cru.org');
            expect(body.amount).toBe(5);
            expect(body.anonymous).toBe(false);
            expect(body.private).toBe(false);
            expect(typeof body.reason).toBe('string');
            expect(body.reason.length).toBeGreaterThan(0);
        });

        it('honours BILLS_API_URL given as a bare origin', async () => {
            process.env.BILLS_API_URL = 'https://bills-stage.ustech.app';
            await seedContributor({ username: 'first', billsEmail: 'first@cru.org', billsEmailSource: 'admin' });
            fetchMock.mockResolvedValue(fetchResponse(201, { gift: { id: 'g' } }));

            await sendTertileWinnerBills(QUARTER, {
                nonDevOpsAwards: [{ username: 'first', rank: 1, value: 5, points: 500 }],
                devOpsAwards: []
            });

            expect(fetchMock.mock.calls[0][0]).toBe('https://bills-stage.ustech.app/api/v1/gifts');
        });

        it('records a failure (code: message) but still processes the other winners', async () => {
            await seedContributor({ username: 'first', billsEmail: 'first@cru.org', billsEmailSource: 'admin' });
            await seedContributor({ username: 'second', billsEmail: 'second@cru.org', billsEmailSource: 'admin' });

            fetchMock
                .mockResolvedValueOnce(fetchResponse(409, { error: { code: 'insufficient_giftable', message: 'not enough giftable bills' } }))
                .mockResolvedValueOnce(fetchResponse(201, { gift: { id: 'gift-2' } }));

            const summary = await sendTertileWinnerBills(QUARTER, nonDevOpsAwards());

            expect(summary).toEqual({ sent: 1, pendingEmail: 0, failed: 1 });

            const first = await prisma.billGift.findUnique({ where: { quarter_username: { quarter: QUARTER, username: 'first' } } });
            expect(first.status).toBe('failed');
            expect(first.error).toBe('insufficient_giftable: not enough giftable bills');
            expect(first.attempts).toBe(1);

            const second = await prisma.billGift.findUnique({ where: { quarter_username: { quarter: QUARTER, username: 'second' } } });
            expect(second.status).toBe('sent');
            expect(second.billsGiftId).toBe('gift-2');
        });

        it('skips an already-sent row (no second fetch)', async () => {
            await seedContributor({ username: 'first', billsEmail: 'first@cru.org', billsEmailSource: 'admin' });
            await prisma.billGift.create({
                data: {
                    quarter: QUARTER,
                    username: 'first',
                    rank: 1,
                    amount: 5,
                    email: 'first@cru.org',
                    reason: 'already done',
                    status: 'sent',
                    billsGiftId: 'old-gift',
                    attempts: 1,
                    sentAt: new Date()
                }
            });

            const summary = await sendTertileWinnerBills(QUARTER, {
                nonDevOpsAwards: [{ username: 'first', rank: 1, value: 5, points: 500 }],
                devOpsAwards: []
            });

            expect(fetchMock).not.toHaveBeenCalled();
            expect(summary.sent).toBe(1);
            const row = await prisma.billGift.findUnique({ where: { quarter_username: { quarter: QUARTER, username: 'first' } } });
            expect(row.billsGiftId).toBe('old-gift');
        });

        it('falls back to the stored quarterlyAward.results when billResults is empty', async () => {
            await seedContributor({ username: 'first', billsEmail: 'first@cru.org', billsEmailSource: 'admin' });
            await prisma.quarterlyAward.create({
                data: {
                    quarter: QUARTER,
                    results: {
                        nonDevOpsAwards: [{ username: 'first', rank: 1, value: 5, points: 450 }],
                        devOpsAwards: []
                    }
                }
            });
            fetchMock.mockResolvedValue(fetchResponse(201, { gift: { id: 'gift-fb' } }));

            // Simulate a re-run of awardQuarterlyBills: alreadyAwarded with empty arrays.
            const summary = await sendTertileWinnerBills(QUARTER, { alreadyAwarded: true, nonDevOpsAwards: [], devOpsAwards: [] });

            expect(summary.sent).toBe(1);
            const row = await prisma.billGift.findUnique({ where: { quarter_username: { quarter: QUARTER, username: 'first' } } });
            expect(row.status).toBe('sent');
            expect(row.billsGiftId).toBe('gift-fb');
        });

        it('never throws when fetch rejects (records the row as failed)', async () => {
            await seedContributor({ username: 'first', billsEmail: 'first@cru.org', billsEmailSource: 'admin' });
            fetchMock.mockRejectedValue(new Error('network down'));

            await expect(sendTertileWinnerBills(QUARTER, {
                nonDevOpsAwards: [{ username: 'first', rank: 1, value: 5, points: 500 }],
                devOpsAwards: []
            })).resolves.toEqual({ sent: 0, pendingEmail: 0, failed: 1 });

            const row = await prisma.billGift.findUnique({ where: { quarter_username: { quarter: QUARTER, username: 'first' } } });
            expect(row.status).toBe('failed');
            expect(row.error).toContain('network down');
        });
    });

    describe('retryBillGift', () => {
        beforeEach(async () => {
            await seedSettings({ enableBillsGifts: true });
            process.env.BILLS_API_KEY = 'bk_secret';
        });

        it('sends a pending_email row once the admin sets an email', async () => {
            await seedContributor({ username: 'first', billsEmail: 'admin.set@cru.org', billsEmailSource: 'admin' });
            const row = await prisma.billGift.create({
                data: { quarter: QUARTER, username: 'first', rank: 1, amount: 5, reason: 'r', status: 'pending_email' }
            });
            fetchMock.mockResolvedValue(fetchResponse(201, { gift: { id: 'gift-retry' } }));

            const updated = await retryBillGift(row.id);

            expect(updated.status).toBe('sent');
            expect(updated.billsGiftId).toBe('gift-retry');
            expect(updated.email).toBe('admin.set@cru.org');
        });

        it('uses a different Idempotency-Key when the email changes', async () => {
            await seedContributor({ username: 'first', billsEmail: 'a@cru.org', billsEmailSource: 'admin' });
            const row = await prisma.billGift.create({
                data: { quarter: QUARTER, username: 'first', rank: 1, amount: 5, reason: 'r', status: 'failed', attempts: 1 }
            });

            // First retry (email A) fails.
            fetchMock.mockResolvedValueOnce(fetchResponse(409, { error: { code: 'insufficient_giftable', message: 'nope' } }));
            await retryBillGift(row.id);
            const key1 = fetchMock.mock.calls[0][1].headers['Idempotency-Key'];

            // Admin corrects the email; second retry (email B) succeeds.
            await prisma.contributor.update({ where: { username: 'first' }, data: { billsEmail: 'b@cru.org' } });
            fetchMock.mockResolvedValueOnce(fetchResponse(201, { gift: { id: 'gift-b' } }));
            const updated = await retryBillGift(row.id);
            const key2 = fetchMock.mock.calls[1][1].headers['Idempotency-Key'];

            expect(key1).not.toBe(key2);
            expect(updated.status).toBe('sent');
        });

        it('throws not_found for an unknown id', async () => {
            await expect(retryBillGift('does-not-exist')).rejects.toMatchObject({ code: 'not_found' });
        });

        it('throws already_sent for a sent row', async () => {
            const row = await prisma.billGift.create({
                data: { quarter: QUARTER, username: 'first', rank: 1, amount: 5, reason: 'r', status: 'sent', billsGiftId: 'x', sentAt: new Date() }
            });
            await expect(retryBillGift(row.id)).rejects.toMatchObject({ code: 'already_sent' });
        });
    });
});
