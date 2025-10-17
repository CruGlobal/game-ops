// adminController.js
import Contributor from '../models/contributor.js';
import { body, validationResult } from 'express-validator';
import { getPRRangeInfo, checkForDuplicates } from '../services/contributorService.js';

// Function to get all contributors
export const getContributors = async (req, res) => {
    try {
        const contributors = await Contributor.find();
        res.status(200).json(contributors);
    } catch (err) {
        res.status(500).send('Error fetching contributors');
    }
};

// Function to reset a specific contributor's awards and badges
export const resetContributor = [
    body('username').isString().trim().notEmpty(),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username } = req.body;
        try {
            const contributor = await Contributor.findOne({ username });
            if (!contributor) {
                return res.status(404).send('Contributor not found');
            }
            contributor.firstPrAwarded = false;
            contributor.firstReviewAwarded = false;
            contributor.first10PrsAwarded = false;
            contributor.first10ReviewsAwarded = false;
            contributor.first50PrsAwarded = false;
            contributor.first50ReviewsAwarded = false;
            contributor.first100PrsAwarded = false;
            contributor.first100ReviewsAwarded = false;
            contributor.first500PrsAwarded = false;
            contributor.first500ReviewsAwarded = false;
            contributor.first1000PrsAwarded = false;
            contributor.first1000ReviewsAwarded = false;
            contributor.badges = [];
            await contributor.save();
            res.status(200).send('Contributor reset successfully');
        } catch (err) {
            res.status(500).send('Error resetting contributor');
        }
    }
];

// Function to reset all contributors' awards and badges
export const resetAllContributors = async (req, res) => {
    try {
        await Contributor.updateMany({}, {
            firstPrAwarded: false,
            firstReviewAwarded: false,
            first10PrsAwarded: false,
            first10ReviewsAwarded: false,
            first50PrsAwarded: false,
            first50ReviewsAwarded: false,
            first100PrsAwarded: false,
            first100ReviewsAwarded: false,
            first500PrsAwarded: false,
            first500ReviewsAwarded: false,
            first1000PrsAwarded: false,
            first1000ReviewsAwarded: false,
            badges: []
        });
        res.status(200).send('All contributors reset successfully');
    } catch (err) {
        res.status(500).send('Error resetting all contributors');
    }
};

/**
 * Get PR fetch range and database statistics
 * GET /api/admin/pr-range-info
 */
export async function getPRRangeInfoController(req, res) {
    try {
        const info = await getPRRangeInfo();
        res.json({
            success: true,
            data: info
        });
    } catch (error) {
        console.error('Error in getPRRangeInfoController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve PR range information',
            error: error.message
        });
    }
}

/**
 * Check for duplicate PRs in database
 * GET /api/admin/duplicate-check
 */
export async function checkDuplicatesController(req, res) {
    try {
        const results = await checkForDuplicates();
        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        console.error('Error in checkDuplicatesController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check for duplicates',
            error: error.message
        });
    }
}