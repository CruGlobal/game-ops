// adminController.js
import Contributor from '../models/contributor.js';
import { body, validationResult } from 'express-validator';
import { getPRRangeInfo, checkForDuplicates, fixDuplicates } from '../services/contributorService.js';
import { startBackfill, stopBackfill, getBackfillStatus } from '../services/backfillService.js';
import {
    getQuarterConfig,
    getCurrentQuarter,
    getQuarterDateRange,
    updateQuarterConfig,
    getAllTimeLeaderboard,
    getQuarterlyLeaderboard,
    getHallOfFame
} from '../services/quarterlyService.js';

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

/**
 * Fix duplicate PRs in database
 * POST /api/admin/fix-duplicates
 */
export async function fixDuplicatesController(req, res) {
    try {
        const results = await fixDuplicates();
        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        console.error('Error in fixDuplicatesController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fix duplicates',
            error: error.message
        });
    }
}

/**
 * Get current quarter info (PUBLIC - no auth required)
 * GET /api/quarter-info
 */
export async function getQuarterInfoController(req, res) {
    try {
        const currentQuarter = await getCurrentQuarter();
        const quarterDates = await getQuarterDateRange(currentQuarter);

        res.json({
            success: true,
            data: {
                currentQuarter,
                quarterDates
            }
        });
    } catch (error) {
        console.error('Error in getQuarterInfoController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve quarter information',
            error: error.message
        });
    }
}

/**
 * Get quarter configuration (ADMIN - auth required)
 * GET /api/admin/quarter-config
 */
export async function getQuarterConfigController(req, res) {
    try {
        const config = await getQuarterConfig();
        const currentQuarter = await getCurrentQuarter();
        const quarterDates = await getQuarterDateRange(currentQuarter);

        res.json({
            success: true,
            data: {
                config,
                currentQuarter,
                quarterDates
            }
        });
    } catch (error) {
        console.error('Error in getQuarterConfigController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve quarter configuration',
            error: error.message
        });
    }
}

/**
 * Update quarter configuration
 * POST /api/admin/quarter-config
 */
export async function updateQuarterConfigController(req, res) {
    try {
        const { systemType, q1StartMonth } = req.body;
        const modifiedBy = req.user?.username || 'admin';

        const result = await updateQuarterConfig(
            systemType,
            q1StartMonth,
            modifiedBy
        );

        res.json({
            success: true,
            message: result.quarterChanged
                ? `Quarter configuration updated. Quarter changed from ${result.oldQuarter} to ${result.newQuarter}.`
                : 'Quarter configuration updated successfully.',
            data: result
        });
    } catch (error) {
        console.error('Error in updateQuarterConfigController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update quarter configuration',
            error: error.message
        });
    }
}

/**
 * Get all-time leaderboard
 * GET /api/leaderboard/all-time
 */
export async function getAllTimeLeaderboardController(req, res) {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const leaderboard = await getAllTimeLeaderboard(limit);

        res.json({
            success: true,
            data: leaderboard
        });
    } catch (error) {
        console.error('Error in getAllTimeLeaderboardController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve all-time leaderboard',
            error: error.message
        });
    }
}

/**
 * Get quarterly leaderboard (current or specific quarter)
 * GET /api/leaderboard/quarterly
 * GET /api/leaderboard/quarterly/:quarter
 */
export async function getQuarterlyLeaderboardController(req, res) {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const quarterString = req.params.quarter || await getCurrentQuarter();

        const leaderboard = await getQuarterlyLeaderboard(quarterString, limit);

        res.json({
            success: true,
            data: {
                quarter: quarterString,
                leaderboard
            }
        });
    } catch (error) {
        console.error('Error in getQuarterlyLeaderboardController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve quarterly leaderboard',
            error: error.message
        });
    }
}

/**
 * Get Hall of Fame (past quarterly winners)
 * GET /api/leaderboard/hall-of-fame
 */
export async function getHallOfFameController(req, res) {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const hallOfFame = await getHallOfFame(limit);

        res.json({
            success: true,
            data: hallOfFame
        });
    } catch (error) {
        console.error('Error in getHallOfFameController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve Hall of Fame',
            error: error.message
        });
    }
}

/**
 * Start historical data backfill
 * POST /api/admin/backfill/start
 */
export async function startBackfillController(req, res) {
    try {
        const { startDate, endDate, checkRateLimits } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Start date and end date are required'
            });
        }

        const result = await startBackfill(startDate, endDate, checkRateLimits !== false);

        res.json(result);
    } catch (error) {
        console.error('Error in startBackfillController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start backfill',
            error: error.message
        });
    }
}

/**
 * Stop historical data backfill
 * POST /api/admin/backfill/stop
 */
export async function stopBackfillController(req, res) {
    try {
        const result = stopBackfill();
        res.json(result);
    } catch (error) {
        console.error('Error in stopBackfillController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to stop backfill',
            error: error.message
        });
    }
}

/**
 * Get backfill status
 * GET /api/admin/backfill/status
 */
export async function getBackfillStatusController(req, res) {
    try {
        const status = getBackfillStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Error in getBackfillStatusController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get backfill status',
            error: error.message
        });
    }
}