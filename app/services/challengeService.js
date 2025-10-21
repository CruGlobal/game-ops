import { prisma } from '../lib/prisma.js';
import { emitChallengeProgress, emitChallengeCompleted } from '../utils/socketEmitter.js';
import logger from '../utils/logger.js';

/**
 * Create a new challenge
 * @param {Object} challengeData - Challenge data
 * @returns {Object} Created challenge
 */
export const createChallenge = async (challengeData) => {
    try {
        const challenge = await prisma.challenge.create({
            data: challengeData
        });

        logger.info('Challenge created', {
            challengeId: challenge.id,
            title: challenge.title,
            type: challenge.type
        });

        return challenge;
    } catch (error) {
        logger.error('Error creating challenge', {
            error: error.message
        });
        throw error;
    }
};

/**
 * Get all active challenges
 * @returns {Array} Active challenges
 */
export const getActiveChallenges = async () => {
    try {
        const now = new Date();
        const challenges = await prisma.challenge.findMany({
            where: {
                status: 'active',
                endDate: {
                    gte: now
                }
            },
            orderBy: {
                startDate: 'desc'
            }
        });

        return challenges;
    } catch (error) {
        logger.error('Error getting active challenges', {
            error: error.message
        });
        throw error;
    }
};

/**
 * Get challenge by ID
 * @param {String} challengeId - Challenge ID
 * @returns {Object} Challenge
 */
export const getChallengeById = async (challengeId) => {
    try {
        const challenge = await prisma.challenge.findUnique({
            where: { id: challengeId }
        });

        if (!challenge) {
            throw new Error('Challenge not found');
        }

        return challenge;
    } catch (error) {
        logger.error('Error getting challenge', {
            challengeId,
            error: error.message
        });
        throw error;
    }
};

/**
 * Join a challenge
 * @param {String} username - GitHub username
 * @param {String} challengeId - Challenge ID
 * @returns {Object} Updated challenge and contributor
 */
export const joinChallenge = async (username, challengeId) => {
    try {
        const challenge = await prisma.challenge.findUnique({
            where: { id: challengeId },
            include: {
                participants: {
                    where: { username }
                }
            }
        });

        if (!challenge) {
            throw new Error('Challenge not found');
        }

        const contributor = await prisma.contributor.findUnique({
            where: { username }
        });

        if (!contributor) {
            throw new Error('Contributor not found. Only users with at least one merged PR can join challenges. Please contribute to the repository first.');
        }

        // Check if already joined
        if (challenge.participants.length > 0) {
            throw new Error('Already joined this challenge');
        }

        // Check if challenge is active
        if (challenge.status !== 'active') {
            throw new Error('Challenge is not active');
        }

        // Add to challenge participants
        await prisma.challengeParticipant.create({
            data: {
                challengeId,
                username,
                progress: 0,
                completed: false,
                joinedAt: new Date()
            }
        });

        // Add to contributor's active challenges
        const activeChallenges = contributor.activeChallenges || [];
        activeChallenges.push({
            challengeId,
            progress: 0,
            target: challenge.target,
            joined: new Date()
        });

        await prisma.contributor.update({
            where: { username },
            data: { activeChallenges }
        });

        logger.info('User joined challenge', {
            username,
            challengeId,
            title: challenge.title
        });

        return {
            challenge,
            contributor
        };
    } catch (error) {
        logger.error('Error joining challenge', {
            username,
            challengeId,
            error: error.message
        });
        throw error;
    }
};

/**
 * Update challenge progress for a user
 * @param {String} username - GitHub username
 * @param {String} challengeId - Challenge ID
 * @param {Number} increment - Progress increment
 * @returns {Object} Updated progress
 */
export const updateChallengeProgress = async (username, challengeId, increment = 1) => {
    try {
        const challenge = await prisma.challenge.findUnique({
            where: { id: challengeId }
        });

        const participant = await prisma.challengeParticipant.findUnique({
            where: {
                challengeId_username: {
                    challengeId,
                    username
                }
            }
        });

        if (!challenge || !participant) {
            return null;
        }

        const newProgress = participant.progress + increment;

        // Check if completed
        if (newProgress >= challenge.target && !participant.completed) {
            await prisma.challengeParticipant.update({
                where: {
                    challengeId_username: {
                        challengeId,
                        username
                    }
                },
                data: {
                    progress: newProgress,
                    completed: true
                }
            });
            await completeChallenge(username, challengeId);
        } else {
            await prisma.challengeParticipant.update({
                where: {
                    challengeId_username: {
                        challengeId,
                        username
                    }
                },
                data: {
                    progress: newProgress
                }
            });

            // Emit progress update
            emitChallengeProgress({
                username,
                challengeId: challenge.id,
                challengeName: challenge.title,
                progress: newProgress,
                target: challenge.target,
                percentComplete: (newProgress / challenge.target) * 100
            });
        }

        // Update contributor's active challenge
        const contributor = await prisma.contributor.findUnique({
            where: { username },
            select: { activeChallenges: true }
        });

        if (contributor && contributor.activeChallenges) {
            const activeChallenges = contributor.activeChallenges.map(c =>
                c.challengeId === challengeId ? { ...c, progress: newProgress } : c
            );

            await prisma.contributor.update({
                where: { username },
                data: { activeChallenges }
            });
        }

        logger.info('Challenge progress updated', {
            username,
            challengeId,
            newProgress
        });

        return {
            progress: newProgress,
            target: challenge.target,
            completed: newProgress >= challenge.target
        };
    } catch (error) {
        logger.error('Error updating challenge progress', {
            username,
            challengeId,
            error: error.message
        });
        throw error;
    }
};

/**
 * Complete a challenge for a user
 * @param {String} username - GitHub username
 * @param {String} challengeId - Challenge ID
 * @returns {Object} Completion data
 */
export const completeChallenge = async (username, challengeId) => {
    try {
        const challenge = await prisma.challenge.findUnique({
            where: { id: challengeId }
        });

        const contributor = await prisma.contributor.findUnique({
            where: { username },
            select: {
                totalPoints: true,
                activeChallenges: true,
                completedChallenges: true
            }
        });

        if (!challenge || !contributor) {
            throw new Error('Challenge or contributor not found');
        }

        // Award reward points
        const newTotalPoints = Number(contributor.totalPoints) + challenge.reward;

        // Move from active to completed
        const activeChallenges = (contributor.activeChallenges || []).filter(
            c => c.challengeId !== challengeId
        );

        const completedChallenges = contributor.completedChallenges || [];
        completedChallenges.push({
            challengeId,
            completedAt: new Date(),
            reward: challenge.reward
        });

        await prisma.contributor.update({
            where: { username },
            data: {
                totalPoints: newTotalPoints,
                activeChallenges,
                completedChallenges,
                pointsHistory: {
                    create: {
                        points: challenge.reward,
                        reason: 'Challenge Completed',
                        prNumber: null,
                        timestamp: new Date()
                    }
                }
            }
        });

        // Emit completion event
        emitChallengeCompleted({
            username,
            challengeId: challenge.id,
            challengeName: challenge.title,
            reward: challenge.reward,
            totalPoints: newTotalPoints
        });

        logger.info('Challenge completed', {
            username,
            challengeId,
            title: challenge.title,
            reward: challenge.reward
        });

        return {
            challenge,
            reward: challenge.reward,
            totalPoints: newTotalPoints
        };
    } catch (error) {
        logger.error('Error completing challenge', {
            username,
            challengeId,
            error: error.message
        });
        throw error;
    }
};

/**
 * Get challenges for a specific user
 * @param {String} username - GitHub username
 * @returns {Object} User's challenges
 */
export const getUserChallenges = async (username) => {
    try {
        const contributor = await prisma.contributor.findUnique({
            where: { username },
            select: {
                activeChallenges: true,
                completedChallenges: true
            }
        });

        if (!contributor) {
            throw new Error('Contributor not found');
        }

        return {
            username,
            activeChallenges: contributor.activeChallenges || [],
            completedChallenges: contributor.completedChallenges || [],
            totalCompleted: (contributor.completedChallenges || []).length
        };
    } catch (error) {
        logger.error('Error getting user challenges', {
            username,
            error: error.message
        });
        throw error;
    }
};

/**
 * Generate weekly challenges automatically
 * @returns {Array} Generated challenges
 */
export const generateWeeklyChallenges = async () => {
    try {
        const now = new Date();
        const startOfWeek = new Date(now);
        startOfWeek.setHours(0, 0, 0, 0);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(endOfWeek.getDate() + 7);

        const challengeTemplates = [
            {
                title: 'Sprint Master',
                description: 'Merge 5 PRs this week',
                type: 'pr-merge',
                target: 5,
                reward: 250,
                difficulty: 'medium'
            },
            {
                title: 'Review Champion',
                description: 'Complete 10 code reviews this week',
                type: 'review',
                target: 10,
                reward: 200,
                difficulty: 'medium'
            },
            {
                title: 'Streak Builder',
                description: 'Maintain a 7-day contribution streak',
                type: 'streak',
                target: 7,
                reward: 300,
                difficulty: 'hard'
            },
            {
                title: 'Point Hunter',
                description: 'Earn 500 points this week',
                type: 'points',
                target: 500,
                reward: 150,
                difficulty: 'easy'
            }
        ];

        const generatedChallenges = [];

        // Generate 3 random challenges
        const shuffled = challengeTemplates.sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 3);

        for (const template of selected) {
            const challenge = await createChallenge({
                ...template,
                startDate: startOfWeek,
                endDate: endOfWeek,
                status: 'active',
                category: 'individual'
            });

            generatedChallenges.push(challenge);
        }

        logger.info('Weekly challenges generated', {
            count: generatedChallenges.length,
            startDate: startOfWeek,
            endDate: endOfWeek
        });

        return generatedChallenges;
    } catch (error) {
        logger.error('Error generating weekly challenges', {
            error: error.message
        });
        throw error;
    }
};

/**
 * Check and update expired challenges
 * @returns {Number} Number of challenges updated
 */
export const checkExpiredChallenges = async () => {
    try {
        const now = new Date();

        const result = await prisma.challenge.updateMany({
            where: {
                status: 'active',
                endDate: {
                    lt: now
                }
            },
            data: {
                status: 'expired'
            }
        });

        logger.info('Expired challenges updated', {
            count: result.count
        });

        return result.count;
    } catch (error) {
        logger.error('Error checking expired challenges', {
            error: error.message
        });
        throw error;
    }
};

/**
 * Get challenge leaderboard
 * @param {String} challengeId - Challenge ID
 * @returns {Array} Challenge leaderboard
 */
export const getChallengeLeaderboard = async (challengeId) => {
    try {
        const challenge = await prisma.challenge.findUnique({
            where: { id: challengeId },
            include: {
                participants: {
                    orderBy: {
                        progress: 'desc'
                    },
                    take: 20
                }
            }
        });

        if (!challenge) {
            throw new Error('Challenge not found');
        }

        return {
            challengeId: challenge.id,
            title: challenge.title,
            target: challenge.target,
            leaderboard: challenge.participants
        };
    } catch (error) {
        logger.error('Error getting challenge leaderboard', {
            challengeId,
            error: error.message
        });
        throw error;
    }
};

/**
 * Check if PR labels match challenge label filters
 * @param {Array} prLabels - PR labels from GitHub
 * @param {Array} labelFilters - Challenge label filters
 * @returns {Boolean} True if labels match
 */
export const checkLabelMatch = (prLabels, labelFilters) => {
    if (!labelFilters || labelFilters.length === 0) {
        return true; // No filters means all PRs count
    }

    if (!prLabels || prLabels.length === 0) {
        return false; // No labels on PR, can't match
    }

    // Normalize PR labels to strings
    const normalizedPRLabels = prLabels.map(l =>
        (typeof l === 'string' ? l : l.name).toLowerCase().trim()
    );

    // Check if any filter matches any PR label
    return labelFilters.some(filter => {
        const normalizedFilter = filter.toLowerCase().trim();

        // Support wildcard matching with *
        if (normalizedFilter.includes('*')) {
            const regex = new RegExp('^' + normalizedFilter.replace(/\*/g, '.*') + '$');
            return normalizedPRLabels.some(label => regex.test(label));
        }

        // Exact match or substring match
        return normalizedPRLabels.some(label =>
            label === normalizedFilter || label.includes(normalizedFilter)
        );
    });
};

/**
 * Create an OKR-based challenge
 * @param {Object} okrData - OKR challenge data
 * @returns {Object} Created challenge
 */
export const createOKRChallenge = async (okrData) => {
    try {
        const {
            title,
            description,
            labelFilters,
            target,
            reward,
            startDate,
            endDate,
            difficulty,
            okrMetadata
        } = okrData;

        // Validate required fields
        if (!title || !description || !labelFilters || labelFilters.length === 0) {
            throw new Error('Title, description, and at least one label filter are required');
        }

        if (!target || target < 1) {
            throw new Error('Target must be at least 1');
        }

        const challenge = await prisma.challenge.create({
            data: {
                title,
                description,
                type: 'okr-label',
                labelFilters,
                target,
                reward: reward || 300, // Default OKR reward
                startDate: startDate || new Date(),
                endDate,
                difficulty: difficulty || 'hard',
                category: 'community', // OKR challenges are typically team-based
                status: 'active',
                okrMetadata: okrMetadata || {}
            }
        });

        logger.info('OKR challenge created', {
            challengeId: challenge.id,
            title: challenge.title,
            labelFilters: challenge.labelFilters,
            department: okrMetadata?.department
        });

        return challenge;
    } catch (error) {
        logger.error('Error creating OKR challenge', {
            error: error.message
        });
        throw error;
    }
};
