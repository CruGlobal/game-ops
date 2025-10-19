import mongoose from 'mongoose';
import Contributor from '../../models/contributor.js';

async function verifySeptemberReviews() {
    try {
        // Connect to correct database (same as docker-compose)
        await mongoose.connect('mongodb://localhost:27017/github-scoreboard');
        console.log('Connected to MongoDB\n');

        // Check reviews in September 2025
        const startDate = new Date('2025-09-01T00:00:00Z');
        const endDate = new Date('2025-09-30T23:59:59Z');

        const contributors = await Contributor.find({
            'reviews.date': {
                $gte: startDate,
                $lte: endDate
            }
        });

        let totalSeptemberReviews = 0;
        const reviewerStats = [];

        for (const contributor of contributors) {
            const septemberReviews = contributor.reviews.filter(review => {
                const reviewDate = new Date(review.date);
                return reviewDate >= startDate && reviewDate <= endDate;
            });

            if (septemberReviews.length > 0) {
                totalSeptemberReviews += septemberReviews.length;
                reviewerStats.push({
                    username: contributor.username,
                    reviews: septemberReviews.length
                });
            }
        }

        console.log('✅ September 2025 Review Summary:');
        console.log(`   Total Reviews: ${totalSeptemberReviews}`);
        console.log(`   Reviewers: ${reviewerStats.length}\n`);

        if (reviewerStats.length > 0) {
            console.log('Top 10 September Reviewers:');
            reviewerStats.sort((a, b) => b.reviews - a.reviews);
            reviewerStats.slice(0, 10).forEach((reviewer, index) => {
                console.log(`   ${index + 1}. ${reviewer.username}: ${reviewer.reviews} reviews`);
            });
        } else {
            console.log('⚠️  No reviews found for September 2025');
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

verifySeptemberReviews();
