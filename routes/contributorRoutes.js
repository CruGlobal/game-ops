import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import Contributor from '../models/contributor.js';
import {
    fetchPRs,
    fetchReviewsData,
    awardContributorBadges,
    topContributors,
    topReviewers,
    awardBillsAndVonettesController
} from '../controllers/contributorController.js';
import { adminLogin, getContributors, resetContributor, resetAllContributors } from '../controllers/adminController.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Route to fetch pull requests
router.get('/fetch-pull-requests', fetchPRs);

// Route to fetch review data
router.get('/fetch-reviews', fetchReviewsData);

// Route to award badges to contributors
router.get('/award-badges', awardContributorBadges);

// Route to get the top contributors
router.get('/top-contributors', topContributors);

// Route to get the top reviewers
router.get('/top-reviewers', topReviewers);

// Route to award Bills and Vonettes
router.get('/award-bills-vonettes', awardBillsAndVonettesController);

// Admin login route
router.post('/admin/login', adminLogin);

// Route to get all contributors
router.get('/admin/contributors', getContributors);

// Route to reset a specific contributor
router.post('/admin/reset-contributor', resetContributor);

// Route to reset all contributors
router.post('/admin/reset-all', resetAllContributors);

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

export default router;