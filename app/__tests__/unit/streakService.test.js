import { describe, it, expect, beforeEach, afterEach, afterAll } from '@jest/globals';
import { isUSFederalHoliday, isNonWorkingDay, countWorkingDays, startOfWorkWeek } from '../../utils/holidays.js';
import {
    updateStreak,
    reconcileWeeklyStreaks,
    checkStreakBadges,
    resetStreak,
    getStreakStats,
    getStreakLeaderboard
} from '../../services/streakService.js';
import { prisma } from '../../lib/prisma.js';
import { createTestContributor } from '../setup.js';

// Note: Socket emitter and logger are not mocked in this test file
// These services will use their real implementations during tests

// A streak is "workdays contributed this week", so every case below fixes the calendar.
// June 2026: 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat 7=Sun 8=Mon.
// The week of Mon Jun 29 2026 holds Fri Jul 3, the observed Independence Day, so its
// ceiling is 4 rather than 5.
const MON = new Date(2026, 5, 1);
const TUE = new Date(2026, 5, 2);
const WED = new Date(2026, 5, 3);
const THU = new Date(2026, 5, 4);
const FRI = new Date(2026, 5, 5);
const SAT = new Date(2026, 5, 6);
const SUN = new Date(2026, 5, 7);
const NEXT_MON = new Date(2026, 5, 8);
const HOL_MON = new Date(2026, 5, 29);
const HOL_TUE = new Date(2026, 5, 30);
const HOL_WED = new Date(2026, 6, 1);
const HOL_THU = new Date(2026, 6, 2);
const HOL_FRI = new Date(2026, 6, 3); // observed Independence Day

const dayOnly = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

// The tally is derived from the per-day rows that the PR and review paths write before
// they call updateStreak, so the tests have to write them too.
const contributedOn = (contributorId, ...dates) =>
    prisma.contribution.createMany({
        data: dates.map(date => ({ contributorId, date: dayOnly(date), count: 1, merged: true }))
    });

const reviewedOn = (contributorId, ...dates) =>
    prisma.review.createMany({
        data: dates.map(date => ({ contributorId, date: dayOnly(date), count: 1 }))
    });

const makeContributor = (overrides = {}) =>
    prisma.contributor.create({ data: createTestContributor(overrides) });

const streakOf = async (username) => {
    const c = await prisma.contributor.findUnique({ where: { username } });
    return Number(c.currentStreak);
};

describe('StreakService', () => {
    beforeEach(async () => {
        await prisma.contributor.deleteMany({});
    });

    afterEach(async () => {
        // Cleanup after each test to prevent data leaks between tests
        await prisma.contributor.deleteMany({});
    });

    describe('updateStreak', () => {
        it('counts the workdays contributed so far this week', async () => {
            const c = await makeContributor({ username: 'tally' });
            await contributedOn(c.id, MON, TUE);

            const result = await updateStreak(c, TUE);

            expect(result.currentStreak).toBe(2);
            expect(await streakOf('tally')).toBe(2);
        });

        it('tops out at the five workdays in the week', async () => {
            const c = await makeContributor({ username: 'fullWeek' });
            await contributedOn(c.id, MON, TUE, WED, THU, FRI);

            const result = await updateStreak(c, FRI);

            expect(result.currentStreak).toBe(5);
            expect(result.ceiling).toBe(5);
        });

        it('does not require the workdays to be consecutive', async () => {
            const c = await makeContributor({ username: 'gappy' });
            await contributedOn(c.id, MON, THU);

            const result = await updateStreak(c, THU);

            // Missing Tuesday and Wednesday costs those two days and nothing more.
            expect(result.currentStreak).toBe(2);
        });

        it('counts a workday once however many contributions land on it', async () => {
            const c = await makeContributor({ username: 'busyDay' });
            await contributedOn(c.id, MON);
            await reviewedOn(c.id, MON);

            const result = await updateStreak(c, MON);

            expect(result.currentStreak).toBe(1);
        });

        it('counts reviews the same as merged PRs', async () => {
            const c = await makeContributor({ username: 'reviewer' });
            await reviewedOn(c.id, MON, TUE);

            const result = await updateStreak(c, TUE);

            expect(result.currentStreak).toBe(2);
        });

        it('ignores a weekend contribution entirely', async () => {
            const c = await makeContributor({ username: 'saturdayWorker' });
            await contributedOn(c.id, MON, TUE, WED, THU);
            await updateStreak(c, THU);

            const midWeek = await prisma.contributor.findUnique({ where: { username: 'saturdayWorker' } });
            await contributedOn(c.id, SAT);
            const result = await updateStreak(midWeek, SAT);

            expect(result.currentStreak).toBe(4);
            expect(result.weekendOrHoliday).toBe(true);
            const after = await prisma.contributor.findUnique({ where: { username: 'saturdayWorker' } });
            expect(Number(after.currentStreak)).toBe(4);
            expect(after.lastContributionDate).toEqual(dayOnly(THU));
        });

        it('ignores a Sunday contribution too', async () => {
            const c = await makeContributor({ username: 'sundayWorker' });
            await contributedOn(c.id, SUN);

            const result = await updateStreak(c, SUN);

            expect(result.weekendOrHoliday).toBe(true);
            expect(await streakOf('sundayWorker')).toBe(0);
        });

        it('does not let weekend work cover a missed Friday', async () => {
            // The old chain logic measured the gap from the last contribution, so
            // Thursday then Saturday counted Friday as the one elapsed workday and
            // incremented: weekend work paying for a skipped workday.
            const c = await makeContributor({ username: 'rescuer' });
            await contributedOn(c.id, THU);
            const afterThu = await updateStreak(c, THU);
            expect(afterThu.currentStreak).toBe(1);

            const snapshot = await prisma.contributor.findUnique({ where: { username: 'rescuer' } });
            await contributedOn(c.id, SAT);
            const result = await updateStreak(snapshot, SAT);

            expect(result.currentStreak).toBe(1);
            expect(await streakOf('rescuer')).toBe(1);
        });

        it('caps a federal-holiday week at four, and ignores work on the holiday', async () => {
            const c = await makeContributor({ username: 'holidayWeek' });
            await contributedOn(c.id, HOL_MON, HOL_TUE, HOL_WED, HOL_THU);

            const result = await updateStreak(c, HOL_THU);

            expect(result.currentStreak).toBe(4);
            expect(result.ceiling).toBe(4);

            const snapshot = await prisma.contributor.findUnique({ where: { username: 'holidayWeek' } });
            await contributedOn(c.id, HOL_FRI);
            const onHoliday = await updateStreak(snapshot, HOL_FRI);

            expect(onHoliday.weekendOrHoliday).toBe(true);
            expect(await streakOf('holidayWeek')).toBe(4);
        });

        it('starts over in a new week', async () => {
            const c = await makeContributor({ username: 'freshWeek' });
            await contributedOn(c.id, MON, TUE, WED, THU, FRI);
            await updateStreak(c, FRI);

            const snapshot = await prisma.contributor.findUnique({ where: { username: 'freshWeek' } });
            await contributedOn(c.id, NEXT_MON);
            const result = await updateStreak(snapshot, NEXT_MON);

            expect(result.currentStreak).toBe(1);
        });

        it('is zero when this week has no contribution rows', async () => {
            // The tally is derived, not accumulated: an event with no day row behind it
            // does not count. Every production caller writes the row first.
            const c = await makeContributor({ username: 'ghost' });

            const result = await updateStreak(c, TUE);

            expect(result.currentStreak).toBe(0);
        });

        it('clamps a legacy chain value down to this week', async () => {
            const c = await makeContributor({ username: 'legacy', currentStreak: 47, longestStreak: 49 });
            await contributedOn(c.id, MON);

            const result = await updateStreak(c, MON);

            expect(result.currentStreak).toBe(1);
        });

        it('ignores the time of day on the contribution', async () => {
            const c = await makeContributor({ username: 'lateNight' });
            await contributedOn(c.id, MON);

            const result = await updateStreak(c, new Date(2026, 5, 1, 23, 59, 59));

            expect(result.currentStreak).toBe(1);
        });
    });

    describe('reconcileWeeklyStreaks', () => {
        it('zeroes a contributor whose last contribution predates this week', async () => {
            const c = await makeContributor({ username: 'lastWeekOnly', currentStreak: 5 });
            await contributedOn(c.id, MON, TUE);

            const result = await reconcileWeeklyStreaks(NEXT_MON);

            expect(await streakOf('lastWeekOnly')).toBe(0);
            expect(result.updated).toBe(1);
        });

        it('clamps a legacy chain value to the real weekly tally', async () => {
            const c = await makeContributor({ username: 'inherited', currentStreak: 47 });
            await contributedOn(c.id, MON);
            await reviewedOn(c.id, TUE);

            await reconcileWeeklyStreaks(WED);

            expect(await streakOf('inherited')).toBe(2);
        });

        it('leaves an already-correct tally alone', async () => {
            const c = await makeContributor({ username: 'accurate', currentStreak: 1 });
            await contributedOn(c.id, MON);

            const result = await reconcileWeeklyStreaks(TUE);

            expect(result.updated).toBe(0);
            expect(await streakOf('accurate')).toBe(1);
        });

        it('does not count weekend rows', async () => {
            const c = await makeContributor({ username: 'weekendRows', currentStreak: 3 });
            await contributedOn(c.id, MON, SAT, SUN);

            await reconcileWeeklyStreaks(SAT);

            expect(await streakOf('weekendRows')).toBe(1);
        });
    });

    describe('checkStreakBadges', () => {
        it('awards Week Warrior for a full workweek', async () => {
            const contributor = await makeContributor({ username: 'weekWarrior', currentStreak: 5 });

            const badges = await checkStreakBadges(contributor);

            expect(badges).toHaveLength(1);
            expect(badges[0].name).toBe('Week Warrior');
            expect(badges[0].workdays).toBe(5);

            const updated = await prisma.contributor.findUnique({ where: { username: 'weekWarrior' } });
            expect(updated.sevenDayBadge).toBe(true);
        });

        it('awards nothing short of a full workweek', async () => {
            const contributor = await makeContributor({ username: 'fourFifths', currentStreak: 4 });

            const badges = await checkStreakBadges(contributor);

            expect(badges).toHaveLength(0);
            const updated = await prisma.contributor.findUnique({ where: { username: 'fourFifths' } });
            expect(updated.sevenDayBadge).toBe(false);
        });

        it('does not award a badge twice', async () => {
            const contributor = await makeContributor({
                username: 'alreadyEarned',
                currentStreak: 5,
                sevenDayBadge: true
            });

            const badges = await checkStreakBadges(contributor);

            expect(badges).toHaveLength(0);
        });

        it('never awards the retired 30, 90 and 365-day chain badges', async () => {
            // A value this high cannot be produced any more, and even when one is read
            // off an old row it must not unlock a multi-month chain badge.
            const contributor = await makeContributor({ username: 'marathoner', currentStreak: 365 });

            const badges = await checkStreakBadges(contributor);

            expect(badges.map(b => b.name)).toEqual(['Week Warrior']);
            const updated = await prisma.contributor.findUnique({ where: { username: 'marathoner' } });
            expect(updated.thirtyDayBadge).toBe(false);
            expect(updated.ninetyDayBadge).toBe(false);
            expect(updated.yearLongBadge).toBe(false);
        });
    });

    describe('resetStreak', () => {
        it('should reset streak to zero', async () => {
            const contributor = await makeContributor({
                username: 'resetUser',
                currentStreak: 5,
                longestStreak: 20,
                lastContributionDate: new Date()
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
            await makeContributor({
                username: 'statsUser',
                currentStreak: 5,
                longestStreak: 5,
                lastContributionDate: FRI,
                sevenDayBadge: true
            });

            const stats = await getStreakStats('statsUser');

            expect(stats.username).toBe('statsUser');
            expect(stats.currentStreak).toBe(5);
            expect(stats.streakBadges.sevenDay).toBe(true);
            expect(stats.streakBadges.thirtyDay).toBe(false);
        });

        it('should return default stats for non-existent user', async () => {
            const stats = await getStreakStats('nobody');

            expect(stats.currentStreak).toBe(0);
            expect(stats.streakBadges.sevenDay).toBe(false);
        });
    });

    describe('getStreakLeaderboard', () => {
        it('should return top contributors by current streak', async () => {
            await prisma.contributor.createMany({
                data: [
                    createTestContributor({ username: 'user1', currentStreak: 2 }),
                    createTestContributor({ username: 'user2', currentStreak: 5 }),
                    createTestContributor({ username: 'user3', currentStreak: 1 }),
                    createTestContributor({ username: 'user4', currentStreak: 3 })
                ]
            });

            const leaderboard = await getStreakLeaderboard(3);

            expect(leaderboard.map(r => r.username)).toEqual(['user2', 'user4', 'user1']);
            expect(leaderboard[0].currentStreak).toBe(5);
        });

        it('breaks ties by username, not by a historical chain', async () => {
            // longestStreak still holds pre-cap chains (47, 49). Ordering by it would
            // keep ranking people on how long they once went without a day off.
            await prisma.contributor.createMany({
                data: [
                    createTestContributor({ username: 'zoe', currentStreak: 3, longestStreak: 49 }),
                    createTestContributor({ username: 'adam', currentStreak: 3, longestStreak: 3 })
                ]
            });

            const leaderboard = await getStreakLeaderboard();

            expect(leaderboard.map(r => r.username)).toEqual(['adam', 'zoe']);
        });

        it('should return top 10 by default', async () => {
            const contributors = Array.from({ length: 15 }, (_, i) =>
                createTestContributor({ username: `user${i}`, currentStreak: (i % 5) + 1 })
            );

            await prisma.contributor.createMany({ data: contributors });

            const leaderboard = await getStreakLeaderboard();

            expect(leaderboard).toHaveLength(10);
        });

        it('should return empty array when no contributors exist', async () => {
            const leaderboard = await getStreakLeaderboard();

            expect(leaderboard).toEqual([]);
        });
    });

    describe('Edge Cases', () => {
        it('should handle contributor save errors gracefully', async () => {
            const contributor = await makeContributor({ username: 'errorUser', currentStreak: 1 });

            // Force an error by invalidating the contributor
            contributor.username = null; // Invalid username

            await expect(updateStreak(contributor, MON)).rejects.toThrow();
        });
    });

    afterAll(async () => {
        // Disconnect Prisma to allow Jest to exit
        await prisma.$disconnect();
    });
});

describe('US federal holidays (streak exclusions)', () => {
    // Local-time date; the holiday util compares local Y-M-D.
    const d = (y, m, day) => new Date(y, m - 1, day);

    it('flags fixed-date holidays (weekend dates shift to the observed weekday)', () => {
        // Jul 4 2026 is a Saturday -> observed Friday Jul 3 (the actual Saturday
        // is already a weekend, so only the observed weekday is added).
        expect(isUSFederalHoliday(d(2026, 7, 3))).toBe(true);
        expect(isUSFederalHoliday(d(2026, 7, 4))).toBe(false);
        expect(isUSFederalHoliday(d(2026, 12, 25))).toBe(true); // Christmas (Fri)
        expect(isUSFederalHoliday(d(2026, 6, 19))).toBe(true);  // Juneteenth (Fri)
    });

    it('flags floating holidays', () => {
        expect(isUSFederalHoliday(d(2026, 1, 19))).toBe(true);  // MLK — 3rd Mon Jan
        expect(isUSFederalHoliday(d(2026, 5, 25))).toBe(true);  // Memorial — last Mon May
        expect(isUSFederalHoliday(d(2026, 9, 7))).toBe(true);   // Labor — 1st Mon Sep
        expect(isUSFederalHoliday(d(2026, 11, 26))).toBe(true); // Thanksgiving — 4th Thu Nov
    });

    it('does not flag ordinary days', () => {
        expect(isUSFederalHoliday(d(2026, 3, 17))).toBe(false);
        expect(isUSFederalHoliday(d(2026, 8, 12))).toBe(false);
    });

    it('treats weekends and holidays as non-working', () => {
        expect(isNonWorkingDay(d(2026, 1, 3))).toBe(true);   // Saturday
        expect(isNonWorkingDay(d(2026, 1, 4))).toBe(true);   // Sunday
        expect(isNonWorkingDay(d(2026, 12, 25))).toBe(true); // Christmas
        expect(isNonWorkingDay(d(2026, 1, 6))).toBe(false);  // ordinary Tuesday
    });
});

describe('countWorkingDays (challenge window sizing)', () => {
    const d = (y, m, day) => new Date(y, m - 1, day);

    it('counts the weekdays in a Monday-to-Monday week', () => {
        // Mon Aug 3 2026 through Mon Aug 10 2026 (end exclusive): Mon-Fri.
        expect(countWorkingDays(d(2026, 8, 3), d(2026, 8, 10))).toBe(5);
    });

    it('excludes a federal holiday inside the window', () => {
        // Labor Day is Mon Sep 7 2026, so that week only offers Tue-Fri.
        expect(countWorkingDays(d(2026, 9, 7), d(2026, 9, 14))).toBe(4);
    });

    it('excludes weekends regardless of where the window starts', () => {
        // Sat Aug 8 2026 through Sat Aug 15 2026: Mon-Fri.
        expect(countWorkingDays(d(2026, 8, 8), d(2026, 8, 15))).toBe(5);
    });

    it('treats the end of the window as exclusive', () => {
        // Mon only, since Tue is the exclusive end.
        expect(countWorkingDays(d(2026, 8, 3), d(2026, 8, 4))).toBe(1);
    });

    it('returns 0 for an empty or inverted window', () => {
        expect(countWorkingDays(d(2026, 8, 3), d(2026, 8, 3))).toBe(0);
        expect(countWorkingDays(d(2026, 8, 10), d(2026, 8, 3))).toBe(0);
    });

    it('ignores the time of day on the boundaries', () => {
        const start = new Date(2026, 7, 3, 23, 59, 59);
        const end = new Date(2026, 7, 10, 0, 0, 1);
        expect(countWorkingDays(start, end)).toBe(5);
    });
});

describe('startOfWorkWeek', () => {
    it('returns the same day for a Monday', () => {
        expect(startOfWorkWeek(new Date(2026, 5, 1, 14, 30))).toEqual(new Date(2026, 5, 1));
    });

    it('walks back to Monday from mid-week', () => {
        expect(startOfWorkWeek(new Date(2026, 5, 4))).toEqual(new Date(2026, 5, 1));
    });

    it('keeps Saturday and Sunday in the week that began on Monday', () => {
        expect(startOfWorkWeek(new Date(2026, 5, 6))).toEqual(new Date(2026, 5, 1));
        expect(startOfWorkWeek(new Date(2026, 5, 7))).toEqual(new Date(2026, 5, 1));
    });

    it('crosses a month boundary', () => {
        // Wed Jul 1 2026 belongs to the week that started Mon Jun 29.
        expect(startOfWorkWeek(new Date(2026, 6, 1))).toEqual(new Date(2026, 5, 29));
    });
});
