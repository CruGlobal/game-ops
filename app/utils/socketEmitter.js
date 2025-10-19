import { SOCKET_EVENTS } from '../config/websocket-config.js';

let ioInstance = null;

// Set the Socket.IO instance
export const setSocketIO = (io) => {
    ioInstance = io;
};

// Get the Socket.IO instance
export const getSocketIO = () => {
    return ioInstance;
};

// Emit PR update event
export const emitPRUpdate = (data) => {
    if (!ioInstance) return;

    ioInstance.to('scoreboard-updates').emit(SOCKET_EVENTS.PR_UPDATE, {
        username: data.username,
        prCount: data.prCount,
        timestamp: new Date()
    });
};

// Emit badge awarded event
export const emitBadgeAwarded = (data) => {
    if (!ioInstance) return;

    ioInstance.to('scoreboard-updates').emit(SOCKET_EVENTS.BADGE_AWARDED, {
        username: data.username,
        badgeName: data.badgeName,
        badgeType: data.badgeType,
        timestamp: new Date()
    });
};

// Emit leaderboard update event
export const emitLeaderboardUpdate = (data) => {
    if (!ioInstance) return;

    ioInstance.to('scoreboard-updates').emit(SOCKET_EVENTS.LEADERBOARD_UPDATE, {
        username: data.username,
        pullRequestCount: data.pullRequestCount,
        reviewCount: data.reviewCount,
        totalPoints: data.totalPoints || 0,
        rank: data.rank,
        avatarUrl: data.avatarUrl,
        timestamp: new Date()
    });
};

// Emit review update event
export const emitReviewUpdate = (data) => {
    if (!ioInstance) return;

    ioInstance.to('scoreboard-updates').emit(SOCKET_EVENTS.REVIEW_UPDATE, {
        username: data.username,
        reviewCount: data.reviewCount,
        timestamp: new Date()
    });
};

// Emit contributor activity event
export const emitContributorActivity = (data) => {
    if (!ioInstance) return;

    ioInstance.to('scoreboard-updates').emit(SOCKET_EVENTS.CONTRIBUTOR_ACTIVITY, {
        username: data.username,
        activityType: data.activityType,
        details: data.details,
        timestamp: new Date()
    });
};

// Emit streak update event
export const emitStreakUpdate = (data) => {
    if (!ioInstance) return;

    ioInstance.to('scoreboard-updates').emit(SOCKET_EVENTS.STREAK_UPDATE, {
        username: data.username,
        currentStreak: data.currentStreak,
        longestStreak: data.longestStreak,
        timestamp: new Date()
    });
};

// Emit achievement unlocked event
export const emitAchievementUnlocked = (data) => {
    if (!ioInstance) return;

    ioInstance.to('scoreboard-updates').emit(SOCKET_EVENTS.ACHIEVEMENT_UNLOCKED, {
        username: data.username,
        achievementId: data.achievementId,
        achievementName: data.achievementName,
        description: data.description,
        category: data.category,
        points: data.points,
        timestamp: new Date()
    });
};

// Emit points awarded event
export const emitPointsAwarded = (data) => {
    if (!ioInstance) return;

    ioInstance.to('scoreboard-updates').emit(SOCKET_EVENTS.POINTS_AWARDED, {
        username: data.username,
        points: data.points,
        totalPoints: data.totalPoints,
        reason: data.reason,
        prNumber: data.prNumber,
        timestamp: new Date()
    });
};

// Emit challenge progress event
export const emitChallengeProgress = (data) => {
    if (!ioInstance) return;

    ioInstance.to('scoreboard-updates').emit(SOCKET_EVENTS.CHALLENGE_PROGRESS, {
        username: data.username,
        challengeId: data.challengeId,
        challengeName: data.challengeName,
        progress: data.progress,
        target: data.target,
        percentComplete: data.percentComplete,
        timestamp: new Date()
    });
};

// Emit challenge completed event
export const emitChallengeCompleted = (data) => {
    if (!ioInstance) return;

    ioInstance.to('scoreboard-updates').emit(SOCKET_EVENTS.CHALLENGE_COMPLETED, {
        username: data.username,
        challengeId: data.challengeId,
        challengeName: data.challengeName,
        reward: data.reward,
        totalPoints: data.totalPoints,
        timestamp: new Date()
    });
};
