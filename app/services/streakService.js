import { prisma } from '../lib/prisma.js';
import { emitStreakUpdate } from '../utils/socketEmitter.js';
import logger from '../utils/logger.js';

/**
 * Update contributor's streak based on new contribution date
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
            const daysDiff = Math.floor((today - lastDate) / (1000 * 60 * 60 * 24));

            if (daysDiff === 0) {
                // Same day contribution - no streak change
                return {
                    currentStreak: Number(contributor.currentStreak),
                    streakContinued: false,
                    streakBroken: false
                };
            } else if (daysDiff === 1) {
                // Consecutive day - increment streak
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
                    currentStreak: Number(updated.currentStreak)
                });

                return {
                    currentStreak: Number(updated.currentStreak),
                    streakContinued: true,
                    streakBroken: false
                };
            } else {
                // Streak broken - reset to 1
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
                    newStreak: 1
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
 * @returns {Array} Top contributors by current streak
 */
export const getStreakLeaderboard = async (limit = 10) => {
    try {
        const contributors = await prisma.contributor.findMany({
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
