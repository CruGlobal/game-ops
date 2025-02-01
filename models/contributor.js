import mongoose from 'mongoose';

const ContributorSchema = new mongoose.Schema({
    username: { type: String, required: true },
    prCount: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    avatarUrl: { type: String },
    lastUpdated: { type: Date, default: Date.now },
    firstPrAwarded: { type: Boolean, default: false },
    firstReviewAwarded: { type: Boolean, default: false },
    first10PrsAwarded: { type: Boolean, default: false },
    first10ReviewsAwarded: { type: Boolean, default: false },
    first500PrsAwarded: { type: Boolean, default: false },
    first500ReviewsAwarded: { type: Boolean, default: false },
    first1000PrsAwarded: { type: Boolean, default: false },
    first1000ReviewsAwarded: { type: Boolean, default: false },
    badges: { type: Array, default: [] },
    totalBillsAwarded: { type: Number, default: 0 },
});

const Contributor = mongoose.model('Contributor', ContributorSchema);

export default Contributor;