import mongoose from 'mongoose';

const quarterlyWinnerSchema = new mongoose.Schema({
    quarter: {
        type: String,
        required: true,
        unique: true,
        index: true  // e.g., "2025-Q1"
    },
    year: {
        type: Number,
        required: true
    },
    quarterNumber: {
        type: Number,
        min: 1,
        max: 4,
        required: true
    },
    quarterStart: {
        type: Date,
        required: true
    },
    quarterEnd: {
        type: Date,
        required: true
    },
    winner: {
        username: {
            type: String,
            required: true
        },
        avatarUrl: String,
        prsThisQuarter: {
            type: Number,
            default: 0
        },
        reviewsThisQuarter: {
            type: Number,
            default: 0
        },
        pointsThisQuarter: {
            type: Number,
            default: 0
        }
    },
    top3: [{
        rank: {
            type: Number,
            min: 1,
            max: 3
        },
        username: {
            type: String,
            required: true
        },
        avatarUrl: String,
        prsThisQuarter: {
            type: Number,
            default: 0
        },
        reviewsThisQuarter: {
            type: Number,
            default: 0
        },
        pointsThisQuarter: {
            type: Number,
            default: 0
        }
    }],
    totalParticipants: {
        type: Number,
        default: 0
    },
    archivedDate: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index for efficient querying by year and quarter
quarterlyWinnerSchema.index({ year: -1, quarterNumber: -1 });

// Helper method to get display name
quarterlyWinnerSchema.methods.getDisplayName = function() {
    return `Q${this.quarterNumber} ${this.year}`;
};

const QuarterlyWinner = mongoose.model('QuarterlyWinner', quarterlyWinnerSchema);

export default QuarterlyWinner;
