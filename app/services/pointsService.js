import prisma from '../lib/prisma.js';
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
        // Update contributor with new points
        const updatedContributor = await prisma.contributor.update({
            where: { id: contributor.id },
            data: {
                totalPoints: {
                    increment: BigInt(points)
                },
                pointsHistory: {
                    create: {
                        points: BigInt(points),
                        reason,
                        prNumber: prNumber ? BigInt(prNumber) : null,
                        timestamp: new Date()
                    }
                }
            },
            include: {
                pointsHistory: {
                    orderBy: { timestamp: 'desc' },
                    take: 1
                }
            }
        });

        const newTotalPoints = Number(updatedContributor.totalPoints);

        // Emit WebSocket event
        emitPointsAwarded({
            username: updatedContributor.username,
            points,
            totalPoints: newTotalPoints,
            reason,
            prNumber
        });

        logger.info('Points awarded', {
            username: updatedContributor.username,
            points,
            totalPoints: newTotalPoints,
            reason
        });

        return {
            points,
            totalPoints: newTotalPoints,
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
        const contributors = await prisma.contributor.findMany({
            orderBy: { totalPoints: 'desc' },
            take: limit,
            select: {
                username: true,
                avatarUrl: true,
                totalPoints: true,
                prCount: true,
                reviewCount: true
            }
        });

        // Convert BigInt to Number for JSON serialization
        return contributors.map(c => ({
            ...c,
            totalPoints: Number(c.totalPoints),
            prCount: Number(c.prCount),
            reviewCount: Number(c.reviewCount)
        }));
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
        const contributor = await prisma.contributor.findUnique({
            where: { username },
            select: {
                username: true,
                totalPoints: true,
                pointsHistory: {
                    orderBy: { timestamp: 'desc' },
                    take: limit,
                    select: {
                        points: true,
                        reason: true,
                        prNumber: true,
                        timestamp: true
                    }
                }
            }
        });

        if (!contributor) {
            throw new Error('Contributor not found');
        }

        return {
            username: contributor.username,
            totalPoints: Number(contributor.totalPoints),
            history: contributor.pointsHistory.map(h => ({
                points: Number(h.points),
                reason: h.reason,
                prNumber: h.prNumber ? Number(h.prNumber) : null,
                timestamp: h.timestamp
            }))
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
        const contributor = await prisma.contributor.findUnique({
            where: { username },
            select: {
                username: true,
                totalPoints: true,
                pointsHistory: {
                    select: {
                        points: true,
                        reason: true
                    }
                }
            }
        });

        if (!contributor) {
            throw new Error('Contributor not found');
        }

        // Calculate points by reason
        const pointsByReason = {};
        contributor.pointsHistory.forEach(entry => {
            const points = Number(entry.points);
            if (!pointsByReason[entry.reason]) {
                pointsByReason[entry.reason] = 0;
            }
            pointsByReason[entry.reason] += points;
        });

        return {
            username: contributor.username,
            totalPoints: Number(contributor.totalPoints),
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
