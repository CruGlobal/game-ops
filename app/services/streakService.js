import { prisma } from '../lib/prisma.js';
import { emitStreakUpdate } from '../utils/socketEmitter.js';
import { isNonWorkingDay, startOfWorkWeek, countWorkingDays } from '../utils/holidays.js';
import logger from '../utils/logger.js';

/**
 * A streak is the number of workdays in the CURRENT week on which a contributor
 * contributed: 0 to 5, or 0 to 4 in a week holding a federal holiday. It resets every
 * Monday.
 *
 * The ceiling is a property of the value, not a display rule, so nothing downstream can
 * reward or challenge anyone for working more than a five-day week. Weekend and holiday
 * work is neutral in both directions: it cannot break a streak and it cannot advance one.
 *
 * The tally is derived from the per-day `Contribution` and `Review` rows rather than
 * accumulated, which makes it recomputable and idempotent under replay. Every caller
 * writes its day row before calling in — see `updateContributor` in contributorService.
 */

/** The most a normal week can hold. Holiday weeks are lower; see `weekWindow`. */
export const FULL_WORKWEEK = 5;

/** Collapses two Dates that fall on the same calendar day to one key. */
const dayKey = (date) => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;

/** The Monday-to-Monday window containing `asOf`, plus the workdays it holds. */
function weekWindow(asOf) {
    const start = startOfWorkWeek(asOf);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end, ceiling: countWorkingDays(start, end) };
}

/** Distinct workdays inside `window` on which this contributor merged a PR or reviewed. */
async function weeklyTally(contributorId, window) {
    const where = { contributorId, date: { gte: window.start, lt: window.end } };
    const [contributions, reviews] = await Promise.all([
        prisma.contribution.findMany({ where, select: { date: true } }),
        prisma.review.findMany({ where, select: { date: true } })
    ]);

    const days = new Set();
    for (const row of [...contributions, ...reviews]) {
        if (!isNonWorkingDay(row.date)) days.add(dayKey(row.date));
    }
    return days.size;
}

/**
 * Recompute a contributor's streak from this week's contribution rows.
 * @param {Object} contributor - Contributor record
 * @param {Date} contributionDate - Date of the new contribution
 * @returns {Object} { currentStreak, ceiling, changed, weekendOrHoliday }
 */
export const updateStreak = async (contributor, contributionDate) => {
    try {
        // Validate contributor identity early to catch invalid input
        if (!contributor || typeof contributor.username !== 'string' || !contributor.username.trim()) {
            throw new Error('Invalid contributor username');
        }

        const day = new Date(contributionDate);
        day.setHours(0, 0, 0, 0);
        const window = weekWindow(day);
        const previous = Number(contributor.currentStreak);

        if (isNonWorkingDay(day)) {
            // Nothing to record. Writing lastContributionDate here would be enough to
            // make a weekend commit look like a workday to anything reading it.
            logger.info('Streak unchanged for non-working day', {
                username: contributor.username,
                date: day,
                currentStreak: previous
            });

            return {
                currentStreak: previous,
                ceiling: window.ceiling,
                changed: false,
                weekendOrHoliday: true
            };
        }

        const contributorId = contributor.id ?? (await prisma.contributor.findUnique({
            where: { username: contributor.username },
            select: { id: true }
        }))?.id;

        const tally = await weeklyTally(contributorId, window);

        const updated = await prisma.contributor.update({
            where: { username: contributor.username },
            data: {
                currentStreak: tally,
                lastContributionDate: day
            }
        });

        if (tally !== previous) {
            emitStreakUpdate({
                username: updated.username,
                currentStreak: tally,
                longestStreak: Number(updated.longestStreak)
            });
        }

        logger.info('Streak recomputed', {
            username: updated.username,
            currentStreak: tally,
            ceiling: window.ceiling,
            weekStart: window.start
        });

        return {
            currentStreak: tally,
            ceiling: window.ceiling,
            changed: tally !== previous,
            weekendOrHoliday: false
        };
    } catch (error) {
        logger.error('Error updating streak', {
            username: contributor?.username,
            error: error.message
        });
        throw error;
    }
};

/**
 * Award the one streak badge: contributing on every workday of a week.
 *
 * The 30, 90 and 365-day chain badges are retired — nothing awards them any more, and
 * the `thirtyDayBadge` / `ninetyDayBadge` / `yearLongBadge` columns keep whatever they
 * already hold so nobody loses a badge they earned under the old rules.
 *
 * @param {Object} contributor - Contributor record
 * @returns {Array} Newly awarded streak badges
 */
export const checkStreakBadges = async (contributor) => {
    try {
        const streak = Number(contributor.currentStreak);
        if (streak < FULL_WORKWEEK || contributor.sevenDayBadge) return [];

        // `seven_day_badge` is a legacy column name from the 7/30/90/365 ladder; it now
        // records a full workweek. Renaming it would cost a migration for no behavior.
        await prisma.contributor.update({
            where: { username: contributor.username },
            data: { sevenDayBadge: true }
        });

        logger.info('Streak badge awarded', {
            username: contributor.username,
            badge: 'Week Warrior'
        });

        return [{ name: 'Week Warrior', workdays: FULL_WORKWEEK }];
    } catch (error) {
        logger.error('Error checking streak badges', {
            username: contributor.username,
            error: error.message
        });
        throw error;
    }
};

/**
 * Reset a contributor's streak
 * @param {Object} contributor - Contributor document
 */
export const resetStreak = async (contributor) => {
    try {
        await prisma.contributor.update({
            where: { username: contributor.username },
            data: {
                currentStreak: 0,
                lastContributionDate: null
            }
        });

        logger.info('Streak reset', {
            username: contributor.username
        });

        return { success: true };
    } catch (error) {
        logger.error('Error resetting streak', {
            username: contributor.username,
            error: error.message
        });
        throw error;
    }
};

/**
 * Daily reconciliation: recompute every contributor's streak from this week's rows.
 *
 * `updateStreak` only runs when someone contributes, so without this an idle
 * contributor would carry last week's tally forward. Running daily rather than only on
 * Monday makes it self-healing: a missed run costs nothing, and any value that drifted
 * from the source rows — including the pre-cap chain values, which ran into the
 * hundreds — is corrected on the next pass.
 *
 * @param {Date} [asOf] - the day to evaluate against (defaults to today)
 * @returns {Object} { checked, updated }
 */
export const reconcileWeeklyStreaks = async (asOf = new Date()) => {
    const window = weekWindow(asOf);
    const where = { date: { gte: window.start, lt: window.end } };

    const [contributions, reviews, contributors] = await Promise.all([
        prisma.contribution.findMany({ where, select: { contributorId: true, date: true } }),
        prisma.review.findMany({ where, select: { contributorId: true, date: true } }),
        prisma.contributor.findMany({
            select: { id: true, username: true, currentStreak: true, longestStreak: true }
        })
    ]);

    const daysByContributor = new Map();
    for (const row of [...contributions, ...reviews]) {
        if (isNonWorkingDay(row.date)) continue;
        if (!daysByContributor.has(row.contributorId)) daysByContributor.set(row.contributorId, new Set());
        daysByContributor.get(row.contributorId).add(dayKey(row.date));
    }

    let updated = 0;
    for (const c of contributors) {
        const tally = daysByContributor.get(c.id)?.size ?? 0;
        if (Number(c.currentStreak) === tally) continue;

        await prisma.contributor.update({
            where: { id: c.id },
            data: { currentStreak: tally }
        });
        emitStreakUpdate({
            username: c.username,
            currentStreak: tally,
            longestStreak: Number(c.longestStreak)
        });
        updated++;
    }

    logger.info('Weekly streak reconciliation complete', {
        checked: contributors.length,
        updated,
        weekStart: window.start,
        ceiling: window.ceiling
    });
    return { checked: contributors.length, updated };
};

/**
 * Get streak statistics for a contributor
 * @param {String} username - GitHub username
 * @returns {Object} Streak statistics
 */
export const getStreakStats = async (username) => {
    try {
        const contributor = await prisma.contributor.findUnique({
            where: { username },
            select: {
                username: true,
                currentStreak: true,
                longestStreak: true,
                lastContributionDate: true,
                sevenDayBadge: true,
                thirtyDayBadge: true,
                ninetyDayBadge: true,
                yearLongBadge: true
            }
        });

        if (!contributor) {
            // Return default streak data for non-existent users
            return {
                username,
                currentStreak: 0,
                longestStreak: 0,
                lastContributionDate: null,
                streakBadges: {
                    sevenDay: false,
                    thirtyDay: false,
                    ninetyDay: false,
                    yearLong: false
                }
            };
        }

        return {
            username: contributor.username,
            currentStreak: Number(contributor.currentStreak),
            longestStreak: Number(contributor.longestStreak),
            lastContributionDate: contributor.lastContributionDate,
            streakBadges: {
                sevenDay: contributor.sevenDayBadge,
                thirtyDay: contributor.thirtyDayBadge,
                ninetyDay: contributor.ninetyDayBadge,
                yearLong: contributor.yearLongBadge
            }
        };
    } catch (error) {
        logger.error('Error getting streak stats', {
            username,
            error: error.message
        });
        throw error;
    }
};

/**
 * Get streak leaderboard
 * @param {Number} limit - Number of results to return
 * @param {Object} options - Optional parameters
 * @param {boolean} options.userShowDevOps - User's preference to show/hide DevOps members
 * @param {boolean} options.userIsDevOps - Whether the requesting user is in DevOps team
 * @returns {Array} Top contributors by current streak
 */
export const getStreakLeaderboard = async (limit = 10, options = {}) => {
    try {
        // Check if DevOps filter is enabled globally
        const settings = await prisma.quarterSettings.findUnique({
            where: { id: 'quarter-config' }
        });
        const globalExcludeDevOps = settings?.excludeDevOpsFromLeaderboards || false;

        // Apply user preference logic
        let excludeDevOps;
        if (options.userIsDevOps) {
            excludeDevOps = !options.userShowDevOps;
        } else {
            excludeDevOps = globalExcludeDevOps;
        }

        const contributors = await prisma.contributor.findMany({
            where: {
                // Exclude DevOps team members if filter is enabled
                ...(excludeDevOps && { isDevOps: false })
            },
            // Ties break on username, not on longestStreak: that column still holds
            // pre-cap chains in the dozens, so ordering by it would keep ranking people
            // on how long they once went without a day off.
            orderBy: [
                { currentStreak: 'desc' },
                { username: 'asc' }
            ],
            take: limit,
            select: {
                username: true,
                avatarUrl: true,
                currentStreak: true,
                longestStreak: true,
                sevenDayBadge: true,
                thirtyDayBadge: true,
                ninetyDayBadge: true,
                yearLongBadge: true
            }
        });

        return contributors.map(c => ({
            username: c.username,
            avatarUrl: c.avatarUrl,
            currentStreak: Number(c.currentStreak),
            longestStreak: Number(c.longestStreak),
            streakBadges: {
                sevenDay: c.sevenDayBadge,
                thirtyDay: c.thirtyDayBadge,
                ninetyDay: c.ninetyDayBadge,
                yearLong: c.yearLongBadge
            }
        }));
    } catch (error) {
        logger.error('Error getting streak leaderboard', {
            error: error.message
        });
        throw error;
    }
};
