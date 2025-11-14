import {
    getActiveChallenges,
    getChallengeById,
    joinChallenge,
    getUserChallenges,
    getChallengeLeaderboard,
    createOKRChallenge,
    createChallenge,
    deleteChallenge,
    getAllChallenges
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

// Create OKR challenge (admin only)
export const createOKRChallengeController = async (req, res) => {
    try {
        const {
            title,
            description,
            labelFilters,
            target,
            reward,
            startDate,
            endDate,
            difficulty,
            okrMetadata
        } = req.body;

        // Validate required fields
        if (!title || !description || !labelFilters || !Array.isArray(labelFilters) || labelFilters.length === 0) {
            return res.status(400).json({
                error: 'Title, description, and at least one label filter are required'
            });
        }

        if (!target || target < 1) {
            return res.status(400).json({
                error: 'Target must be at least 1'
            });
        }

        if (!endDate) {
            return res.status(400).json({
                error: 'End date is required'
            });
        }

        const challenge = await createOKRChallenge({
            title,
            description,
            labelFilters,
            target,
            reward,
            startDate,
            endDate,
            difficulty,
            okrMetadata
        });

        res.status(201).json({
            message: 'OKR challenge created successfully',
            challenge
        });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

// Create manual challenge (admin only)
export const createManualChallengeController = async (req, res) => {
    try {
        const {
            title,
            description,
            type,
            target,
            reward,
            startDate,
            endDate,
            difficulty,
            category
        } = req.body;

        // Validate required fields
        if (!title || !description) {
            return res.status(400).json({
                error: 'Title and description are required'
            });
        }

        if (!type || !['pr-merge', 'review', 'streak', 'points'].includes(type)) {
            return res.status(400).json({
                error: 'Type must be one of: pr-merge, review, streak, points'
            });
        }

        if (!target || target < 1) {
            return res.status(400).json({
                error: 'Target must be at least 1'
            });
        }

        if (!reward || reward < 0) {
            return res.status(400).json({
                error: 'Reward must be at least 0'
            });
        }

        if (!endDate) {
            return res.status(400).json({
                error: 'End date is required'
            });
        }

        // Build challenge data
        const challengeData = {
            title,
            description,
            type,
            target,
            reward,
            startDate: startDate ? new Date(startDate) : new Date(),
            endDate: new Date(endDate),
            status: 'active',
            difficulty: difficulty || 'medium',
            category: category || 'individual'
        };

        // Validate dates
        if (challengeData.endDate <= challengeData.startDate) {
            return res.status(400).json({
                error: 'End date must be after start date'
            });
        }

        const challenge = await createChallenge(challengeData);

        res.status(201).json({
            success: true,
            message: 'Challenge created successfully',
            challenge
        });
    } catch (err) {
        console.error('Error creating manual challenge:', err);
        res.status(400).json({ error: err.message });
    }
};

// Get all challenges (admin only) - for management
export const getAllChallengesController = async (req, res) => {
    try {
        const { status, limit = 50 } = req.query;

        const challenges = await getAllChallenges({
            status,
            limit: parseInt(limit)
        });

        res.json({
            success: true,
            challenges,
            count: challenges.length
        });
    } catch (err) {
        console.error('Error fetching all challenges:', err);
        res.status(500).json({ error: 'Error fetching challenges' });
    }
};

// Delete challenge (admin only)
export const deleteChallengeController = async (req, res) => {
    try {
        const { id } = req.params;

        await deleteChallenge(id);

        res.json({
            success: true,
            message: 'Challenge deleted successfully'
        });
    } catch (err) {
        console.error('Error deleting challenge:', err);
        res.status(400).json({ error: err.message });
    }
};
