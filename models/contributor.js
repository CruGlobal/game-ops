import mongoose from 'mongoose';

const ContributorSchema = new mongoose.Schema({
    username: { type: String, required: true },
    prCount: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    avatarUrl: { type: String },
    lastUpdated: { type: Date, default: Date.now },
    first10PrsAwarded: { type: Boolean, default: false },
    first10ReviewsAwarded: { type: Boolean, default: false },
});

const Contributor = mongoose.model('Contributor', ContributorSchema);

export default Contributor;