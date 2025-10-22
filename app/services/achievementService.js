import { PrismaClient } from '@prisma/client';
import { ACHIEVEMENTS, checkAchievements } from '../config/achievements-config.js';
import { emitAchievementUnlocked } from '../utils/socketEmitter.js';
import logger from '../utils/logger.js';
import { Octokit } from '@octokit/rest';

const prisma = new PrismaClient();
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

/**
 * Check and award new achievements to a contributor
 * @param {Object} contributor - Contributor object with stats
 * @returns {Array} Newly awarded achievements
 */
export const checkAndAwardAchievements = async (contributor) => {
    try {
        const newAchievements = checkAchievements(contributor);

        if (newAchievements.length === 0) {
            return [];
        }

        // Award each new achievement
        for (const achievement of newAchievements) {
            await awardAchievement(contributor, achievement);
        }

        logger.info('Achievements awarded', {
            username: contributor.username,
            count: newAchievements.length,
            achievements: newAchievements.map(a => a.name)
        });

        return newAchievements;
    } catch (error) {
        logger.error('Error checking achievements', {
            username: contributor.username,
            error: error.message
        });
        throw error;
    }
};

/**
 * Award a single achievement to a contributor
 * @param {Object} contributor - Contributor object
 * @param {Object} achievement - Achievement object from config
 * @returns {Object} Achievement data
 */
export const awardAchievement = async (contributor, achievement) => {
    try {
        // Add achievement to database
        await prisma.achievement.create({
            data: {
                contributorId: contributor.id,
                achievementId: achievement.id,
                name: achievement.name,
                description: achievement.description,
                category: achievement.category,
                earnedAt: new Date()
            }
        });

        // Award bonus points
        await prisma.$transaction([
            prisma.contributor.update({
                where: { id: contributor.id },
                data: {
                    totalPoints: {
                        increment: BigInt(achievement.points)
                    }
                }
            }),
            prisma.pointHistory.create({
                data: {
                    contributorId: contributor.id,
                    points: BigInt(achievement.points),
                    reason: 'Achievement Unlocked',
                    prNumber: null,
                    timestamp: new Date()
                }
            })
        ]);

        // Emit WebSocket event
        emitAchievementUnlocked({
            username: contributor.username,
            achievementId: achievement.id,
            achievementName: achievement.name,
            description: achievement.description,
            category: achievement.category,
            points: achievement.points
        });

        // Post GitHub comment notification (async, don't wait)
        postAchievementComment(contributor, achievement).catch(err => {
            logger.warn('Failed to post achievement comment', {
                username: contributor.username,
                achievement: achievement.name,
                error: err.message
            });
        });

        logger.info('Achievement awarded', {
            username: contributor.username,
            achievement: achievement.name,
            points: achievement.points
        });

        return achievement;
    } catch (error) {
        logger.error('Error awarding achievement', {
            username: contributor.username,
            achievement: achievement.name,
            error: error.message
        });
        throw error;
    }
};

/**
 * Post achievement notification as GitHub comment
 * @param {Object} contributor - Contributor document
 * @param {Object} achievement - Achievement object
 */
const postAchievementComment = async (contributor, achievement) => {
    try {
        // Find the most recent PR by this contributor
        // Use REPO_OWNER/REPO_NAME (standard env vars) or fallback to GITHUB_OWNER/GITHUB_REPO
        const owner = process.env.REPO_OWNER || process.env.GITHUB_OWNER;
        const repo = process.env.REPO_NAME || process.env.GITHUB_REPO;

        // Skip if owner/repo not configured
        if (!owner || !repo) {
            logger.debug('Skipping achievement comment - REPO_OWNER/REPO_NAME not configured');
            return;
        }

        const { data: prs } = await octokit.pulls.list({
            owner,
            repo,
            state: 'all',
            per_page: 10,
            sort: 'updated',
            direction: 'desc'
        });

        const userPR = prs.find(pr => pr.user.login === contributor.username);

        if (userPR) {
            const comment = `🏆 **Achievement Unlocked!**

Congratulations @${contributor.username}! You've earned the **${achievement.name}** achievement!

**${achievement.description}**

You've been awarded **${achievement.points} bonus points**! Keep up the great work! 🎉`;

            await octokit.issues.createComment({
                owner,
                repo,
                issue_number: userPR.number,
                body: comment
            });

            logger.info('Achievement comment posted', {
                username: contributor.username,
                achievement: achievement.name,
                prNumber: userPR.number
            });
        } else {
            logger.debug('No recent PR found for achievement comment', {
                username: contributor.username,
                achievement: achievement.name
            });
        }
    } catch (error) {
        // Don't throw - this is a nice-to-have feature
        // Only log as debug to avoid spamming logs
        logger.debug('Could not post achievement comment', {
            username: contributor.username,
            error: error.message
        });
    }
};

/**
 * Get achievement progress for a contributor
 * @param {String} username - GitHub username
 * @returns {Object} Achievement progress data
 */
export const getAchievementProgress = async (username) => {
    try {
        const contributor = await prisma.contributor.findUnique({
            where: { username },
            include: {
                achievements: true,
                completedChallenges: true
            }
        });

        if (!contributor) {
            throw new Error('Contributor not found');
        }

        const earnedIds = new Set(contributor.achievements.map(a => a.achievementId));
        const progress = [];

        // Convert BigInt to Number for calculations
        const prCount = Number(contributor.prCount);
        const reviewCount = Number(contributor.reviewCount);
        const currentStreak = Number(contributor.currentStreak);
        const totalPoints = Number(contributor.totalPoints);
        const completedChallengesCount = contributor.completedChallenges?.length || 0;

        // Check progress for all achievements
        for (const [key, achievement] of Object.entries(ACHIEVEMENTS)) {
            const isEarned = earnedIds.has(achievement.id);
            let currentValue = 0;

            // Determine current progress based on category
            if (achievement.category === 'pr-milestone') {
                currentValue = prCount;
            } else if (achievement.category === 'streak') {
                currentValue = currentStreak;
            } else if (achievement.category === 'review') {
                currentValue = reviewCount;
            } else if (achievement.category === 'points') {
                currentValue = totalPoints;
            } else if (achievement.category === 'challenge') {
                currentValue = completedChallengesCount;
            }

            progress.push({
                ...achievement,
                isEarned,
                currentValue,
                progressPercent: Math.min(100, (currentValue / achievement.threshold) * 100)
            });
        }

        return {
            username: contributor.username,
            totalEarned: contributor.achievements.length,
            totalAvailable: Object.keys(ACHIEVEMENTS).length,
            achievements: progress
        };
    } catch (error) {
        logger.error('Error getting achievement progress', {
            username,
            error: error.message
        });
        throw error;
    }
};

/**
 * Get all achievements (catalog)
 * @returns {Array} All available achievements
 */
export const getAllAchievements = () => {
    return Object.values(ACHIEVEMENTS);
};

/**
 * Get earned achievements for a contributor
 * @param {String} username - GitHub username
 * @returns {Array} Earned achievements
 */
export const getEarnedAchievements = async (username) => {
    try {
        const contributor = await prisma.contributor.findUnique({
            where: { username },
            select: {
                username: true,
                achievements: {
                    orderBy: {
                        earnedAt: 'desc'
                    }
                }
            }
        });

        if (!contributor) {
            throw new Error('Contributor not found');
        }

        return {
            username: contributor.username,
            achievements: contributor.achievements,
            count: contributor.achievements.length
        };
    } catch (error) {
        logger.error('Error getting earned achievements', {
            username,
            error: error.message
        });
        throw error;
    }
};
