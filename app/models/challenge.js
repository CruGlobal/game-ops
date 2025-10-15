import mongoose from 'mongoose';

const challengeSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['pr-merge', 'review', 'streak', 'points', 'team'],
        required: true
    },
    target: {
        type: Number,
        required: true
    },
    reward: {
        type: Number,
        required: true
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    status: {
        type: String,
        enum: ['upcoming', 'active', 'completed', 'expired'],
        default: 'upcoming'
    },
    participants: [{
        username: String,
        progress: {
            type: Number,
            default: 0
        },
        completed: {
            type: Boolean,
            default: false
        },
        joinedAt: {
            type: Date,
            default: Date.now
        }
    }],
    difficulty: {
        type: String,
        enum: ['easy', 'medium', 'hard'],
        default: 'medium'
    },
    category: {
        type: String,
        enum: ['individual', 'community'],
        default: 'individual'
    }
}, {
    timestamps: true
});

// Index for querying active challenges
challengeSchema.index({ status: 1, endDate: 1 });

const Challenge = mongoose.model('Challenge', challengeSchema);

export default Challenge;
