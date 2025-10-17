import mongoose from 'mongoose';

// Define the schema for a Contributor
const ContributorSchema = new mongoose.Schema({
    // GitHub username of the contributor
    username: { type: String, required: true },
    // Number of pull requests made by the contributor
    prCount: { type: Number, default: 0 },
    // Number of reviews made by the contributor
    reviewCount: { type: Number, default: 0 },
    // URL of the contributor's avatar
    avatarUrl: { type: String },
    // Timestamp of the last update to the contributor's data
    lastUpdated: { type: Date, default: Date.now },
    // Flags indicating whether certain badges have been awarded
    firstPrAwarded: { type: Boolean, default: false },
    firstReviewAwarded: { type: Boolean, default: false },
    first10PrsAwarded: { type: Boolean, default: false },
    first10ReviewsAwarded: { type: Boolean, default: false },
    first50PrsAwarded: { type: Boolean, default: false },
    first50ReviewsAwarded: { type: Boolean, default: false },
    first100PrsAwarded: { type: Boolean, default: false },
    first100ReviewsAwarded: { type: Boolean, default: false },
    first500PrsAwarded: { type: Boolean, default: false },
    first500ReviewsAwarded: { type: Boolean, default: false },
    first1000PrsAwarded: { type: Boolean, default: false },
    first1000ReviewsAwarded: { type: Boolean, default: false },
    // Array of badges awarded to the contributor
    badges: { type: Array, default: [] },
    // Total number of bills awarded to the contributor
    totalBillsAwarded: { type: Number, default: 0 },
    // Array of contributions with date
    contributions: [{
        date: { type: Date, required: true },
        count: { type: Number, default: 0 },
        merged: { type: Boolean, default: false } // Added merged attribute
    }],
    // Array of reviews with date
    reviews: [{
        date: { type: Date, required: true },
        count: { type: Number, default: 0 }
    }],

    // Streak tracking
    currentStreak: {
        type: Number,
        default: 0
    },
    lastContributionDate: {
        type: Date,
        default: null
    },
    longestStreak: {
        type: Number,
        default: 0
    },

    // Points system
    totalPoints: {
        type: Number,
        default: 0
    },
    pointsHistory: [{
        points: Number,
        reason: String,
        prNumber: Number,
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],

    // Achievement system
    achievements: [{
        achievementId: String,
        name: String,
        description: String,
        earnedAt: {
            type: Date,
            default: Date.now
        },
        category: String
    }],

    // Challenge participation
    activeChallenges: [{
        challengeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Challenge'
        },
        progress: {
            type: Number,
            default: 0
        },
        target: Number,
        joined: {
            type: Date,
            default: Date.now
        }
    }],
    completedChallenges: [{
        challengeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Challenge'
        },
        completedAt: Date,
        reward: Number
    }],

    // Streak badges
    streakBadges: {
        sevenDay: {
            type: Boolean,
            default: false
        },
        thirtyDay: {
            type: Boolean,
            default: false
        },
        ninetyDay: {
            type: Boolean,
            default: false
        },
        yearLong: {
            type: Boolean,
            default: false
        }
    },

    // Track processed PRs to prevent duplicates
    processedPRs: [{
        prNumber: {
            type: Number,
            required: true
        },
        prTitle: String,
        processedDate: {
            type: Date,
            default: Date.now
        },
        action: {
            type: String,
            enum: ['authored', 'reviewed'],
            required: true
        }
    }],
    processedReviews: [{
        prNumber: {
            type: Number,
            required: true
        },
        reviewId: Number,  // GitHub review ID
        processedDate: {
            type: Date,
            default: Date.now
        }
    }]
});

// Index for quick duplicate lookup
ContributorSchema.index({ 'processedPRs.prNumber': 1 });
ContributorSchema.index({ 'processedReviews.prNumber': 1 });

// Create a model for the Contributor schema
const Contributor = mongoose.model('Contributor', ContributorSchema);

export default Contributor;