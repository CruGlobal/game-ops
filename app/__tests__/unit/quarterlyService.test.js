import { describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import {
    getQuarterConfig,
    getCurrentQuarter,
    getQuarterDateRange,
    getQuarterlyLeaderboard,
    getAllTimeLeaderboard,
    getHallOfFame,
    resetQuarterlyStats,
    archiveQuarterWinners,
    checkAndResetIfNewQuarter,
    recomputeHallOfFameAll
} from '../../services/quarterlyService.js';
import { prisma, createTestContributor } from '../setup.js';

// Quarter standings are derived from point_history, not from contributor.quarterlyStats
// (the cache the per-event path zeroes on rollover). Seed the durable rows that back
// the numbers a test asserts.
async function seedQuarterHistory(username, { prs = 0, reviews = 0, points = 0, at }) {
    const contributor = await prisma.contributor.findUnique({ where: { username } });
    const rows = [];
    for (let i = 0; i < prs; i++) {
        rows.push({ contributorId: contributor.id, points: BigInt(10), reason: 'PR Merged', timestamp: at });
    }
    for (let i = 0; i < reviews; i++) {
        rows.push({ contributorId: contributor.id, points: BigInt(5), reason: 'Review Completed', timestamp: at });
    }
    const remainder = points - (prs * 10 + reviews * 5);
    if (remainder !== 0) {
        rows.push({ contributorId: contributor.id, points: BigInt(remainder), reason: 'Challenge Completed', timestamp: at });
    }
    if (rows.length) await prisma.pointHistory.createMany({ data: rows });
}

describe('QuarterlyService', () => {
    beforeEach(async () => {
        // Clean up in correct order (no foreign key constraints here)
        await prisma.quarterlyWinner.deleteMany({});
        await prisma.quarterSettings.deleteMany({});
        await prisma.contributor.deleteMany({});
    });

    afterEach(async () => {
        // Also cleanup after each test to prevent data leaks
        await prisma.quarterlyWinner.deleteMany({});
        await prisma.quarterSettings.deleteMany({});
        await prisma.contributor.deleteMany({});
    });

    describe('getQuarterConfig', () => {
        it('should return existing quarter configuration', async () => {
            await prisma.quarterSettings.create({
                data: {
                    id: 'quarter-config',
                    systemType: 'fiscal-us',
                    q1StartMonth: 10
                }
            });

            const config = await getQuarterConfig();

            expect(config).toBeDefined();
            expect(config.systemType).toBe('fiscal-us');
            expect(config.q1StartMonth).toBe(10);
        });

        it('should create default config if none exists', async () => {
            const config = await getQuarterConfig();

            expect(config).toBeDefined();
            expect(config.systemType).toBe('tertile');
            expect(config.q1StartMonth).toBe(10);
        });
    });

    describe('getCurrentQuarter', () => {
        it('should return current quarter string', async () => {
            await prisma.quarterSettings.create({
                data: {
                    id: 'quarter-config',
                    systemType: 'calendar',
                    q1StartMonth: 1
                }
            });

            const quarter = await getCurrentQuarter();

            expect(quarter).toMatch(/^\d{4}-Q[1-4]$/);
            expect(quarter).toContain('2026');
        });

        it('should calculate quarter based on fiscal year config', async () => {
            await prisma.quarterSettings.create({
                data: {
                    id: 'quarter-config',
                    systemType: 'fiscal-us',
                    q1StartMonth: 10
                }
            });

            const quarter = await getCurrentQuarter();

            expect(quarter).toMatch(/^\d{4}-Q[1-4]$/);
        });
    });

    describe('getQuarterDateRange', () => {
        // Helper: assert a range covers [startY-startM-1 .. endY-endM-lastDay] in UTC
        const expectRange = (range, startY, startM, endY, endM) => {
            expect(range.start.getUTCFullYear()).toBe(startY);
            expect(range.start.getUTCMonth()).toBe(startM - 1);
            expect(range.start.getUTCDate()).toBe(1);
            expect(range.end.getUTCFullYear()).toBe(endY);
            expect(range.end.getUTCMonth()).toBe(endM - 1);
            // end is the last day of endM
            const lastDay = new Date(Date.UTC(endY, endM, 0)).getUTCDate();
            expect(range.end.getUTCDate()).toBe(lastDay);
            expect(range.end.getTime()).toBeGreaterThan(range.start.getTime());
        };

        it('should return calendar quarters (Q1 = Jan–Mar, Q4 = Oct–Dec)', async () => {
            await prisma.quarterSettings.create({
                data: { id: 'quarter-config', systemType: 'calendar', q1StartMonth: 1 }
            });

            expectRange(await getQuarterDateRange('2025-Q1'), 2025, 1, 2025, 3);
            expectRange(await getQuarterDateRange('2025-Q4'), 2025, 10, 2025, 12);
        });

        it('should return fiscal-us Q1 in the label year (Oct–Dec)', async () => {
            await prisma.quarterSettings.create({
                data: { id: 'quarter-config', systemType: 'fiscal-us', q1StartMonth: 10 }
            });

            expectRange(await getQuarterDateRange('2025-Q1'), 2025, 10, 2025, 12);
        });

        it('should roll fiscal-us Q2/Q3/Q4 into the next calendar year (crosses January)', async () => {
            await prisma.quarterSettings.create({
                data: { id: 'quarter-config', systemType: 'fiscal-us', q1StartMonth: 10 }
            });

            // FY2025 (starts Oct 2025): Q2 = Jan–Mar 2026, Q3 = Apr–Jun 2026, Q4 = Jul–Sep 2026
            expectRange(await getQuarterDateRange('2025-Q2'), 2026, 1, 2026, 3);
            expectRange(await getQuarterDateRange('2025-Q3'), 2026, 4, 2026, 6);
            expectRange(await getQuarterDateRange('2025-Q4'), 2026, 7, 2026, 9);
        });

        it('should handle academic-year config (Sep start)', async () => {
            await prisma.quarterSettings.create({
                data: { id: 'quarter-config', systemType: 'academic', q1StartMonth: 9 }
            });

            // Q1 = Sep–Nov 2025, Q2 = Dec 2025–Feb 2026 (crosses January)
            expectRange(await getQuarterDateRange('2025-Q1'), 2025, 9, 2025, 11);
            expectRange(await getQuarterDateRange('2025-Q2'), 2025, 12, 2026, 2);
        });

        it('should return tertiles as 4-month thirds, labeled by ending year (T1 Oct–Jan, T2 Feb–May, T3 Jun–Sep)', async () => {
            await prisma.quarterSettings.create({
                data: { id: 'quarter-config', systemType: 'tertile', q1StartMonth: 10 }
            });

            // The Oct 2025 – Sep 2026 cycle is labeled 2026 (its ending year).
            expectRange(await getQuarterDateRange('2026-T1'), 2025, 10, 2026, 1); // Oct 2025 – Jan 2026
            expectRange(await getQuarterDateRange('2026-T2'), 2026, 2, 2026, 5);  // Feb – May 2026
            expectRange(await getQuarterDateRange('2026-T3'), 2026, 6, 2026, 9);  // Jun – Sep 2026
        });
    });

    describe('getAllTimeLeaderboard', () => {
        it('should return contributors sorted by total points', async () => {
            await prisma.contributor.createMany({
                data: [
                    createTestContributor({
                        username: 'top',
                        totalPoints: 1000,
                        prCount: 80,
                        reviewCount: 40
                    }),
                    createTestContributor({
                        username: 'middle',
                        totalPoints: 500,
                        prCount: 40,
                        reviewCount: 20
                    }),
                    createTestContributor({
                        username: 'bottom',
                        totalPoints: 100,
                        prCount: 8,
                        reviewCount: 4
                    })
                ]
            });

            const leaderboard = await getAllTimeLeaderboard(50);

            expect(leaderboard).toHaveLength(3);
            expect(leaderboard[0].username).toBe('top');
            expect(leaderboard[1].username).toBe('middle');
            expect(leaderboard[2].username).toBe('bottom');
        });

        it('should respect limit parameter', async () => {
            const contributors = [];
            for (let i = 0; i < 10; i++) {
                contributors.push(
                    createTestContributor({
                        username: `user${i}`,
                        totalPoints: 100 * (10 - i)
                    })
                );
            }
            await prisma.contributor.createMany({
                data: contributors
            });

            const leaderboard = await getAllTimeLeaderboard(5);

            expect(leaderboard).toHaveLength(5);
        });
    });

    describe('getQuarterlyLeaderboard', () => {
        it('should return contributors sorted by quarterly points', async () => {
            await prisma.quarterSettings.create({
                data: {
                    id: 'quarter-config',
                    systemType: 'calendar',
                    q1StartMonth: 1
                }
            });

            // Get current quarter to ensure data matches
            const currentQ = await getCurrentQuarter();

            await prisma.contributor.createMany({
                data: [
                    createTestContributor({
                        username: 'user1',
                        quarterlyStats: {
                            currentQuarter: currentQ,
                            pointsThisQuarter: 500
                        }
                    }),
                    createTestContributor({
                        username: 'user2',
                        quarterlyStats: {
                            currentQuarter: currentQ,
                            pointsThisQuarter: 300
                        }
                    }),
                    createTestContributor({
                        username: 'user3',
                        quarterlyStats: {
                            currentQuarter: currentQ,
                            pointsThisQuarter: 100
                        }
                    })
                ]
            });

            const leaderboard = await getQuarterlyLeaderboard();

            expect(leaderboard).toHaveLength(3);
            expect(leaderboard[0].username).toBe('user1');
            expect(leaderboard[1].username).toBe('user2');
            expect(leaderboard[2].username).toBe('user3');
        });
    });

    describe('getHallOfFame', () => {
        it('should return archived quarterly winners', async () => {
            await prisma.quarterlyWinner.createMany({
                data: [
                    {
                        quarter: '2025-Q1',
                        year: 2025,
                        quarterNumber: 1,
                        quarterStart: new Date('2025-01-01'),
                        quarterEnd: new Date('2025-03-31'),
                        winner: {
                            username: 'champion1',
                            pointsThisQuarter: 500
                        },
                        top3: [],
                        totalParticipants: 20
                    },
                    {
                        quarter: '2024-Q4',
                        year: 2024,
                        quarterNumber: 4,
                        quarterStart: new Date('2024-10-01'),
                        quarterEnd: new Date('2024-12-31'),
                        winner: {
                            username: 'champion2',
                            pointsThisQuarter: 450
                        },
                        top3: [],
                        totalParticipants: 18
                    }
                ]
            });

            const hallOfFame = await getHallOfFame(20);

            expect(hallOfFame).toHaveLength(2);
            expect(hallOfFame[0].quarter).toBe('2025-Q1'); // Newest first
            expect(hallOfFame[1].quarter).toBe('2024-Q4');
        });

        it('should respect limit parameter', async () => {
            const winners = [];
            for (let i = 0; i < 10; i++) {
                const year = 2024 - Math.floor(i / 4);
                const quarter = (i % 4) + 1;
                winners.push({
                    quarter: `${year}-Q${quarter}`,
                    year: year,
                    quarterNumber: quarter,
                    quarterStart: new Date(),
                    quarterEnd: new Date(),
                    winner: { username: `winner${i}`, pointsThisQuarter: 100 },
                    top3: [],
                    totalParticipants: 10
                });
            }
            await prisma.quarterlyWinner.createMany({
                data: winners
            });

            const hallOfFame = await getHallOfFame(5);

            expect(hallOfFame).toHaveLength(5);
        });
    });

    describe('resetQuarterlyStats', () => {
        it('should reset quarterly stats for all contributors', async () => {
            await prisma.quarterSettings.create({
                data: {
                    id: 'quarter-config',
                    systemType: 'calendar',
                    q1StartMonth: 1
                }
            });

            await prisma.contributor.createMany({
                data: [
                    createTestContributor({
                        username: 'user1',
                        prCount: 100,
                        quarterlyStats: {
                            currentQuarter: '2024-Q4',
                            prsThisQuarter: 10,
                            reviewsThisQuarter: 5,
                            pointsThisQuarter: 125
                        }
                    }),
                    createTestContributor({
                        username: 'user2',
                        prCount: 50,
                        quarterlyStats: {
                            currentQuarter: '2024-Q4',
                            prsThisQuarter: 5,
                            reviewsThisQuarter: 3,
                            pointsThisQuarter: 65
                        }
                    })
                ]
            });

            await resetQuarterlyStats();

            const users = await prisma.contributor.findMany({});
            users.forEach(user => {
                expect(user.quarterlyStats.prsThisQuarter).toBe(0);
                expect(user.quarterlyStats.reviewsThisQuarter).toBe(0);
                expect(user.quarterlyStats.pointsThisQuarter).toBe(0);
                // All-time stats should be preserved
                expect(Number(user.prCount)).toBeGreaterThan(0);
            });
        });
    });

    describe('archiveQuarterWinners', () => {
        it('should archive top contributors to Hall of Fame', async () => {
            await prisma.quarterSettings.create({
                data: {
                    id: 'quarter-config',
                    systemType: 'calendar',
                    q1StartMonth: 1
                }
            });

            // Create contributors with quarterly stats
            await prisma.contributor.createMany({
                data: [
                    createTestContributor({
                        username: 'champion',
                        avatarUrl: 'https://github.com/champion.png',
                        quarterlyStats: {
                            currentQuarter: '2025-Q1',
                            prsThisQuarter: 20,
                            reviewsThisQuarter: 15,
                            pointsThisQuarter: 275
                        }
                    }),
                    createTestContributor({
                        username: 'second',
                        avatarUrl: 'https://github.com/second.png',
                        quarterlyStats: {
                            currentQuarter: '2025-Q1',
                            prsThisQuarter: 15,
                            reviewsThisQuarter: 10,
                            pointsThisQuarter: 200
                        }
                    }),
                    createTestContributor({
                        username: 'third',
                        avatarUrl: 'https://github.com/third.png',
                        quarterlyStats: {
                            currentQuarter: '2025-Q1',
                            prsThisQuarter: 10,
                            reviewsThisQuarter: 8,
                            pointsThisQuarter: 140
                        }
                    })
                ]
            });

            const q1 = new Date('2025-02-15T12:00:00Z');
            await seedQuarterHistory('champion', { prs: 20, reviews: 15, points: 275, at: q1 });
            await seedQuarterHistory('second', { prs: 15, reviews: 10, points: 200, at: q1 });
            await seedQuarterHistory('third', { prs: 10, reviews: 8, points: 140, at: q1 });

            await archiveQuarterWinners('2025-Q1');

            const winner = await prisma.quarterlyWinner.findUnique({
                where: { quarter_category: { quarter: '2025-Q1', category: 'general' } }
            });

            expect(winner).toBeDefined();
            expect(winner.winner.username).toBe('champion');
            expect(winner.top3).toHaveLength(3);
            expect(winner.top3[0].username).toBe('champion');
            expect(winner.top3[1].username).toBe('second');
            expect(winner.top3[2].username).toBe('third');
        });

        it('should archive tertile winners with the correct period number (T label)', async () => {
            await prisma.quarterSettings.create({
                data: { id: 'quarter-config', systemType: 'tertile', q1StartMonth: 10 }
            });

            await prisma.contributor.create({
                data: createTestContributor({
                    username: 'tert-champ',
                    avatarUrl: 'https://github.com/tert-champ.png',
                    quarterlyStats: {
                        currentQuarter: '2026-T3',
                        prsThisQuarter: 12,
                        reviewsThisQuarter: 9,
                        pointsThisQuarter: 210
                    }
                })
            });

            await seedQuarterHistory('tert-champ', {
                prs: 12, reviews: 9, points: 210, at: new Date('2026-07-15T12:00:00Z')
            });

            await archiveQuarterWinners('2026-T3');

            const winner = await prisma.quarterlyWinner.findUnique({
                where: { quarter_category: { quarter: '2026-T3', category: 'general' } }
            });

            expect(winner).toBeDefined();
            expect(winner.winner.username).toBe('tert-champ');
            expect(winner.year).toBe(2026);
            expect(winner.quarterNumber).toBe(3); // parsed from the "T3" label, not NaN
        });
    });

    describe('archive is immune to a contributor self-rolling (C-01)', () => {
        it('still archives a contributor whose stats were already rolled to the next quarter', async () => {
            await prisma.quarterSettings.create({
                data: { id: 'quarter-config', systemType: 'calendar', q1StartMonth: 1 }
            });

            // The outgoing quarter's champion merges a PR minutes into the new quarter.
            // updateQuarterlyStats re-initialises their JSON to the NEW quarter with
            // zeroed counters, so the closing quarter's numbers are gone from the cache
            // before anything archived them. Reading that cache dropped the real winner
            // from their own quarter's archive; reading point_history does not.
            await prisma.contributor.create({
                data: createTestContributor({
                    username: 'self-rolled',
                    avatarUrl: 'https://github.com/self-rolled.png',
                    quarterlyStats: {
                        currentQuarter: '2025-Q2',
                        prsThisQuarter: 1,
                        reviewsThisQuarter: 0,
                        pointsThisQuarter: 40
                    }
                })
            });
            await prisma.contributor.create({
                data: createTestContributor({
                    username: 'runner-up',
                    avatarUrl: 'https://github.com/runner-up.png',
                    quarterlyStats: {
                        currentQuarter: '2025-Q1',
                        prsThisQuarter: 5,
                        reviewsThisQuarter: 2,
                        pointsThisQuarter: 60
                    }
                })
            });

            const inQ1 = new Date('2025-02-15T12:00:00Z');
            await seedQuarterHistory('self-rolled', { prs: 20, reviews: 10, points: 250, at: inQ1 });
            await seedQuarterHistory('runner-up', { prs: 5, reviews: 2, points: 60, at: inQ1 });
            // their first PR of the new quarter, which is what zeroed the cache
            await seedQuarterHistory('self-rolled', {
                prs: 1, reviews: 0, points: 40, at: new Date('2025-04-01T00:05:00Z')
            });

            await archiveQuarterWinners('2025-Q1');

            const winner = await prisma.quarterlyWinner.findUnique({
                where: { quarter_category: { quarter: '2025-Q1', category: 'general' } }
            });

            expect(winner).toBeDefined();
            expect(winner.winner.username).toBe('self-rolled');
            expect(winner.winner.pointsThisQuarter).toBe(250); // Q1 only, not the 40 from Q2
        });
    });

    describe('checkAndResetIfNewQuarter', () => {
        it('should not cause errors when executed', async () => {
            await prisma.quarterSettings.create({
                data: {
                    id: 'quarter-config',
                    systemType: 'calendar',
                    q1StartMonth: 1
                }
            });

            await prisma.contributor.create({
                data: createTestContributor({
                    username: 'testuser',
                    quarterlyStats: {
                        currentQuarter: '2025-Q1',
                        pointsThisQuarter: 100
                    }
                })
            });

            // This should run without errors
            await expect(checkAndResetIfNewQuarter()).resolves.toBeDefined();
        });
    });

    afterEach(async () => {
        // Clean up after tests
        await prisma.quarterlyWinner.deleteMany({});
        await prisma.quarterSettings.deleteMany({});
        await prisma.contributor.deleteMany({});
    });

    describe('recomputeHallOfFameAll', () => {
        it('drops in-progress / future-dated rows (Hall of Fame is completed periods only)', async () => {
            await prisma.quarterSettings.create({
                data: { id: 'quarter-config', systemType: 'tertile', q1StartMonth: 10 }
            });
            const current = await getCurrentQuarter();
            const { start, end } = await getQuarterDateRange(current);

            // Seed a stray archived row for the in-progress period (future end date)
            await prisma.quarterlyWinner.create({
                data: {
                    quarter: current,
                    category: 'devops',
                    year: parseInt(current.split('-')[0]),
                    quarterNumber: parseInt(current.split('-')[1].replace(/\D/g, '')),
                    quarterStart: start,
                    quarterEnd: end,
                    winner: { username: 'stray' },
                    top3: [],
                    totalParticipants: 1,
                    archivedDate: new Date()
                }
            });

            await recomputeHallOfFameAll();

            const remaining = await prisma.quarterlyWinner.findMany({ where: { quarter: current } });
            expect(remaining).toHaveLength(0);
        });
    });

    afterAll(async () => {
        // Disconnect Prisma to allow Jest to exit
        await prisma.$disconnect();
    });
});
