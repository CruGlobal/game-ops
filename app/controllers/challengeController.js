import {
    getActiveChallenges,
    getChallengeById,
    joinChallenge,
    getUserChallenges,
    getChallengeLeaderboard
} from '../services/challengeService.js';

// Get all active challenges
export const getActiveChallengesController = async (req, res) => {
    try {
        const challenges = await getActiveChallenges();
        res.json({ challenges });
    } catch (err) {
        res.status(500).json({ error: 'Error fetching active challenges' });
    }
};

// Get challenge details by ID
export const getChallengeDetailsController = async (req, res) => {
    try {
        const { id } = req.params;
        const challenge = await getChallengeById(id);
        res.json(challenge);
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
};

// Join a challenge
export const joinChallengeController = async (req, res) => {
    try {
        const { id } = req.params;
        const { username } = req.body;

        if (!username) {
            return res.status(400).json({ error: 'Username is required' });
        }

        const result = await joinChallenge(username, id);
        res.json({
            message: 'Successfully joined challenge',
            challenge: result.challenge,
            contributor: {
                username: result.contributor.username,
                activeChallenges: result.contributor.activeChallenges
            }
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Get challenge leaderboard
export const getChallengeLeaderboardController = async (req, res) => {
    try {
        const { id } = req.params;
        const leaderboard = await getChallengeLeaderboard(id);
        res.json(leaderboard);
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
};

// Get user's challenges (active and completed)
export const getUserChallengesController = async (req, res) => {
    try {
        const { username } = req.params;
        const challenges = await getUserChallenges(username);
        res.json(challenges);
    } catch (err) {
        res.status(404).json({ error: err.message });
    }
};
