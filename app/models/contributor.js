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
        count: { type: Number, default: 0 }
    }],
    // Array of reviews with date
    reviews: [{
        date: { type: Date, required: true },
        count: { type: Number, default: 0 }
    }]
});

// Create a model for the Contributor schema
const Contributor = mongoose.model('Contributor', ContributorSchema);

export default Contributor;