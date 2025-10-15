import express from 'express';
import { emitPRUpdate, emitBadgeAwarded, emitReviewUpdate, emitLeaderboardUpdate, emitStreakUpdate, emitAchievementUnlocked, emitPointsAwarded, emitChallengeProgress, emitChallengeCompleted } from '../utils/socketEmitter.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Test endpoint to emit PR update event
router.post('/test/pr-update', (req, res) => {
    const data = {
        username: req.body.username || 'testuser',
        prCount: req.body.prCount || 42
    };

    logger.info('Test PR update event triggered', data);
    emitPRUpdate(data);

    res.json({
        success: true,
        message: 'PR update event emitted',
        data
    });
});

// Test endpoint to emit badge awarded event
router.post('/test/badge-awarded', (req, res) => {
    const data = {
        username: req.body.username || 'testuser',
        badgeName: req.body.badgeName || 'Test Badge',
        badgeType: req.body.badgeType || 'test'
    };

    logger.info('Test badge awarded event triggered', data);
    emitBadgeAwarded(data);

    res.json({
        success: true,
        message: 'Badge awarded event emitted',
        data
    });
});

// Test endpoint to emit review update event
router.post('/test/review-update', (req, res) => {
    const data = {
        username: req.body.username || 'testuser',
        reviewCount: req.body.reviewCount || 10
    };

    logger.info('Test review update event triggered', data);
    emitReviewUpdate(data);

    res.json({
        success: true,
        message: 'Review update event emitted',
        data
    });
});

// Test endpoint to emit leaderboard update event
router.post('/test/leaderboard-update', (req, res) => {
    const data = {
        leaderboard: req.body.leaderboard || [
            { username: 'user1', prCount: 100, rank: 1 },
            { username: 'user2', prCount: 75, rank: 2 },
            { username: 'user3', prCount: 50, rank: 3 }
        ]
    };

    logger.info('Test leaderboard update event triggered');
    emitLeaderboardUpdate(data);

    res.json({
        success: true,
        message: 'Leaderboard update event emitted',
        data
    });
});

// Gamification test endpoints

// Test streak update event
router.post('/test/streak-update', (req, res) => {
    const data = {
        username: req.body.username || 'testuser',
        currentStreak: req.body.currentStreak || 7,
        longestStreak: req.body.longestStreak || 10
    };

    logger.info('Test streak update event triggered', data);
    emitStreakUpdate(data);

    res.json({
        success: true,
        message: 'Streak update event emitted',
        data
    });
});

// Test achievement unlocked event
router.post('/test/achievement-unlocked', (req, res) => {
    const data = {
        username: req.body.username || 'testuser',
        achievementId: req.body.achievementId || 'pr-10',
        achievementName: req.body.achievementName || 'Getting Started',
        description: req.body.description || 'Merged 10 PRs',
        category: req.body.category || 'pr-milestone',
        points: req.body.points || 100
    };

    logger.info('Test achievement unlocked event triggered', data);
    emitAchievementUnlocked(data);

    res.json({
        success: true,
        message: 'Achievement unlocked event emitted',
        data
    });
});

// Test points awarded event
router.post('/test/points-awarded', (req, res) => {
    const data = {
        username: req.body.username || 'testuser',
        points: req.body.points || 50,
        totalPoints: req.body.totalPoints || 500,
        reason: req.body.reason || 'PR Merged',
        prNumber: req.body.prNumber || 123
    };

    logger.info('Test points awarded event triggered', data);
    emitPointsAwarded(data);

    res.json({
        success: true,
        message: 'Points awarded event emitted',
        data
    });
});

// Test challenge progress event
router.post('/test/challenge-progress', (req, res) => {
    const data = {
        username: req.body.username || 'testuser',
        challengeId: req.body.challengeId || '123',
        challengeName: req.body.challengeName || 'Sprint Master',
        progress: req.body.progress || 3,
        target: req.body.target || 5,
        percentComplete: req.body.percentComplete || 60
    };

    logger.info('Test challenge progress event triggered', data);
    emitChallengeProgress(data);

    res.json({
        success: true,
        message: 'Challenge progress event emitted',
        data
    });
});

// Test challenge completed event
router.post('/test/challenge-completed', (req, res) => {
    const data = {
        username: req.body.username || 'testuser',
        challengeId: req.body.challengeId || '123',
        challengeName: req.body.challengeName || 'Sprint Master',
        reward: req.body.reward || 250,
        totalPoints: req.body.totalPoints || 750
    };

    logger.info('Test challenge completed event triggered', data);
    emitChallengeCompleted(data);

    res.json({
        success: true,
        message: 'Challenge completed event emitted',
        data
    });
});

// Get all available test endpoints
router.get('/test/endpoints', (req, res) => {
    res.json({
        endpoints: [
            {
                method: 'POST',
                path: '/api/test/pr-update',
                body: { username: 'string', prCount: 'number' },
                description: 'Emit a PR update event'
            },
            {
                method: 'POST',
                path: '/api/test/badge-awarded',
                body: { username: 'string', badgeName: 'string', badgeType: 'string' },
                description: 'Emit a badge awarded event'
            },
            {
                method: 'POST',
                path: '/api/test/review-update',
                body: { username: 'string', reviewCount: 'number' },
                description: 'Emit a review update event'
            },
            {
                method: 'POST',
                path: '/api/test/leaderboard-update',
                body: { leaderboard: 'array' },
                description: 'Emit a leaderboard update event'
            },
            {
                method: 'POST',
                path: '/api/test/streak-update',
                body: { username: 'string', currentStreak: 'number', longestStreak: 'number' },
                description: 'Emit a streak update event'
            },
            {
                method: 'POST',
                path: '/api/test/achievement-unlocked',
                body: { username: 'string', achievementId: 'string', achievementName: 'string', description: 'string', category: 'string', points: 'number' },
                description: 'Emit an achievement unlocked event'
            },
            {
                method: 'POST',
                path: '/api/test/points-awarded',
                body: { username: 'string', points: 'number', totalPoints: 'number', reason: 'string', prNumber: 'number' },
                description: 'Emit a points awarded event'
            },
            {
                method: 'POST',
                path: '/api/test/challenge-progress',
                body: { username: 'string', challengeId: 'string', challengeName: 'string', progress: 'number', target: 'number', percentComplete: 'number' },
                description: 'Emit a challenge progress event'
            },
            {
                method: 'POST',
                path: '/api/test/challenge-completed',
                body: { username: 'string', challengeId: 'string', challengeName: 'string', reward: 'number', totalPoints: 'number' },
                description: 'Emit a challenge completed event'
            }
        ]
    });
});

export default router;
