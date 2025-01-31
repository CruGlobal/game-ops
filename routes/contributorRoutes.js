import express from 'express';
import { fetchPRs, awardContributorBadges, topContributors, topReviewers } from '../controllers/contributorController.js';

const router = express.Router();

router.get('/fetch-pull-requests', fetchPRs);
router.get('/award-badges', awardContributorBadges);
router.get('/top-contributors', topContributors);
router.get('/top-reviewers', topReviewers);

export default router;