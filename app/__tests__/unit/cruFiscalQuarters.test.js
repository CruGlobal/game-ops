import { jest, describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import {
    getCurrentQuarter,
    getQuarterDateRange,
    checkAndResetIfNewQuarter,
    recomputeHallOfFame,
    recomputeHallOfFameAll,
    setActiveQuarter
} from '../../services/quarterlyService.js';
import { postQuarterlyWinnersSlack } from '../../services/slackService.js';
import contributorRoutes from '../../routes/contributorRoutes.js';
import { prisma, createTestContributor } from '../setup.js';

// Cru retired tertiles. The 'tertile' system runs tertiles through Nov 30, 2026
// and Cru's fiscal quarters from Dec 1, 2026 (FY Sep–Aug, named by the year it
// ends in: Q1 Sep–Nov, Q2 Dec–Feb, Q3 Mar–May, Q4 Jun–Aug), matching Bills.

// Fake only Date: Prisma's pool and supertest still need real timers.
const REAL_TIMERS = [
    'hrtime', 'nextTick', 'performance', 'queueMicrotask',
    'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
    'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'
];
function setNow(iso) {
    jest.useFakeTimers({ now: new Date(iso), doNotFake: REAL_TIMERS });
}

async function seedTertileConfig(extra = {}) {
    await prisma.quarterSettings.create({
        data: { id: 'quarter-config', systemType: 'tertile', q1StartMonth: 10, ...extra }
    });
}

async function seedContributorWithHistory(username, { prs, at, ...overrides }) {
    const contributor = await prisma.contributor.create({
        data: createTestContributor({ username, avatarUrl: `https://github.com/${username}.png`, ...overrides })
    });
    await prisma.pointHistory.createMany({
        data: Array.from({ length: prs }, () => ({
            contributorId: contributor.id, points: BigInt(10), reason: 'PR Merged', timestamp: at
        }))
    });
}

async function cleanup() {
    await prisma.pointHistory.deleteMany({});
    await prisma.quarterlyAward.deleteMany({});
    await prisma.quarterlyWinner.deleteMany({});
    await prisma.quarterSettings.deleteMany({});
    await prisma.contributor.deleteMany({});
}

describe('tertile system after Cru retired tertiles (Dec 1, 2026)', () => {
    beforeEach(cleanup);

    afterEach(async () => {
        jest.useRealTimers();
        await cleanup();
    });

    afterAll(async () => {
        await prisma.$disconnect();
    });

    describe('getCurrentQuarter', () => {
        it.each([
            ['2026-11-30T23:59:59.999Z', '2027-T1'],
            ['2026-12-01T00:00:00.000Z', '2027-Q2'],
            ['2027-02-28T12:00:00.000Z', '2027-Q2'],
            ['2027-03-01T00:00:00.000Z', '2027-Q3'],
            ['2027-06-15T12:00:00.000Z', '2027-Q4'],
            ['2027-09-01T00:00:00.000Z', '2028-Q1']
        ])('at %s is %s', async (now, expected) => {
            await seedTertileConfig();
            setNow(now);

            expect(await getCurrentQuarter()).toBe(expected);
        });

        it('leaves the other systems alone after the switch', async () => {
            await prisma.quarterSettings.create({
                data: { id: 'quarter-config', systemType: 'calendar', q1StartMonth: 1 }
            });
            setNow('2027-01-15T12:00:00.000Z');

            expect(await getCurrentQuarter()).toBe('2027-Q1');
        });
    });

    describe('getQuarterDateRange', () => {
        const iso = (range) => [range.start.toISOString(), range.end.toISOString()];

        it('ends the last tertile (2027-T1) on Nov 30, 2026', async () => {
            await seedTertileConfig();

            expect(iso(await getQuarterDateRange('2027-T1')))
                .toEqual(['2026-10-01T00:00:00.000Z', '2026-11-30T23:59:59.999Z']);
        });

        it('reads Q labels as Cru fiscal quarters named by the year the fiscal year ends', async () => {
            await seedTertileConfig();

            expect(iso(await getQuarterDateRange('2027-Q2')))
                .toEqual(['2026-12-01T00:00:00.000Z', '2027-02-28T23:59:59.999Z']);
            expect(iso(await getQuarterDateRange('2027-Q3')))
                .toEqual(['2027-03-01T00:00:00.000Z', '2027-05-31T23:59:59.999Z']);
            expect(iso(await getQuarterDateRange('2027-Q4')))
                .toEqual(['2027-06-01T00:00:00.000Z', '2027-08-31T23:59:59.999Z']);
            expect(iso(await getQuarterDateRange('2028-Q1')))
                .toEqual(['2027-09-01T00:00:00.000Z', '2027-11-30T23:59:59.999Z']);
        });
    });

    describe('daily rollover on Dec 1, 2026', () => {
        it('closes 2027-T1 with Oct–Nov activity only and opens 2027-Q2', async () => {
            await seedTertileConfig({ activeQuarter: '2027-T1' });
            await seedContributorWithHistory('nov-champ', { prs: 12, at: new Date('2026-11-20T12:00:00Z') });
            await seedContributorWithHistory('dec-early', { prs: 20, at: new Date('2026-12-01T00:10:00Z') });
            setNow('2026-12-01T00:30:00.000Z');

            const result = await checkAndResetIfNewQuarter();

            expect(result.oldQuarter).toBe('2027-T1');
            expect(result.newQuarter).toBe('2027-Q2');

            const archived = await prisma.quarterlyWinner.findUnique({
                where: { quarter_category: { quarter: '2027-T1', category: 'general' } }
            });
            expect(archived.winner.username).toBe('nov-champ');
            expect(archived.top3.map(t => t.username)).not.toContain('dec-early');
            expect(archived.quarterEnd.toISOString()).toBe('2026-11-30T23:59:59.999Z');

            const settings = await prisma.quarterSettings.findUnique({ where: { id: 'quarter-config' } });
            expect(settings.activeQuarter).toBe('2027-Q2');

            expect(await prisma.quarterlyAward.findUnique({ where: { quarter: '2027-T1' } })).not.toBeNull();
            const paid = await prisma.contributor.findUnique({ where: { username: 'nov-champ' } });
            const notPaid = await prisma.contributor.findUnique({ where: { username: 'dec-early' } });
            expect(Number(paid.totalBillsAwarded)).toBe(5);
            expect(Number(notPaid.totalBillsAwarded)).toBe(0);
            expect(notPaid.quarterlyStats).toMatchObject({ currentQuarter: '2027-Q2', pointsThisQuarter: 200 });
        });

        it('still pays 2027-T1 when the admin recompute already wrote its Hall of Fame row', async () => {
            await seedTertileConfig({ activeQuarter: '2027-T1' });
            await seedContributorWithHistory('nov-champ', { prs: 12, at: new Date('2026-11-20T12:00:00Z') });
            setNow('2026-11-25T12:00:00.000Z');
            await recomputeHallOfFame(); // the admin button with no quarter typed in
            setNow('2026-12-01T00:30:00.000Z');

            await checkAndResetIfNewQuarter();

            expect(await prisma.quarterlyAward.findUnique({ where: { quarter: '2027-T1' } })).not.toBeNull();
            const paid = await prisma.contributor.findUnique({ where: { username: 'nov-champ' } });
            expect(Number(paid.totalBillsAwarded)).toBe(5);
        });

        it('does not pay 2027-T1 twice when a rollover is retried', async () => {
            await seedTertileConfig({ activeQuarter: '2027-T1' });
            await seedContributorWithHistory('nov-champ', { prs: 12, at: new Date('2026-11-20T12:00:00Z') });
            setNow('2026-12-01T00:30:00.000Z');

            await checkAndResetIfNewQuarter();
            await setActiveQuarter('2027-T1'); // as if the first run died before recording Q2
            const retry = await checkAndResetIfNewQuarter();

            expect(retry.alreadyArchived).toBe(true);
            const paid = await prisma.contributor.findUnique({ where: { username: 'nov-champ' } });
            expect(Number(paid.totalBillsAwarded)).toBe(5);
        });

        it('pays DevOps participation from 2027-T1 history, not the live cache', async () => {
            await seedTertileConfig({ activeQuarter: '2027-T1' });
            const nov = new Date('2026-11-20T12:00:00Z');
            // Earned it in Oct–Nov, but a Dec 1 event already rolled the cache to Q2.
            await seedContributorWithHistory('ops-earned', {
                prs: 50, at: nov, isDevOps: true,
                quarterlyStats: { currentQuarter: '2027-Q2', prsThisQuarter: 1, reviewsThisQuarter: 0, pointsThisQuarter: 10 }
            });
            // Cache says 60 (old code kept adding December to 2027-T1), history says 30.
            await seedContributorWithHistory('ops-short', {
                prs: 30, at: nov, isDevOps: true,
                quarterlyStats: { currentQuarter: '2027-T1', prsThisQuarter: 60, reviewsThisQuarter: 0, pointsThisQuarter: 600 }
            });
            setNow('2026-12-01T00:30:00.000Z');

            const result = await checkAndResetIfNewQuarter();

            expect(result.billsAwarded.devOpsAwards.map(a => a.username)).toEqual(['ops-earned']);
            const earned = await prisma.contributor.findUnique({ where: { username: 'ops-earned' } });
            const short = await prisma.contributor.findUnique({ where: { username: 'ops-short' } });
            expect(Number(earned.totalBillsAwarded)).toBe(1);
            expect(Number(short.totalBillsAwarded)).toBe(0);
        });
    });

    describe('recomputeHallOfFameAll', () => {
        it('rebuilds the last tertile and the first quarter as separate periods', async () => {
            await seedTertileConfig();
            await seedContributorWithHistory('nov-champ', { prs: 12, at: new Date('2026-11-20T12:00:00Z') });
            await seedContributorWithHistory('jan-champ', { prs: 15, at: new Date('2027-01-20T12:00:00Z') });
            setNow('2027-03-10T12:00:00.000Z');

            await recomputeHallOfFameAll();

            const rows = await prisma.quarterlyWinner.findMany({
                where: { category: 'general' },
                orderBy: { quarterStart: 'asc' }
            });
            expect(rows.map(r => [r.quarter, r.winner.username])).toEqual([
                ['2027-T1', 'nov-champ'],
                ['2027-Q2', 'jan-champ']
            ]);
        });

        it('with no history to rebuild from, keeps completed tertile and quarter rows', async () => {
            await seedTertileConfig();
            setNow('2027-04-15T12:00:00.000Z');
            for (const quarter of ['2027-T1', '2027-Q2']) {
                const { start, end } = await getQuarterDateRange(quarter);
                await prisma.quarterlyWinner.create({
                    data: {
                        quarter,
                        category: 'general',
                        year: 2027,
                        quarterNumber: Number(quarter.slice(-1)),
                        quarterStart: start,
                        quarterEnd: end,
                        winner: { username: 'kept' },
                        top3: [],
                        totalParticipants: 1,
                        archivedDate: new Date()
                    }
                });
            }

            await recomputeHallOfFameAll();

            const kept = await prisma.quarterlyWinner.findMany({ orderBy: { quarterStart: 'asc' } });
            expect(kept.map(r => r.quarter)).toEqual(['2027-T1', '2027-Q2']);
        });
    });

    describe('GET /api/quarter-info', () => {
        const app = express();
        app.use(express.json());
        app.use('/api', contributorRoutes);

        it.each([
            ['2026-11-15T12:00:00.000Z', '2027-T1', 'Tertile'],
            ['2026-12-15T12:00:00.000Z', '2027-Q2', 'Quarter']
        ])('at %s reports %s as a %s', async (now, quarter, periodLabel) => {
            await seedTertileConfig();
            setNow(now);

            const response = await request(app).get('/api/quarter-info').expect(200);

            expect(response.body.currentQuarter).toBe(quarter);
            expect(response.body.periodLabel).toBe(periodLabel);
        });
    });

    describe('Slack winners post', () => {
        const realFetch = global.fetch;
        let fetchMock;

        beforeEach(() => {
            fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' });
            global.fetch = fetchMock;
        });

        afterEach(() => {
            global.fetch = realFetch;
        });

        it.each([
            ['2027-T1', '2027-T1 Tertile Results'],
            ['2027-Q2', '2027-Q2 Quarter Results']
        ])('names %s by its own kind of period', async (quarter, header) => {
            await seedTertileConfig({
                enableSlackNotifications: true,
                slackWebhookUrl: 'https://hooks.slack.test/services/T000/B000/x'
            });

            await postQuarterlyWinnersSlack(quarter, { nonDevOpsAwards: [], devOpsAwards: [] }, {
                winner: { username: 'champ', pointsThisQuarter: 100 }, top3: [], totalParticipants: 1
            });

            expect(fetchMock).toHaveBeenCalledTimes(1);
            const { blocks } = JSON.parse(fetchMock.mock.calls[0][1].body);
            expect(blocks[0].text.text).toBe(header);
            // The link opens the period now running, which is not the one just closed.
            const link = blocks.find(b => b.text?.text?.includes('/leaderboard?tab=quarterly'));
            expect(link.text.text).not.toMatch(/Tertile|Quarter/);
        });
    });
});
