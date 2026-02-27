import {
    getActiveChallenges,
    getChallengeById,
    joinChallenge,
    getUserChallenges,
    getChallengeLeaderboard,
    createOKRChallenge,
    createChallenge,
    deleteChallenge,
    getAllChallenges,
    updateChallenge,
    duplicateChallenge,
    bulkUpdateChallenges,
    bulkDeleteChallenges
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

// Update challenge (admin only)
export const updateChallengeController = async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        // Validate type if provided
        if (updateData.type && !['pr-merge', 'review', 'streak', 'points', 'okr-label'].includes(updateData.type)) {
            return res.status(400).json({
                error: 'Type must be one of: pr-merge, review, streak, points, okr-label'
            });
        }

        // Validate target if provided
        if (updateData.target !== undefined && (updateData.target < 1 || !Number.isInteger(updateData.target))) {
            return res.status(400).json({
                error: 'Target must be a positive integer'
            });
        }

        // Validate reward if provided
        if (updateData.reward !== undefined && updateData.reward < 0) {
            return res.status(400).json({
                error: 'Reward must be at least 0'
            });
        }

        // Validate difficulty if provided
        if (updateData.difficulty && !['easy', 'medium', 'hard'].includes(updateData.difficulty)) {
            return res.status(400).json({
                error: 'Difficulty must be one of: easy, medium, hard'
            });
        }

        const updated = await updateChallenge(id, updateData);

        res.json({
            success: true,
            message: 'Challenge updated successfully',
            challenge: updated
        });
    } catch (err) {
        console.error('Error updating challenge:', err);
        const status = err.message.includes('not found') ? 404 : 400;
        res.status(status).json({ error: err.message });
    }
};

// Duplicate challenge (admin only)
export const duplicateChallengeController = async (req, res) => {
    try {
        const { id } = req.params;

        const duplicated = await duplicateChallenge(id);

        res.status(201).json({
            success: true,
            message: 'Challenge duplicated successfully',
            challenge: duplicated
        });
    } catch (err) {
        console.error('Error duplicating challenge:', err);
        const status = err.message.includes('not found') ? 404 : 400;
        res.status(status).json({ error: err.message });
    }
};

// Bulk action on challenges (admin only)
export const bulkActionController = async (req, res) => {
    try {
        const { ids, action } = req.body;

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({
                error: 'ids must be a non-empty array of challenge IDs'
            });
        }

        if (!action || !['activate', 'expire', 'delete'].includes(action)) {
            return res.status(400).json({
                error: 'Action must be one of: activate, expire, delete'
            });
        }

        let result;
        if (action === 'delete') {
            result = await bulkDeleteChallenges(ids);
        } else {
            result = await bulkUpdateChallenges(ids, action);
        }

        res.json({
            success: true,
            message: `Bulk ${action} completed successfully`,
            ...result
        });
    } catch (err) {
        console.error('Error performing bulk action:', err);
        res.status(400).json({ error: err.message });
    }
};
