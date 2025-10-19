import express from 'express';
import {
    getContributorAnalytics,
    getTeamAnalyticsData,
    getHeatmap,
    getTopContributors,
    getChallengeAnalytics,
    getGrowth,
    getOverview,
    exportAnalytics
} from '../controllers/analyticsController.js';

const router = express.Router();

/**
 * Analytics Routes
 */

// Overview dashboard - combined analytics
router.get('/overview', getOverview);

// Contributor-specific analytics
router.get('/contributor/:username', getContributorAnalytics);

// Team-wide analytics
router.get('/team', getTeamAnalyticsData);

// Activity heatmap
router.get('/heatmap', getHeatmap);

// Top contributors comparison
router.get('/top-contributors', getTopContributors);

// Challenge statistics
router.get('/challenges', getChallengeAnalytics);

// Growth trends
router.get('/growth', getGrowth);

// Export data to CSV
router.get('/export', exportAnalytics);

export default router;
