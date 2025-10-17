import express from 'express';
import {
    getActiveChallengesController,
    getChallengeDetailsController,
    joinChallengeController,
    getChallengeLeaderboardController,
    getUserChallengesController,
    createOKRChallengeController
} from '../controllers/challengeController.js';
import { ensureAuthenticated, ensureAdmin } from '../middleware/auth.js';

const router = express.Router();

// Get all active challenges
router.get('/active', getActiveChallengesController);

// Get challenge details by ID
router.get('/:id', getChallengeDetailsController);

// Join a challenge
router.post('/:id/join', joinChallengeController);

// Get challenge leaderboard
router.get('/:id/leaderboard', getChallengeLeaderboardController);

// Get user's challenges (active and completed)
router.get('/user/:username', getUserChallengesController);

// Create OKR challenge (admin only)
router.post('/okr/create', ensureAuthenticated, ensureAdmin, createOKRChallengeController);

export default router;
