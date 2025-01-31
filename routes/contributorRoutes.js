import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
    fetchPRs,
    fetchReviewsData,
    awardContributorBadges,
    topContributors,
    topReviewers
} from '../controllers/contributorController.js';

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

router.get('/fetch-pull-requests', fetchPRs);
router.get('/fetch-reviews', fetchReviewsData);
router.get('/award-badges', awardContributorBadges);
router.get('/top-contributors', topContributors);
router.get('/top-reviewers', topReviewers);

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