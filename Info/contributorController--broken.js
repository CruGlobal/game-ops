import { awardBillsAndVonettes, fetchPullRequests, fetchReviews, awardBadges, getTopContributors, getTopReviewers } from '../services/contributorService.js';
import { Octokit } from '@octokit/rest';

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
    request: {
        fetch: fetch
    }
});

const repoOwner = process.env.REPO_OWNER;
const repoName = process.env.REPO_NAME;

const isDevelopment = () => process.env.NODE_ENV === 'development';

const handleError = (res, message, err) => {
    console.error(message, err);
    res.status(500).json({ message });
};

// Controller to fetch pull requests and update contributors' PR counts
export const fetchPRs = async () => {
    try {
        const response = await fetch('https://api.github.com/repos/owner/repo/pulls');
        if (!response) {
            throw new Error('No response from GitHub API');
        }
        if (response.status === 404) {
            throw new Error(`GitHub API responded with status: 404 - Repository ${repoOwner}/${repoName} not found`);
        }
        if (response.status !== 200) {
            throw new Error(`GitHub API responded with status: ${response.status}`);
        }
        const data = await response.json();
        // Process the data
    } catch (error) {
        console.error('Error fetching data:', error);
    }
};

// Controller to fetch reviews and update contributors' review counts
export const fetchReviewsData = async (req, res) => {
    try {
        await fetchReviews(); // Fetch reviews and update data
        res.status(200).send('Reviews fetched and data updated.');
    } catch (err) {
        handleError(res, 'Error fetching reviews.', err);
    }
};

// Controller to award badges to contributors based on their contributions
export const awardContributorBadges = async (req, res) => {
    const pullRequestNumber = req.query.pull_request_number;

    try {
        if (isDevelopment()) {
            console.log(`Development mode: Badges would be awarded for PR #${pullRequestNumber}`);
            res.status(200).json({ message: 'Development mode: Badges would be awarded.', results: null });
        } else {
            const results = await awardBadges(pullRequestNumber); // Award badges
            res.status(200).json({ message: 'Badges awarded successfully.', results });
        }
    } catch (err) {
        handleError(res, 'Error awarding badges.', err);
    }
};

// Controller to get the top contributors based on PR count
export const topContributors = async (req, res) => {
    try {
        const contributors = await getTopContributors(); // Get top contributors
        res.json(contributors);
    } catch (err) {
        handleError(res, 'Internal Server Error', err);
    }
};

// Controller to get the top reviewers based on review count
export const topReviewers = async (req, res) => {
    try {
        const reviewers = await getTopReviewers(); // Get top reviewers
        res.json(reviewers);
    } catch (err) {
        handleError(res, 'Internal Server Error', err);
    }
};

// Controller to award bills and vonettes to contributors based on their contributions
export const awardBillsAndVonettesController = async (req, res) => {
    const pullRequestNumber = req.query.pull_request_number;

    try {
        if (isDevelopment()) {
            console.log(`Development mode: Bills and Vonettes would be awarded for PR #${pullRequestNumber}`);
            res.status(200).json({ message: 'Development mode: Bills and Vonettes would be awarded.', results: null });
        } else {
            const results = await awardBillsAndVonettes(pullRequestNumber); // Award bills and vonettes
            res.status(200).json({ message: 'Bills and Vonettes awarded successfully.', results });
        }
    } catch (err) {
        handleError(res, 'Error awarding Bills and Vonettes.', err);
    }
};