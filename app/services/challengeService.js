import Challenge from '../models/challenge.js';
import Contributor from '../models/contributor.js';
import { emitChallengeProgress, emitChallengeCompleted } from '../utils/socketEmitter.js';
import logger from '../utils/logger.js';

/**
 * Create a new challenge
 * @param {Object} challengeData - Challenge data
 * @returns {Object} Created challenge
 */
export const createChallenge = async (challengeData) => {
    try {
        const challenge = new Challenge(challengeData);
        await challenge.save();

        logger.info('Challenge created', {
            challengeId: challenge._id,
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
        const challenges = await Challenge.find({
            status: 'active',
            endDate: { $gte: now }
        }).sort({ startDate: -1 });

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
        const challenge = await Challenge.findById(challengeId);

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
        const challenge = await Challenge.findById(challengeId);
        const contributor = await Contributor.findOne({ username });

        if (!challenge) {
            throw new Error('Challenge not found');
        }

        if (!contributor) {
            throw new Error('Contributor not found');
        }

        // Check if already joined
        const alreadyJoined = challenge.participants.some(p => p.username === username);
        if (alreadyJoined) {
            throw new Error('Already joined this challenge');
        }

        // Check if challenge is active
        if (challenge.status !== 'active') {
            throw new Error('Challenge is not active');
        }

        // Add to challenge participants
        challenge.participants.push({
            username,
            progress: 0,
            completed: false,
            joinedAt: new Date()
        });

        await challenge.save();

        // Add to contributor's active challenges
        contributor.activeChallenges.push({
            challengeId: challenge._id,
            progress: 0,
            target: challenge.target,
            joined: new Date()
        });

        await contributor.save();

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
        const challenge = await Challenge.findById(challengeId);
        const contributor = await Contributor.findOne({ username });

        if (!challenge || !contributor) {
            return null;
        }

        // Update challenge participant
        const participant = challenge.participants.find(p => p.username === username);
        if (participant) {
            participant.progress += increment;

            // Check if completed
            if (participant.progress >= challenge.target && !participant.completed) {
                participant.completed = true;
                await completeChallenge(username, challengeId);
            } else {
                await challenge.save();

                // Emit progress update
                emitChallengeProgress({
                    username,
                    challengeId: challenge._id,
                    challengeName: challenge.title,
                    progress: participant.progress,
                    target: challenge.target,
                    percentComplete: (participant.progress / challenge.target) * 100
                });
            }
        }

        // Update contributor's active challenge
        const activeChallenge = contributor.activeChallenges.find(
            c => c.challengeId.toString() === challengeId
        );
        if (activeChallenge) {
            activeChallenge.progress += increment;
            await contributor.save();
        }

        logger.info('Challenge progress updated', {
            username,
            challengeId,
            newProgress: participant?.progress
        });

        return {
            progress: participant?.progress,
            target: challenge.target,
            completed: participant?.completed
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
        const challenge = await Challenge.findById(challengeId);
        const contributor = await Contributor.findOne({ username });

        if (!challenge || !contributor) {
            throw new Error('Challenge or contributor not found');
        }

        // Award reward points
        contributor.totalPoints += challenge.reward;
        contributor.pointsHistory.push({
            points: challenge.reward,
            reason: 'Challenge Completed',
            prNumber: null,
            timestamp: new Date()
        });

        // Move from active to completed
        contributor.activeChallenges = contributor.activeChallenges.filter(
            c => c.challengeId.toString() !== challengeId
        );

        contributor.completedChallenges.push({
            challengeId: challenge._id,
            completedAt: new Date(),
            reward: challenge.reward
        });

        await contributor.save();

        // Emit completion event
        emitChallengeCompleted({
            username,
            challengeId: challenge._id,
            challengeName: challenge.title,
            reward: challenge.reward,
            totalPoints: contributor.totalPoints
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
            totalPoints: contributor.totalPoints
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
        const contributor = await Contributor.findOne({ username })
            .populate('activeChallenges.challengeId')
            .populate('completedChallenges.challengeId');

        if (!contributor) {
            throw new Error('Contributor not found');
        }

        return {
            username,
            activeChallenges: contributor.activeChallenges,
            completedChallenges: contributor.completedChallenges,
            totalCompleted: contributor.completedChallenges.length
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

        const result = await Challenge.updateMany(
            {
                status: 'active',
                endDate: { $lt: now }
            },
            {
                $set: { status: 'expired' }
            }
        );

        logger.info('Expired challenges updated', {
            count: result.modifiedCount
        });

        return result.modifiedCount;
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
        const challenge = await Challenge.findById(challengeId);

        if (!challenge) {
            throw new Error('Challenge not found');
        }

        // Sort participants by progress
        const leaderboard = challenge.participants
            .sort((a, b) => b.progress - a.progress)
            .slice(0, 20); // Top 20

        return {
            challengeId: challenge._id,
            title: challenge.title,
            target: challenge.target,
            leaderboard
        };
    } catch (error) {
        logger.error('Error getting challenge leaderboard', {
            challengeId,
            error: error.message
        });
        throw error;
    }
};
