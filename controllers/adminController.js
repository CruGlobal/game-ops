import Contributor from '../models/contributor.js';
import { body, validationResult } from 'express-validator';

// Retrieve the admin password from environment variables
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

// Admin login function
export const adminLogin = [
    body('password').isString().trim().notEmpty(),
    (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { password } = req.body; // Extract password from request body
        if (password === ADMIN_PASSWORD) { // Check if the provided password matches the admin password
            res.status(200).send('Login successful'); // Send success response if passwords match
        } else {
            res.status(401).send('Invalid password'); // Send unauthorized response if passwords do not match
        }
    }
];

// Function to get all contributors
export const getContributors = async (req, res) => {
    try {
        const contributors = await Contributor.find(); // Fetch all contributors from the database
        res.status(200).json(contributors); // Send the list of contributors as a JSON response
    } catch (err) {
        res.status(500).send('Error fetching contributors'); // Send error response if fetching fails
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

        const { username } = req.body; // Extract username from request body
        try {
            const contributor = await Contributor.findOne({ username }); // Find the contributor by username
            if (!contributor) {
                return res.status(404).send('Contributor not found'); // Send not found response if contributor does not exist
            }
            // Reset all award flags and badges for the contributor
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
            await contributor.save(); // Save the updated contributor to the database
            res.status(200).send('Contributor reset successfully'); // Send success response
        } catch (err) {
            res.status(500).send('Error resetting contributor'); // Send error response if resetting fails
        }
    }
];

// Function to reset all contributors' awards and badges
export const resetAllContributors = async (req, res) => {
    try {
        // Update all contributors to reset their award flags and badges
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
        res.status(200).send('All contributors reset successfully'); // Send success response
    } catch (err) {
        res.status(500).send('Error resetting all contributors'); // Send error response if resetting fails
    }
};