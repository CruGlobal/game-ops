import { awardBillsAndVonettes, fetchPullRequests, awardBadges, getTopContributors, getTopReviewers, getTopContributorsDateRange, getTopReviewersDateRage, initializeDatabase } from '../services/contributorService.js';

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
        await fetchPullRequests(); // Fetch pull requests and update data
        console.log('Pull requests fetched and data updated.');
    } catch (err) {
        console.error('Error fetching pull requests:', err); // Handle errors
    }
};

// Function to award badges for the cron job
export const awardContributorBadgesCron = async (pullRequestNumber) => {
    try {
        const results = await awardBadges(pullRequestNumber); // Award badges
        console.log({ message: 'Badges awarded successfully.', results });
    } catch (err) {
        console.error({ message: 'Error awarding badges.' }); // Handle errors
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
    const { days } = req.query;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - parseInt(days, 10));

    try {
        const contributors = await getTopContributorsDateRange(startDate, endDate);
        res.json(contributors);
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

// Controller to get the top reviewers based on review count within a date range
export const topReviewersDateRange = async (req, res) => {
    const { days } = req.query;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - parseInt(days, 10));

    try {
        const reviewers = await getTopReviewersDateRage(startDate, endDate);
        res.json(reviewers);
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
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