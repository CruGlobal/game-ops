import Contributor from '../models/contributor.js';
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
                    currentStreak: contributor.currentStreak,
                    streakContinued: false,
                    streakBroken: false
                };
            } else if (daysDiff === 1) {
                // Consecutive day - increment streak
                contributor.currentStreak += 1;
                contributor.lastContributionDate = today;

                // Update longest streak if needed
                if (contributor.currentStreak > contributor.longestStreak) {
                    contributor.longestStreak = contributor.currentStreak;
                }

                await contributor.save();

                // Emit WebSocket event
                emitStreakUpdate({
                    username: contributor.username,
                    currentStreak: contributor.currentStreak,
                    longestStreak: contributor.longestStreak
                });

                logger.info('Streak continued', {
                    username: contributor.username,
                    currentStreak: contributor.currentStreak
                });

                return {
                    currentStreak: contributor.currentStreak,
                    streakContinued: true,
                    streakBroken: false
                };
            } else {
                // Streak broken - reset to 1
                const oldStreak = contributor.currentStreak;
                contributor.currentStreak = 1;
                contributor.lastContributionDate = today;

                await contributor.save();

                logger.info('Streak broken', {
                    username: contributor.username,
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
            contributor.currentStreak = 1;
            contributor.longestStreak = 1;
            contributor.lastContributionDate = today;

            await contributor.save();

            logger.info('Streak started', {
                username: contributor.username
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
        const streak = contributor.currentStreak;

        // Check 7-day streak
        if (streak >= 7 && !contributor.streakBadges.sevenDay) {
            contributor.streakBadges.sevenDay = true;
            newBadges.push({ name: 'Week Warrior', days: 7 });
            logger.info('Streak badge awarded', {
                username: contributor.username,
                badge: '7-day streak'
            });
        }

        // Check 30-day streak
        if (streak >= 30 && !contributor.streakBadges.thirtyDay) {
            contributor.streakBadges.thirtyDay = true;
            newBadges.push({ name: 'Monthly Master', days: 30 });
            logger.info('Streak badge awarded', {
                username: contributor.username,
                badge: '30-day streak'
            });
        }

        // Check 90-day streak
        if (streak >= 90 && !contributor.streakBadges.ninetyDay) {
            contributor.streakBadges.ninetyDay = true;
            newBadges.push({ name: 'Quarter Champion', days: 90 });
            logger.info('Streak badge awarded', {
                username: contributor.username,
                badge: '90-day streak'
            });
        }

        // Check 365-day streak
        if (streak >= 365 && !contributor.streakBadges.yearLong) {
            contributor.streakBadges.yearLong = true;
            newBadges.push({ name: 'Year-Long Hero', days: 365 });
            logger.info('Streak badge awarded', {
                username: contributor.username,
                badge: '365-day streak'
            });
        }

        if (newBadges.length > 0) {
            await contributor.save();
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
        contributor.currentStreak = 0;
        contributor.lastContributionDate = null;
        await contributor.save();

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
        const contributor = await Contributor.findOne({ username });

        if (!contributor) {
            throw new Error('Contributor not found');
        }

        return {
            username: contributor.username,
            currentStreak: contributor.currentStreak,
            longestStreak: contributor.longestStreak,
            lastContributionDate: contributor.lastContributionDate,
            streakBadges: contributor.streakBadges
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
        const contributors = await Contributor.find()
            .sort({ currentStreak: -1, longestStreak: -1 })
            .limit(limit)
            .select('username avatarUrl currentStreak longestStreak streakBadges');

        return contributors;
    } catch (error) {
        logger.error('Error getting streak leaderboard', {
            error: error.message
        });
        throw error;
    }
};
