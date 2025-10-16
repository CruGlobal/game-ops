import { awardBillsAndVonettes, fetchActivityData, fetchPullRequests, awardBadges, getTopContributors, getTopReviewers, getTopContributorsDateRange, getTopReviewersDateRange, initializeDatabase } from '../services/contributorService.js';
import Contributor from '../models/contributor.js';
import { getStreakStats, getStreakLeaderboard } from '../services/streakService.js';
import { getPointsLeaderboard, getPointsHistory, getPointsSummary } from '../services/pointsService.js';
import { getAchievementProgress, getAllAchievements, getEarnedAchievements } from '../services/achievementService.js';

// Controller to initialize the database
export const initializeDatabaseController = async (req, res) => {
    try {
        await initializeDatabase(); // Call the initializeDatabase function
        res.status(200).send('Database initialized successfully.');
    } catch (err) {
        res.status(500).send('Error initializing database.'); // Handle errors
    }
};

// Controller to fetch pull requests and update contributors' PR counts
export const fetchPRs = async (req, res) => {
    try {
        await fetchPullRequests(); // Fetch pull requests and update data
        res.status(200).send('Pull requests fetched and data updated.');
    } catch (err) {
        res.status(500).send('Error fetching pull requests.'); // Handle errors
    }
};

// Function to fetch pull requests for the cron job
export const fetchPRsCron = async () => {
    try {
        const result = await fetchPullRequests(); // Fetch pull requests and update data
        console.log('Pull requests fetched and data updated.');
        return result || 'Completed';
    } catch (err) {
        console.error('Error fetching pull requests:', err); // Handle errors
        throw err;
    }
};

// Function to award badges for the cron job
export const awardContributorBadgesCron = async (pullRequestNumber) => {
    try {
        const results = await awardBadges(pullRequestNumber); // Award badges
        console.log({ message: 'Badges awarded successfully.', results });
        return results;
    } catch (err) {
        console.error({ message: 'Error awarding badges.' }); // Handle errors
        throw err;
    }
};

// Controller to award badges to contributors based on their contributions
export const awardContributorBadges = async (req, res) => {
    const pullRequestNumber = req.query.pull_request_number; // Get pull request number from query
    const test = req.query.test === 'true'; // Check if test mode is enabled
    try {
        const results = await awardBadges(pullRequestNumber, test); // Award badges
        res.status(200).json({ message: 'Badges awarded successfully.', results });
    } catch (err) {
        res.status(500).json({ message: 'Error awarding badges.' }); // Handle errors
    }
};

// Controller to get the top contributors based on PR count within a date range
export const topContributorsDateRange = async (req, res) => {
    try {
        const { range, page = 1, limit = 10 } = req.query;
        if (!range) {
            return res.status(400).json({ error: 'Range parameter is required' });
        }
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - parseInt(range, 10));
        const { contributors, totalPullRequests } = await getTopContributorsDateRange(startDate, endDate, parseInt(page), parseInt(limit));
        res.json({ contributors, totalPullRequests });
    } catch (error) {
        console.error('Error fetching top contributors:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Controller to get the top reviewers based on review count within a date range
export const topReviewersDateRange = async (req, res) => {
    try {
        const { range, page = 1, limit = 10 } = req.query;
        if (!range) {
            return res.status(400).json({ error: 'Range parameter is required' });
        }
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - parseInt(range, 10));
        const { reviewers, totalReviews } = await getTopReviewersDateRange(startDate, endDate, parseInt(page), parseInt(limit));
        res.json({ reviewers, totalReviews });
    } catch (error) {
        console.error('Error fetching top reviewers:', error);
        res.status(500).send('Internal Server Error');
    }
};

// Controller to get the top contributors based on PR count
export const topContributors = async (req, res) => {
    try {
        const contributors = await getTopContributors(); // Get top contributors
        res.json(contributors);
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' }); // Handle errors
    }
};

// Controller to get the top reviewers based on review count
export const topReviewers = async (req, res) => {
    try {
        const reviewers = await getTopReviewers(); // Get top reviewers
        res.json(reviewers);
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' }); // Handle errors
    }
};

// Controller to award bills and vonettes to contributors based on their contributions
export const awardBillsAndVonettesController = async (req, res) => {
    const pullRequestNumber = req.query.pull_request_number; // Get pull request number from query
    const test = req.query.test === 'true'; // Check if test mode is enabled
    try {
        const results = await awardBillsAndVonettes(pullRequestNumber, test); // Award bills and vonettes
        res.status(200).json({ message: 'Bills and Vonettes awarded successfully.', results });
    } catch (err) {
        res.status(500).json({ message: 'Error awarding Bills and Vonettes.' }); // Handle errors
    }
};

// Controller to fetch activity data
export const fetchActivityController = async (req, res) => {
    const { prFrom, prTo } = req.query;
    try {
        const data = await fetchActivityData(parseInt(prFrom), parseInt(prTo));
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch activity data' });
    }
};

// Get monthly aggregated data
export const getMonthlyAggregatedData = async (req, res) => {
    const range = parseInt(req.query.range, 10) || 1; // Default to 1 month if no range is provided
    const endDate = new Date();
    const startDate = new Date();
    startDate.setMonth(endDate.getMonth() - range);

    try {
        const data = await Contributor.aggregate([
            { $unwind: '$contributions' },
            { $match: { 'contributions.date': { $gte: startDate, $lte: endDate } } }, // Filter by date range
            {
                $group: {
                    _id: {
                        year: { $year: '$contributions.date' },
                        month: { $month: '$contributions.date' }
                    },
                    totalPRs: { $sum: '$contributions.count' },
                    totalReviews: { $sum: '$reviews.count' }
                }
            },
            {
                $project: {
                    _id: 0,
                    year: '$_id.year',
                    month: '$_id.month',
                    totalPRs: 1,
                    totalReviews: 1
                }
            },
            { $sort: { year: 1, month: 1 } }
        ]);

        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Gamification Controllers

// Get all achievements catalog
export const getAllAchievementsController = async (req, res) => {
    try {
        const achievements = getAllAchievements();
        res.json({ achievements });
    } catch (err) {
        res.status(500).json({ error: 'Error fetching achievements' });
    }
};

// Get user's earned achievements
export const getUserAchievementsController = async (req, res) => {
    try {
        const { username } = req.params;
        const result = await getEarnedAchievements(username);
        res.json(result);
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
};

// Get achievement progress for a user
export const getAchievementProgressController = async (req, res) => {
    try {
        const { username } = req.params;
        const progress = await getAchievementProgress(username);
        res.json(progress);
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
};

// Get points leaderboard
export const getPointsLeaderboardController = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const leaderboard = await getPointsLeaderboard(limit);
        res.json({ leaderboard });
    } catch (err) {
        res.status(500).json({ error: 'Error fetching points leaderboard' });
    }
};

// Get user's points history
export const getPointsHistoryController = async (req, res) => {
    try {
        const { username } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const history = await getPointsHistory(username, limit);
        res.json(history);
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
};

// Get user's points summary
export const getPointsSummaryController = async (req, res) => {
    try {
        const { username } = req.params;
        const summary = await getPointsSummary(username);
        res.json(summary);
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
};

// Get streak leaderboard
export const getStreakLeaderboardController = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const leaderboard = await getStreakLeaderboard(limit);
        res.json({ leaderboard });
    } catch (err) {
        res.status(500).json({ error: 'Error fetching streak leaderboard' });
    }
};

// Get user's streak stats
export const getStreakStatsController = async (req, res) => {
    try {
        const { username } = req.params;
        const stats = await getStreakStats(username);
        res.json(stats);
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
};