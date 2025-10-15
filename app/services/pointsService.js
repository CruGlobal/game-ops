import Contributor from '../models/contributor.js';
import { calculatePRPoints, POINT_VALUES, POINT_REASONS } from '../config/points-config.js';
import { emitPointsAwarded } from '../utils/socketEmitter.js';
import logger from '../utils/logger.js';

/**
 * Calculate points for a PR based on labels and streak
 * @param {Object} prData - PR data from GitHub API
 * @param {Object} contributor - Contributor document
 * @returns {Object} Points calculation details
 */
export const calculatePoints = (prData, contributor) => {
    try {
        const labels = prData.labels || [];
        const currentStreak = contributor.currentStreak || 0;

        const points = calculatePRPoints(labels, currentStreak);

        return {
            points,
            labels: labels.map(l => typeof l === 'string' ? l : l.name),
            streak: currentStreak,
            prNumber: prData.number
        };
    } catch (error) {
        logger.error('Error calculating points', {
            prNumber: prData.number,
            error: error.message
        });
        throw error;
    }
};

/**
 * Award points to a contributor
 * @param {Object} contributor - Contributor document
 * @param {Number} points - Points to award
 * @param {String} reason - Reason for points (from POINT_REASONS)
 * @param {Number} prNumber - PR number (optional)
 * @returns {Object} Updated points data
 */
export const awardPoints = async (contributor, points, reason, prNumber = null) => {
    try {
        // Update total points
        contributor.totalPoints += points;

        // Add to points history
        contributor.pointsHistory.push({
            points,
            reason,
            prNumber,
            timestamp: new Date()
        });

        await contributor.save();

        // Emit WebSocket event
        emitPointsAwarded({
            username: contributor.username,
            points,
            totalPoints: contributor.totalPoints,
            reason,
            prNumber
        });

        logger.info('Points awarded', {
            username: contributor.username,
            points,
            totalPoints: contributor.totalPoints,
            reason
        });

        return {
            points,
            totalPoints: contributor.totalPoints,
            reason
        };
    } catch (error) {
        logger.error('Error awarding points', {
            username: contributor.username,
            error: error.message
        });
        throw error;
    }
};

/**
 * Award review points to a contributor
 * @param {Object} contributor - Contributor document
 * @returns {Object} Updated points data
 */
export const awardReviewPoints = async (contributor) => {
    try {
        const reviewPoints = POINT_VALUES.review;
        return await awardPoints(
            contributor,
            reviewPoints,
            POINT_REASONS.REVIEW_COMPLETED,
            null
        );
    } catch (error) {
        logger.error('Error awarding review points', {
            username: contributor.username,
            error: error.message
        });
        throw error;
    }
};

/**
 * Get points leaderboard
 * @param {Number} limit - Number of results to return
 * @returns {Array} Top contributors by points
 */
export const getPointsLeaderboard = async (limit = 10) => {
    try {
        const contributors = await Contributor.find()
            .sort({ totalPoints: -1 })
            .limit(limit)
            .select('username avatarUrl totalPoints prCount reviewCount');

        return contributors;
    } catch (error) {
        logger.error('Error getting points leaderboard', {
            error: error.message
        });
        throw error;
    }
};

/**
 * Get points history for a contributor
 * @param {String} username - GitHub username
 * @param {Number} limit - Number of history entries to return
 * @returns {Array} Points history
 */
export const getPointsHistory = async (username, limit = 50) => {
    try {
        const contributor = await Contributor.findOne({ username })
            .select('username totalPoints pointsHistory');

        if (!contributor) {
            throw new Error('Contributor not found');
        }

        // Sort by most recent first and limit
        const history = contributor.pointsHistory
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);

        return {
            username: contributor.username,
            totalPoints: contributor.totalPoints,
            history
        };
    } catch (error) {
        logger.error('Error getting points history', {
            username,
            error: error.message
        });
        throw error;
    }
};

/**
 * Get total points for a contributor
 * @param {String} username - GitHub username
 * @returns {Object} Points summary
 */
export const getPointsSummary = async (username) => {
    try {
        const contributor = await Contributor.findOne({ username })
            .select('username totalPoints pointsHistory');

        if (!contributor) {
            throw new Error('Contributor not found');
        }

        // Calculate points by reason
        const pointsByReason = {};
        contributor.pointsHistory.forEach(entry => {
            if (!pointsByReason[entry.reason]) {
                pointsByReason[entry.reason] = 0;
            }
            pointsByReason[entry.reason] += entry.points;
        });

        return {
            username: contributor.username,
            totalPoints: contributor.totalPoints,
            pointsByReason,
            totalEntries: contributor.pointsHistory.length
        };
    } catch (error) {
        logger.error('Error getting points summary', {
            username,
            error: error.message
        });
        throw error;
    }
};
