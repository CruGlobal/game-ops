import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Contributor from '../models/contributor.js';
import {
    initializeDatabaseController,
    fetchPRs,
    awardContributorBadges,
    topContributors,
    topReviewers,
    topReviewersDateRange,
    topContributorsDateRange,
    awardBillsAndVonettesController,
    fetchActivityController
} from '../controllers/contributorController.js';
import { getContributors, resetContributor, resetAllContributors } from '../controllers/adminController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { login } from '../controllers/authController.js';
import { ensureAuthenticated } from '../middleware/ensureAuthenticated.js';

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
router.get('/admin/contributors', authenticate, getContributors);

// Route to reset a specific contributor
router.post('/admin/reset-contributor', authenticate, resetContributor);

// Route to reset all contributors
router.post('/admin/reset-all', authenticate, resetAllContributors);

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
    if (req.isAuthenticated()) {
        res.json({ isAuthenticated: true, username: req.user.username });
    } else {
        res.json({ isAuthenticated: false });
    }
});

// Route to get the top contributors within a date range with pagination
router.get('/top-contributors-date-range', topContributorsDateRange);

// Route to get the top reviewers within a date range with pagination
router.get('/top-reviewers-date-range', topReviewersDateRange);

// Route to get the activity data
router.get('/activity', fetchActivityController);

export default router;