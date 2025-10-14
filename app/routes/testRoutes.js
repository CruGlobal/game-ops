import express from 'express';
import { emitPRUpdate, emitBadgeAwarded, emitReviewUpdate, emitLeaderboardUpdate } from '../utils/socketEmitter.js';
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
            }
        ]
    });
});

export default router;
