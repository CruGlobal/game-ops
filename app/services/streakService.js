import { prisma } from '../lib/prisma.js';
import { emitStreakUpdate } from '../utils/socketEmitter.js';
import logger from '../utils/logger.js';

/**
 * Calculate the number of business days (weekdays) between two dates
 * Excludes weekends (Saturday and Sunday)
 * @param {Date} startDate - Start date (exclusive)
 * @param {Date} endDate - End date (inclusive)
 * @returns {Number} Number of business days between dates
 */
function getBusinessDaysBetween(startDate, endDate) {
    let businessDays = 0;
    let currentDate = new Date(startDate);
    currentDate.setDate(currentDate.getDate() + 1); // Start from day after startDate

    while (currentDate <= endDate) {
        const dayOfWeek = currentDate.getDay();
        // 0 = Sunday, 6 = Saturday - skip weekends
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            businessDays++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return businessDays;
}

/**
 * Update contributor's streak based on new contribution date
 * Streak continues across weekends but breaks if workdays are missed
 * Contributions include both PR merges and code reviews
 * @param {Object} contributor - Contributor document
 * @param {Date} contributionDate - Date of the new contribution
 * @returns {Object} Updated streak data
 */
export const updateStreak = async (contributor, contributionDate) => {
    try {
        // Validate contributor identity early to catch invalid input
        if (!contributor || typeof contributor.username !== 'string' || !contributor.username.trim()) {
            throw new Error('Invalid contributor username');
        }
        const today = new Date(contributionDate);
        today.setHours(0, 0, 0, 0);

        const lastDate = contributor.lastContributionDate
            ? new Date(contributor.lastContributionDate)
            : null;

        if (lastDate) {
            lastDate.setHours(0, 0, 0, 0);
            const calendarDays = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));
            const businessDaysGap = getBusinessDaysBetween(lastDate, today);

            if (calendarDays === 0) {
                // Same day contribution - no streak change
                return {
                    currentStreak: Number(contributor.currentStreak),
                    streakContinued: false,
                    streakBroken: false
                };
            } else if (businessDaysGap === 0) {
                // Only weekends passed (e.g., Friday → Monday with no weekdays between)
                // Update lastContributionDate but don't increment streak
                await prisma.contributor.update({
                    where: { username: contributor.username },
                    data: {
                        lastContributionDate: today
                    }
                });

                logger.info('Streak maintained across weekend', {
                    username: contributor.username,
                    currentStreak: Number(contributor.currentStreak),
                    calendarDays,
                    businessDaysGap
                });

                return {
                    currentStreak: Number(contributor.currentStreak),
                    streakContinued: false,
                    streakBroken: false,
                    weekendGap: true
                };
            } else if (businessDaysGap === 1) {
                // Next business day - increment streak
                const newCurrentStreak = Number(contributor.currentStreak) + 1;
                const newLongestStreak = Math.max(newCurrentStreak, Number(contributor.longestStreak));

                const updated = await prisma.contributor.update({
                    where: { username: contributor.username },
                    data: {
                        currentStreak: newCurrentStreak,
                        longestStreak: newLongestStreak,
                        lastContributionDate: today
                    }
                });

                // Emit WebSocket event
                emitStreakUpdate({
                    username: updated.username,
                    currentStreak: Number(updated.currentStreak),
                    longestStreak: Number(updated.longestStreak)
                });

                logger.info('Streak continued', {
                    username: updated.username,
                    currentStreak: Number(updated.currentStreak),
                    calendarDays,
                    businessDaysGap
                });

                return {
                    currentStreak: Number(updated.currentStreak),
                    streakContinued: true,
                    streakBroken: false
                };
            } else {
                // Missed business days - streak broken, reset to 1
                const oldStreak = Number(contributor.currentStreak);

                const updated = await prisma.contributor.update({
                    where: { username: contributor.username },
                    data: {
                        currentStreak: 1,
                        lastContributionDate: today
                    }
                });

                logger.info('Streak broken', {
                    username: updated.username,
                    oldStreak,
                    newStreak: 1,
                    calendarDays,
                    businessDaysGap: businessDaysGap,
                    missedBusinessDays: businessDaysGap - 1
                });

                return {
                    currentStreak: 1,
                    streakContinued: false,
                    streakBroken: true,
                    oldStreak
                };
            }
        } else {
            // First contribution - start streak
            const updated = await prisma.contributor.update({
                where: { username: contributor.username },
                data: {
                    currentStreak: 1,
                    longestStreak: 1,
                    lastContributionDate: today
                }
            });

            logger.info('Streak started', {
                username: updated.username
            });

            return {
                currentStreak: 1,
                streakContinued: false,
                streakBroken: false,
                firstStreak: true
            };
        }
    } catch (error) {
        logger.error('Error updating streak', {
            username: contributor.username,
            error: error.message
        });
        throw error;
    }
};

/**
 * Check and award streak badges
 * @param {Object} contributor - Contributor document
 * @returns {Array} Newly awarded streak badges
 */
export const checkStreakBadges = async (contributor) => {
    try {
        const newBadges = [];
        const streak = Number(contributor.currentStreak);
        const updateData = {};
        let needsUpdate = false;

        // Check 7-day streak
        if (streak >= 7 && !contributor.sevenDayBadge) {
            updateData.sevenDayBadge = true;
            newBadges.push({ name: 'Week Warrior', days: 7 });
            needsUpdate = true;
            logger.info('Streak badge awarded', {
                username: contributor.username,
                badge: '7-day streak'
            });
        }

        // Check 30-day streak
        if (streak >= 30 && !contributor.thirtyDayBadge) {
            updateData.thirtyDayBadge = true;
            newBadges.push({ name: 'Monthly Master', days: 30 });
            needsUpdate = true;
            logger.info('Streak badge awarded', {
                username: contributor.username,
                badge: '30-day streak'
            });
        }

        // Check 90-day streak
        if (streak >= 90 && !contributor.ninetyDayBadge) {
            updateData.ninetyDayBadge = true;
            newBadges.push({ name: 'Quarter Champion', days: 90 });
            needsUpdate = true;
            logger.info('Streak badge awarded', {
                username: contributor.username,
                badge: '90-day streak'
            });
        }

        // Check 365-day streak
        if (streak >= 365 && !contributor.yearLongBadge) {
            updateData.yearLongBadge = true;
            newBadges.push({ name: 'Year-Long Hero', days: 365 });
            needsUpdate = true;
            logger.info('Streak badge awarded', {
                username: contributor.username,
                badge: '365-day streak'
            });
        }

        if (needsUpdate) {
            await prisma.contributor.update({
                where: { username: contributor.username },
                data: updateData
            });
        }

        return newBadges;
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
            orderBy: [
                { currentStreak: 'desc' },
                { longestStreak: 'desc' }
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
