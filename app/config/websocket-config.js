// WebSocket configuration for real-time updates
export const socketConfig = {
    cors: {
        origin: process.env.CORS_ORIGIN || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
};

// Event names constants
export const SOCKET_EVENTS = {
    // Server -> Client events
    PR_UPDATE: 'pr-update',
    BADGE_AWARDED: 'badge-awarded',
    LEADERBOARD_UPDATE: 'leaderboard-update',
    REVIEW_UPDATE: 'review-update',
    CONTRIBUTOR_ACTIVITY: 'contributor-activity',

    // Gamification events
    STREAK_UPDATE: 'streak-update',
    ACHIEVEMENT_UNLOCKED: 'achievement-unlocked',
    POINTS_AWARDED: 'points-awarded',
    CHALLENGE_PROGRESS: 'challenge-progress',
    CHALLENGE_COMPLETED: 'challenge-completed',

    // Client -> Server events
    SUBSCRIBE_UPDATES: 'subscribe-updates',
    UNSUBSCRIBE_UPDATES: 'unsubscribe-updates',

    // Connection events
    CONNECTION: 'connection',
    DISCONNECT: 'disconnect',
    ERROR: 'error'
};

export default { socketConfig, SOCKET_EVENTS };
