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
        leaderboard: data.leaderboard,
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
