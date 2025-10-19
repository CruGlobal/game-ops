import { describe, it, expect, beforeEach } from '@jest/globals';
import {
    getQuarterConfig,
    getCurrentQuarter,
    getQuarterDateRange,
    getQuarterlyLeaderboard,
    getAllTimeLeaderboard,
    getHallOfFame,
    resetQuarterlyStats,
    archiveQuarterWinners,
    checkAndResetIfNewQuarter
} from '../../services/quarterlyService.js';
import Contributor from '../../models/contributor.js';
import QuarterSettings from '../../models/quarterSettings.js';
import QuarterlyWinner from '../../models/quarterlyWinner.js';
import { createTestContributor } from '../setup.js';

describe('QuarterlyService', () => {
    beforeEach(async () => {
        await Contributor.deleteMany({});
        await QuarterSettings.deleteMany({});
        await QuarterlyWinner.deleteMany({});
    });

    describe('getQuarterConfig', () => {
        it('should return existing quarter configuration', async () => {
            await QuarterSettings.create({
                _id: 'quarter-config',
                systemType: 'fiscal-us',
                q1StartMonth: 10
            });

            const config = await getQuarterConfig();

            expect(config).toBeDefined();
            expect(config.systemType).toBe('fiscal-us');
            expect(config.q1StartMonth).toBe(10);
        });

        it('should create default config if none exists', async () => {
            const config = await getQuarterConfig();

            expect(config).toBeDefined();
            expect(config.systemType).toBe('calendar');
            expect(config.q1StartMonth).toBe(1);
        });
    });

    describe('getCurrentQuarter', () => {
        it('should return current quarter string', async () => {
            await QuarterSettings.create({
                _id: 'quarter-config',
                systemType: 'calendar',
                q1StartMonth: 1
            });

            const quarter = await getCurrentQuarter();

            expect(quarter).toMatch(/^\d{4}-Q[1-4]$/);
            expect(quarter).toContain('2025');
        });

        it('should calculate quarter based on fiscal year config', async () => {
            await QuarterSettings.create({
                _id: 'quarter-config',
                systemType: 'fiscal-us',
                q1StartMonth: 10
            });

            const quarter = await getCurrentQuarter();

            expect(quarter).toMatch(/^\d{4}-Q[1-4]$/);
        });
    });

    describe('getQuarterDateRange', () => {
        it('should return date range for quarter', async () => {
            await QuarterSettings.create({
                _id: 'quarter-config',
                systemType: 'calendar',
                q1StartMonth: 1
            });

            const range = await getQuarterDateRange('2025-Q1');

            expect(range.start).toBeInstanceOf(Date);
            expect(range.end).toBeInstanceOf(Date);
            expect(range.end.getTime()).toBeGreaterThan(range.start.getTime());
        });

        it('should handle quarter spanning year boundary', async () => {
            await QuarterSettings.create({
                _id: 'quarter-config',
                systemType: 'fiscal-us',
                q1StartMonth: 10
            });

            const range = await getQuarterDateRange('2025-Q1');

            expect(range.start).toBeInstanceOf(Date);
            expect(range.end).toBeInstanceOf(Date);
        });
    });

    describe('getAllTimeLeaderboard', () => {
        it('should return contributors sorted by total points', async () => {
            await Contributor.create([
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
            ]);

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
            await Contributor.create(contributors);

            const leaderboard = await getAllTimeLeaderboard(5);

            expect(leaderboard).toHaveLength(5);
        });
    });

    describe('getQuarterlyLeaderboard', () => {
        it('should return contributors sorted by quarterly points', async () => {
            await QuarterSettings.create({
                _id: 'quarter-config',
                systemType: 'calendar',
                q1StartMonth: 1
            });

            await Contributor.create([
                createTestContributor({
                    username: 'user1',
                    quarterlyStats: {
                        currentQuarter: '2025-Q1',
                        pointsThisQuarter: 500
                    }
                }),
                createTestContributor({
                    username: 'user2',
                    quarterlyStats: {
                        currentQuarter: '2025-Q1',
                        pointsThisQuarter: 300
                    }
                }),
                createTestContributor({
                    username: 'user3',
                    quarterlyStats: {
                        currentQuarter: '2025-Q1',
                        pointsThisQuarter: 100
                    }
                })
            ]);

            const leaderboard = await getQuarterlyLeaderboard();

            expect(leaderboard).toHaveLength(3);
            expect(leaderboard[0].username).toBe('user1');
            expect(leaderboard[1].username).toBe('user2');
            expect(leaderboard[2].username).toBe('user3');
        });
    });

    describe('getHallOfFame', () => {
        it('should return archived quarterly winners', async () => {
            await QuarterlyWinner.create([
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
            ]);

            const hallOfFame = await getHallOfFame(20);

            expect(hallOfFame).toHaveLength(2);
            expect(hallOfFame[0].quarter).toBe('2025-Q1'); // Newest first
            expect(hallOfFame[1].quarter).toBe('2024-Q4');
        });

        it('should respect limit parameter', async () => {
            const winners = [];
            for (let i = 0; i < 10; i++) {
                winners.push({
                    quarter: `2024-Q${i % 4 + 1}`,
                    year: 2024,
                    quarterNumber: i % 4 + 1,
                    quarterStart: new Date(),
                    quarterEnd: new Date(),
                    winner: { username: `winner${i}`, pointsThisQuarter: 100 },
                    top3: [],
                    totalParticipants: 10
                });
            }
            await QuarterlyWinner.create(winners);

            const hallOfFame = await getHallOfFame(5);

            expect(hallOfFame).toHaveLength(5);
        });
    });

    describe('resetQuarterlyStats', () => {
        it('should reset quarterly stats for all contributors', async () => {
            await QuarterSettings.create({
                _id: 'quarter-config',
                systemType: 'calendar',
                q1StartMonth: 1
            });

            await Contributor.create([
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
            ]);

            await resetQuarterlyStats();

            const users = await Contributor.find({});
            users.forEach(user => {
                expect(user.quarterlyStats.prsThisQuarter).toBe(0);
                expect(user.quarterlyStats.reviewsThisQuarter).toBe(0);
                expect(user.quarterlyStats.pointsThisQuarter).toBe(0);
                // All-time stats should be preserved
                expect(user.prCount).toBeGreaterThan(0);
            });
        });
    });

    describe('archiveQuarterWinners', () => {
        it('should archive top contributors to Hall of Fame', async () => {
            await QuarterSettings.create({
                _id: 'quarter-config',
                systemType: 'calendar',
                q1StartMonth: 1
            });

            // Create contributors with quarterly stats
            await Contributor.create([
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
            ]);

            await archiveQuarterWinners('2025-Q1');

            const winner = await QuarterlyWinner.findOne({ quarter: '2025-Q1' });

            expect(winner).toBeDefined();
            expect(winner.winner.username).toBe('champion');
            expect(winner.top3).toHaveLength(3);
            expect(winner.top3[0].username).toBe('champion');
            expect(winner.top3[1].username).toBe('second');
            expect(winner.top3[2].username).toBe('third');
        });
    });

    describe('checkAndResetIfNewQuarter', () => {
        it('should not cause errors when executed', async () => {
            await QuarterSettings.create({
                _id: 'quarter-config',
                systemType: 'calendar',
                q1StartMonth: 1
            });

            await Contributor.create(
                createTestContributor({
                    username: 'testuser',
                    quarterlyStats: {
                        currentQuarter: '2025-Q1',
                        pointsThisQuarter: 100
                    }
                })
            );

            // This should run without errors
            await expect(checkAndResetIfNewQuarter()).resolves.toBeDefined();
        });
    });
});
