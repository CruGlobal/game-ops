import {
    getContributorTrends,
    getTeamAnalytics,
    getActivityHeatmap,
    getTopContributorsComparison,
    getChallengeStats,
    getGrowthTrends,
    exportToCSV
} from '../services/analyticsService.js';
import logger from '../utils/logger.js';

/**
 * Get analytics for a specific contributor
 * GET /api/analytics/contributor/:username
 */
export const getContributorAnalytics = async (req, res) => {
    try {
        const { username } = req.params;
        const days = parseInt(req.query.days) || 30;

        const trends = await getContributorTrends(username, days);

        res.json(trends);
    } catch (error) {
        logger.error('Error in getContributorAnalytics', {
            error: error.message
        });

        if (error.message === 'Contributor not found') {
            return res.status(404).json({ error: 'Contributor not found' });
        }

        res.status(500).json({ error: 'Failed to retrieve contributor analytics' });
    }
};

/**
 * Get team-wide analytics
 * GET /api/analytics/team
 */
export const getTeamAnalyticsData = async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;

        const analytics = await getTeamAnalytics(days);

        res.json(analytics);
    } catch (error) {
        logger.error('Error in getTeamAnalyticsData', {
            error: error.message
        });

        res.status(500).json({ error: 'Failed to retrieve team analytics' });
    }
};

/**
 * Get activity heatmap
 * GET /api/analytics/heatmap
 */
export const getHeatmap = async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 90;

        const heatmap = await getActivityHeatmap(days);

        res.json(heatmap);
    } catch (error) {
        logger.error('Error in getHeatmap', {
            error: error.message
        });

        res.status(500).json({ error: 'Failed to generate heatmap' });
    }
};

/**
 * Get top contributors comparison
 * GET /api/analytics/top-contributors
 */
export const getTopContributors = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;

        const comparison = await getTopContributorsComparison(limit);

        res.json(comparison);
    } catch (error) {
        logger.error('Error in getTopContributors', {
            error: error.message
        });

        res.status(500).json({ error: 'Failed to retrieve top contributors' });
    }
};

/**
 * Get challenge statistics
 * GET /api/analytics/challenges
 */
export const getChallengeAnalytics = async (req, res) => {
    try {
        const stats = await getChallengeStats();

        res.json(stats);
    } catch (error) {
        logger.error('Error in getChallengeAnalytics', {
            error: error.message
        });

        res.status(500).json({ error: 'Failed to retrieve challenge statistics' });
    }
};

/**
 * Get growth trends
 * GET /api/analytics/growth
 */
export const getGrowth = async (req, res) => {
    try {
        const trends = await getGrowthTrends();

        res.json(trends);
    } catch (error) {
        logger.error('Error in getGrowth', {
            error: error.message
        });

        res.status(500).json({ error: 'Failed to calculate growth trends' });
    }
};

/**
 * Get overview dashboard data (combined analytics)
 * GET /api/analytics/overview
 */
export const getOverview = async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;

        // Get multiple analytics in parallel
        const [teamData, topContributors, challengeStats, growthTrends] = await Promise.all([
            getTeamAnalytics(days),
            getTopContributorsComparison(5),
            getChallengeStats(),
            getGrowthTrends()
        ]);

        res.json({
            team: teamData,
            topContributors,
            challenges: challengeStats,
            growth: growthTrends
        });
    } catch (error) {
        logger.error('Error in getOverview', {
            error: error.message
        });

        res.status(500).json({ error: 'Failed to retrieve analytics overview' });
    }
};

/**
 * Export analytics data
 * GET /api/analytics/export
 */
export const exportAnalytics = async (req, res) => {
    try {
        const { type } = req.query; // 'contributors', 'challenges', 'activity'
        const days = parseInt(req.query.days) || 30;

        if (!type || !['contributors', 'challenges', 'activity'].includes(type)) {
            return res.status(400).json({
                error: 'Invalid export type. Must be: contributors, challenges, or activity'
            });
        }

        const csvData = await exportToCSV(type, { days });

        // Set headers for CSV download
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="game-ops-${type}-${new Date().toISOString().split('T')[0]}.csv"`);

        res.send(csvData);
    } catch (error) {
        logger.error('Error in exportAnalytics', {
            error: error.message
        });

        res.status(500).json({ error: 'Failed to export analytics data' });
    }
};
