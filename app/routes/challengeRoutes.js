import express from 'express';
import {
    getActiveChallengesController,
    getChallengeDetailsController,
    joinChallengeController,
    getChallengeLeaderboardController,
    getUserChallengesController
} from '../controllers/challengeController.js';

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

export default router;
