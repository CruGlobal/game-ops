import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { validateDateRange, validatePagination, validateRequest } from '../utils/validation.js';
import {
    initializeDatabaseController,
    fetchPRs,
    awardContributorBadges,
    topContributors,
    topReviewers,
    topReviewersDateRange,
    topContributorsDateRange,
    awardBillsAndVonettesController,
    fetchActivityController,
    getMonthlyAggregatedData,
    getAllAchievementsController,
    getUserAchievementsController,
    getAchievementProgressController,
    getPointsLeaderboardController,
    getPointsHistoryController,
    getPointsSummaryController,
    getStreakLeaderboardController,
    getStreakStatsController,
    getContributorController
} from '../controllers/contributorController.js';
import {
    getContributors,
    resetContributor,
    resetAllContributors,
    getPRRangeInfoController,
    checkDuplicatesController,
    fixDuplicatesController,
    getQuarterInfoController,
    getQuarterConfigController,
    updateQuarterConfigController,
    getAllTimeLeaderboardController,
    getQuarterlyLeaderboardController,
    getQuarterlyLeaderboardByQuarterController,
    getHallOfFameController,
    recomputeCurrentQuarterController,
    recomputeHallOfFameController,
    recomputeHallOfFameAllController,
    recomputeStreaksController,
    recomputeBadgesController,
    startBackfillController,
    stopBackfillController,
    getBackfillStatusController
} from '../controllers/adminController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { login } from '../controllers/authController.js';
import { ensureAuthenticated } from '../middleware/ensureAuthenticated.js';
import { getCronStatusController, setCronStatusController } from '../controllers/adminController.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Route to initialize the database
router.get('/initialize-database', authenticate, initializeDatabaseController);

// Route to fetch pull requests
router.get('/fetch-pull-requests', authenticate, fetchPRs);

// Route to award badges to contributors
router.get('/award-badges', authenticate, awardContributorBadges);

// Route to get the top contributors
router.get('/top-contributors', topContributors);

// Route to get the top reviewers
router.get('/top-reviewers', topReviewers);

// Route to award Bills and Vonettes
router.get('/award-bills-vonettes', authenticate, awardBillsAndVonettesController);

// Admin login route
router.post('/admin/login', login);

// Route to get all contributors
router.get('/admin/contributors', ensureAuthenticated, getContributors);

// Route to reset a specific contributor
router.post('/admin/reset-contributor', ensureAuthenticated, resetContributor);

// Route to reset all contributors
router.post('/admin/reset-all', ensureAuthenticated, resetAllContributors);

// PR Range Info and Data Statistics
router.get('/admin/pr-range-info', ensureAuthenticated, getPRRangeInfoController);

// Duplicate Detection & Fix
router.get('/admin/duplicate-check', ensureAuthenticated, checkDuplicatesController);
router.post('/admin/fix-duplicates', ensureAuthenticated, fixDuplicatesController);

// Public Quarter Info (no auth required)
router.get('/quarter-info', getQuarterInfoController);

// Quarter Configuration (admin only)
router.get('/admin/quarter-config', ensureAuthenticated, getQuarterConfigController);
router.post('/admin/quarter-config', ensureAuthenticated, updateQuarterConfigController);

// Historical Data Backfill (admin only)
router.post('/admin/backfill/start', ensureAuthenticated, startBackfillController);
router.post('/admin/backfill/stop', ensureAuthenticated, stopBackfillController);
router.get('/admin/backfill/status', ensureAuthenticated, getBackfillStatusController);

// Cron controls (admin only)
router.get('/admin/cron-status', ensureAuthenticated, getCronStatusController);
router.post('/admin/cron-status', ensureAuthenticated, setCronStatusController);

// Admin recompute endpoints
router.post('/admin/leaderboard/recompute/current-quarter', ensureAuthenticated, recomputeCurrentQuarterController);
router.post('/admin/leaderboard/recompute/hall-of-fame', ensureAuthenticated, recomputeHallOfFameController);
router.post('/admin/leaderboard/recompute/hall-of-fame/all', ensureAuthenticated, recomputeHallOfFameAllController);

// Recompute streaks and badges
router.post('/admin/recompute/streaks', ensureAuthenticated, recomputeStreaksController);
router.post('/admin/recompute/badges', ensureAuthenticated, recomputeBadgesController);

// Leaderboard Routes
router.get('/leaderboard/all-time', getAllTimeLeaderboardController);
router.get('/leaderboard/quarterly', getQuarterlyLeaderboardController);
router.get('/leaderboard/quarterly/:quarter', getQuarterlyLeaderboardByQuarterController);
router.get('/leaderboard/hall-of-fame', getHallOfFameController);

// Route to get the list of badge images
router.get('/badges', (req, res) => {
    const imagesDir = path.join(__dirname, '../public/images/badges');
    fs.readdir(imagesDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to read badges directory' });
        }
        const badges = files.filter(file => file.endsWith('.png'));
        res.json(badges);
    });
});

router.get('/auth/status', (req, res) => {
    try {
        const isAuthed = typeof req.isAuthenticated === 'function' ? !!req.isAuthenticated() : false;
        if (isAuthed) {
            return res.json({ isAuthenticated: true, username: req.user?.username });
        }
        return res.json({ isAuthenticated: false });
    } catch (e) {
        return res.json({ isAuthenticated: false });
    }
});

// Route to get the top contributors within a date range with pagination
router.get('/top-contributors-date-range', topContributorsDateRange);

// Route to get the top reviewers within a date range with pagination
router.get('/top-reviewers-date-range', topReviewersDateRange);

// Route to get the activity data
router.get('/activity', fetchActivityController);

// Route to get monthly aggregated data
router.get('/monthly-aggregated-data', getMonthlyAggregatedData);

// Gamification Routes

// Achievement routes
router.get('/achievements', getAllAchievementsController);
router.get('/:username/achievements', getUserAchievementsController);
router.get('/:username/achievement-progress', getAchievementProgressController);

// Points routes
router.get('/leaderboard/points', getPointsLeaderboardController);
router.get('/:username/points-history', getPointsHistoryController);
router.get('/:username/points-summary', getPointsSummaryController);

// Streak routes
router.get('/leaderboard/streaks', getStreakLeaderboardController);
router.get('/:username/streak', getStreakStatsController);

// Get single contributor by username
router.get('/contributors/:username', getContributorController);

export default router;