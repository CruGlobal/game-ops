import express from 'express';
import {
    getActiveChallengesController,
    getChallengeDetailsController,
    joinChallengeController,
    getChallengeLeaderboardController,
    getUserChallengesController,
    createOKRChallengeController,
    createManualChallengeController,
    getAllChallengesController,
    deleteChallengeController
} from '../controllers/challengeController.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { ensureAuthenticated } from '../middleware/ensureAuthenticated.js';
import { ensureDevOpsTeamMember } from '../middleware/ensureDevOpsTeamMember.js';

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
router.post('/okr/create', authenticate, createOKRChallengeController);

// Admin routes for challenge management
router.post('/admin/create', ensureDevOpsTeamMember, createManualChallengeController);
router.get('/admin/all', ensureDevOpsTeamMember, getAllChallengesController);
router.delete('/admin/:id', ensureDevOpsTeamMember, deleteChallengeController);

export default router;
