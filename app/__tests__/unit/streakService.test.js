import { describe, it, expect, beforeEach, afterEach, afterAll, jest } from '@jest/globals';
import {
    updateStreak,
    checkStreakBadges,
    resetStreak,
    getStreakStats,
    getStreakLeaderboard
} from '../../services/streakService.js';
import { prisma } from '../../lib/prisma.js';
import { createTestContributor } from '../setup.js';

// Note: Socket emitter and logger are not mocked in this test file
// These services will use their real implementations during tests

describe('StreakService', () => {
    beforeEach(async () => {
        await prisma.contributor.deleteMany({});
    });

    afterEach(async () => {
        // Cleanup after each test to prevent data leaks between tests
        await prisma.contributor.deleteMany({});
    });

    describe('updateStreak', () => {
        it('should start a new streak for first contribution', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username: 'newcomer',
                    currentStreak: 0,
                    longestStreak: 0,
                    lastContributionDate: null
                })
            });

            const result = await updateStreak(contributor, new Date());

            expect(result.currentStreak).toBe(1);
            expect(result.firstStreak).toBe(true);
            expect(result.streakContinued).toBe(false);
            expect(result.streakBroken).toBe(false);

            const updated = await prisma.contributor.findUnique({ where: { username: 'newcomer' } });
            expect(Number(updated.currentStreak)).toBe(1);
            expect(Number(updated.longestStreak)).toBe(1);
            expect(updated.lastContributionDate).toBeDefined();
        });

        it('should increment streak for consecutive day contribution', async () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username: 'consistent',
                    currentStreak: 5,
                    longestStreak: 5,
                    lastContributionDate: yesterday
                })
            });

            const today = new Date();
            const result = await updateStreak(contributor, today);

            expect(result.currentStreak).toBe(6);
            expect(result.streakContinued).toBe(true);
            expect(result.streakBroken).toBe(false);

            const updated = await prisma.contributor.findUnique({ where: { username: 'consistent' } });
            expect(Number(updated.currentStreak)).toBe(6);
            expect(Number(updated.longestStreak)).toBe(6); // Updated longest
        });

        it('should not change streak for same-day contribution', async () => {
            const today = new Date();
            today.setHours(10, 0, 0, 0);

            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username: 'sameDayUser',
                    currentStreak: 3,
                    longestStreak: 5,
                    lastContributionDate: today
                })
            });

            const laterToday = new Date(today);
            laterToday.setHours(15, 0, 0, 0);

            const result = await updateStreak(contributor, laterToday);

            expect(result.currentStreak).toBe(3);
            expect(result.streakContinued).toBe(false);
            expect(result.streakBroken).toBe(false);
        });

        it('should reset streak when contribution gap is more than 1 day', async () => {
            const threeDaysAgo = new Date();
            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username: 'broken',
                    currentStreak: 10,
                    longestStreak: 10,
                    lastContributionDate: threeDaysAgo
                })
            });

            const today = new Date();
            const result = await updateStreak(contributor, today);

            expect(result.currentStreak).toBe(1);
            expect(result.streakBroken).toBe(true);
            expect(result.oldStreak).toBe(10);
            expect(result.streakContinued).toBe(false);

            const updated = await prisma.contributor.findUnique({ where: { username: 'broken' } });
            expect(Number(updated.currentStreak)).toBe(1);
            expect(Number(updated.longestStreak)).toBe(10); // Longest should remain unchanged
        });

        it('should update longest streak when current exceeds it', async () => {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username: 'recordBreaker',
                    currentStreak: 20,
                    longestStreak: 15, // Current is already higher
                    lastContributionDate: yesterday
                })
            });

            const today = new Date();
            await updateStreak(contributor, today);

            const updated = await prisma.contributor.findUnique({ where: { username: 'recordBreaker' } });
            expect(Number(updated.currentStreak)).toBe(21);
            expect(Number(updated.longestStreak)).toBe(21); // Should update to new record
        });
    });

    describe('checkStreakBadges', () => {
        it('should award Week Warrior badge for 7-day streak', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username: 'weekWarrior',
                    currentStreak: 7,
                    sevenDayBadge: false,
                    thirtyDayBadge: false,
                    ninetyDayBadge: false,
                    yearLongBadge: false
                })
            });

            const badges = await checkStreakBadges(contributor);

            expect(badges).toHaveLength(1);
            expect(badges[0].name).toBe('Week Warrior');
            expect(badges[0].days).toBe(7);

            const updated = await prisma.contributor.findUnique({ where: { username: 'weekWarrior' } });
            expect(updated.sevenDayBadge).toBe(true);
        });

        it('should award Monthly Master badge for 30-day streak', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username: 'monthlyMaster',
                    currentStreak: 30,
                    sevenDayBadge: true,
                    thirtyDayBadge: false,
                    ninetyDayBadge: false,
                    yearLongBadge: false
                })
            });

            const badges = await checkStreakBadges(contributor);

            expect(badges).toHaveLength(1);
            expect(badges[0].name).toBe('Monthly Master');
            expect(badges[0].days).toBe(30);
        });

        it('should award Quarter Champion badge for 90-day streak', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username: 'quarterChamp',
                    currentStreak: 90,
                    sevenDayBadge: true,
                    thirtyDayBadge: true,
                    ninetyDayBadge: false,
                    yearLongBadge: false
                })
            });

            const badges = await checkStreakBadges(contributor);

            expect(badges).toHaveLength(1);
            expect(badges[0].name).toBe('Quarter Champion');
            expect(badges[0].days).toBe(90);
        });

        it('should award Year-Long Hero badge for 365-day streak', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username: 'yearHero',
                    currentStreak: 365,
                    sevenDayBadge: true,
                    thirtyDayBadge: true,
                    ninetyDayBadge: true,
                    yearLongBadge: false
                })
            });

            const badges = await checkStreakBadges(contributor);

            expect(badges).toHaveLength(1);
            expect(badges[0].name).toBe('Year-Long Hero');
            expect(badges[0].days).toBe(365);
        });

        it('should award multiple badges at once if eligible', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username: 'multiBadge',
                    currentStreak: 100,
                    sevenDayBadge: false,
                    thirtyDayBadge: false,
                    ninetyDayBadge: false,
                    yearLongBadge: false
                })
            });

            const badges = await checkStreakBadges(contributor);

            expect(badges).toHaveLength(3); // 7-day, 30-day, 90-day
            expect(badges.some(b => b.name === 'Week Warrior')).toBe(true);
            expect(badges.some(b => b.name === 'Monthly Master')).toBe(true);
            expect(badges.some(b => b.name === 'Quarter Champion')).toBe(true);
        });

        it('should not award badges already earned', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username: 'alreadyEarned',
                    currentStreak: 30,
                    sevenDayBadge: true,
                    thirtyDayBadge: true,
                    ninetyDayBadge: false,
                    yearLongBadge: false
                })
            });

            const badges = await checkStreakBadges(contributor);

            expect(badges).toHaveLength(0); // No new badges
        });

        it('should return empty array for streak below first threshold', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username: 'earlyDays',
                    currentStreak: 5,
                    sevenDayBadge: false,
                    thirtyDayBadge: false,
                    ninetyDayBadge: false,
                    yearLongBadge: false
                })
            });

            const badges = await checkStreakBadges(contributor);

            expect(badges).toHaveLength(0);
        });
    });

    describe('resetStreak', () => {
        it('should reset streak to zero', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username: 'resetUser',
                    currentStreak: 15,
                    longestStreak: 20,
                    lastContributionDate: new Date()
                })
            });

            const result = await resetStreak(contributor);

            expect(result.success).toBe(true);

            const updated = await prisma.contributor.findUnique({ where: { username: 'resetUser' } });
            expect(Number(updated.currentStreak)).toBe(0);
            expect(updated.lastContributionDate).toBeNull();
            expect(Number(updated.longestStreak)).toBe(20); // Longest should remain unchanged
        });
    });

    describe('getStreakStats', () => {
        it('should return streak statistics for existing user', async () => {
            const today = new Date();
            await prisma.contributor.create({
                data: createTestContributor({
                    username: 'statsUser',
                    currentStreak: 25,
                    longestStreak: 30,
                    lastContributionDate: today,
                    sevenDayBadge: true,
                    thirtyDayBadge: true,
                    ninetyDayBadge: false,
                    yearLongBadge: false
                })
            });

            const stats = await getStreakStats('statsUser');

            expect(stats.username).toBe('statsUser');
            expect(stats.currentStreak).toBe(25);
            expect(stats.longestStreak).toBe(30);
            expect(stats.lastContributionDate).toBeDefined();
            expect(stats.streakBadges.sevenDay).toBe(true);
            expect(stats.streakBadges.thirtyDay).toBe(true);
        });

        it('should return default stats for non-existent user', async () => {
            const stats = await getStreakStats('nonExistent');

            expect(stats.username).toBe('nonExistent');
            expect(stats.currentStreak).toBe(0);
            expect(stats.longestStreak).toBe(0);
            expect(stats.lastContributionDate).toBeNull();
            expect(stats.streakBadges.sevenDay).toBe(false);
        });
    });

    describe('getStreakLeaderboard', () => {
        it('should return top contributors by current streak', async () => {
            await prisma.contributor.createMany({
                data: [
                    createTestContributor({ username: 'user1', currentStreak: 10, longestStreak: 15 }),
                    createTestContributor({ username: 'user2', currentStreak: 25, longestStreak: 25 }),
                    createTestContributor({ username: 'user3', currentStreak: 5, longestStreak: 20 }),
                    createTestContributor({ username: 'user4', currentStreak: 15, longestStreak: 15 })
                ]
            });

            const leaderboard = await getStreakLeaderboard(3);

            expect(leaderboard).toHaveLength(3);
            expect(leaderboard[0].username).toBe('user2');
            expect(Number(leaderboard[0].currentStreak)).toBe(25);
            expect(leaderboard[1].username).toBe('user4');
            expect(Number(leaderboard[1].currentStreak)).toBe(15);
            expect(leaderboard[2].username).toBe('user1');
            expect(Number(leaderboard[2].currentStreak)).toBe(10);
        });

        it('should use longest streak as tiebreaker', async () => {
            await prisma.contributor.createMany({
                data: [
                    createTestContributor({ username: 'tied1', currentStreak: 10, longestStreak: 30 }),
                    createTestContributor({ username: 'tied2', currentStreak: 10, longestStreak: 20 })
                ]
            });

            const leaderboard = await getStreakLeaderboard();

            expect(leaderboard[0].username).toBe('tied1');
            expect(leaderboard[1].username).toBe('tied2');
        });

        it('should return top 10 by default', async () => {
            const contributors = Array.from({ length: 15 }, (_, i) =>
                createTestContributor({
                    username: `user${i}`,
                    currentStreak: i + 1,
                    longestStreak: i + 1
                })
            );

            await prisma.contributor.createMany({ data: contributors });

            const leaderboard = await getStreakLeaderboard();

            expect(leaderboard).toHaveLength(10);
            expect(Number(leaderboard[0].currentStreak)).toBe(15); // Highest
        });

        it('should return selected fields only', async () => {
            await prisma.contributor.create({
                data: createTestContributor({
                    username: 'selectTest',
                    currentStreak: 5,
                    longestStreak: 10,
                    avatarUrl: 'https://example.com/avatar.png'
                })
            });

            const leaderboard = await getStreakLeaderboard(1);

            expect(leaderboard[0]).toHaveProperty('username');
            expect(leaderboard[0]).toHaveProperty('avatarUrl');
            expect(leaderboard[0]).toHaveProperty('currentStreak');
            expect(leaderboard[0]).toHaveProperty('longestStreak');
            expect(leaderboard[0]).toHaveProperty('streakBadges');
        });

        it('should return empty array when no contributors exist', async () => {
            const leaderboard = await getStreakLeaderboard();

            expect(leaderboard).toHaveLength(0);
        });
    });

    describe('Edge Cases', () => {
        it('should handle contributor save errors gracefully', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username: 'errorUser',
                    currentStreak: 5,
                    longestStreak: 5,
                    lastContributionDate: new Date()
                })
            });

            // Force an error by invalidating the contributor
            contributor.username = null; // Invalid username

            await expect(updateStreak(contributor, new Date())).rejects.toThrow();
        });

        it('should handle date edge cases correctly', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username: 'dateEdge',
                    currentStreak: 1,
                    longestStreak: 1,
                    lastContributionDate: new Date('2025-01-01T23:59:59')
                })
            });

            // Contribution exactly 1 day later
            const result = await updateStreak(contributor, new Date('2025-01-02T00:00:01'));

            expect(result.currentStreak).toBe(2);
            expect(result.streakContinued).toBe(true);
        });
    });

    afterAll(async () => {
        // Disconnect Prisma to allow Jest to exit
        await prisma.$disconnect();
    });
});
