import mongoose from 'mongoose';

const prMetadataSchema = new mongoose.Schema({
    repoOwner: {
        type: String,
        required: true,
        default: 'cru-Luis-Rodriguez'
    },
    repoName: {
        type: String,
        required: true,
        default: 'github-pr-scoreboard'
    },
    firstPRFetched: {
        type: Number,
        default: null  // Will be set on first fetch
    },
    latestPRFetched: {
        type: Number,
        default: null  // Updated each fetch
    },
    totalPRsInDB: {
        type: Number,
        default: 0
    },
    dateRangeStart: {
        type: Date,
        default: null  // Oldest PR merge date
    },
    dateRangeEnd: {
        type: Date,
        default: null  // Newest PR merge date
    },
    lastFetchDate: {
        type: Date,
        default: null
    },
    fetchHistory: [{
        fetchDate: {
            type: Date,
            default: Date.now
        },
        prRangeFetched: String,  // e.g., "1-100" or "single PR #45"
        prsAdded: Number,
        reviewsAdded: Number
    }]
}, {
    timestamps: true
});

// Singleton pattern - only one metadata record per repo
prMetadataSchema.index({ repoOwner: 1, repoName: 1 }, { unique: true });

const PRMetadata = mongoose.model('PRMetadata', prMetadataSchema);

export default PRMetadata;
