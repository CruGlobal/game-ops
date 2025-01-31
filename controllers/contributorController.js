import { fetchPullRequests, awardBadges, getTopContributors, getTopReviewers } from '../services/contributorService.js';

export const fetchPRs = async (req, res) => {
    try {
        await fetchPullRequests();
        res.status(200).send('Pull requests fetched and data updated.');
    } catch (err) {
        res.status(500).send('Error fetching pull requests.');
    }
};

export const awardContributorBadges = async (req, res) => {
    const pullRequestNumber = req.query.pull_request_number;
    const test = req.query.test === 'true';
    try {
        const results = await awardBadges(pullRequestNumber, test);
        res.status(200).json({ message: 'Badges awarded successfully.', results });
    } catch (err) {
        res.status(500).json({ message: 'Error awarding badges.' });
    }
};

export const topContributors = async (req, res) => {
    try {
        const contributors = await getTopContributors();
        res.json(contributors);
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

export const topReviewers = async (req, res) => {
    try {
        const reviewers = await getTopReviewers();
        res.json(reviewers);
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
};