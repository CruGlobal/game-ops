import mongoose from 'mongoose';
import Contributor from '../../models/contributor.js';

async function checkProcessedReviews() {
    try {
        await mongoose.connect('mongodb://localhost:27017/github-scoreboard');
        console.log('Connected to MongoDB (github-scoreboard)\n');

        // Check September reviews in processedReviews array
        const startDate = new Date('2025-09-01T00:00:00Z');
        const endDate = new Date('2025-09-30T23:59:59Z');

        // Get all contributors with processedReviews
        const contributors = await Contributor.find({
            'processedReviews.0': { $exists: true }
        }).select('username processedReviews');

        let totalProcessedReviews = 0;
        let septemberProcessedReviews = 0;

        for (const contributor of contributors) {
            totalProcessedReviews += contributor.processedReviews.length;

            const septReviews = contributor.processedReviews.filter(review => {
                const reviewDate = new Date(review.processedDate);
                return reviewDate >= startDate && reviewDate <= endDate;
            });

            septemberProcessedReviews += septReviews.length;
        }

        console.log(`📊 Processed Reviews Tracking:`);
        console.log(`   Contributors with processedReviews: ${contributors.length}`);
        console.log(`   Total processedReviews entries: ${totalProcessedReviews}`);
        console.log(`   September processedReviews: ${septemberProcessedReviews}\n`);

        // Now check reviews array (time-series data)
        const reviewContributors = await Contributor.find({
            'reviews.0': { $exists: true }
        }).select('username reviews reviewCount');

        let totalReviewsArray = 0;
        let septemberReviewsArray = 0;
        let totalReviewCount = 0;

        for (const contributor of reviewContributors) {
            totalReviewCount += contributor.reviewCount || 0;
            totalReviewsArray += contributor.reviews.length;

            const septReviews = contributor.reviews.filter(review => {
                const reviewDate = new Date(review.date);
                return reviewDate >= startDate && reviewDate <= endDate;
            });

            septemberReviewsArray += septReviews.length;
        }

        console.log(`📊 Reviews Array (time-series):`);
        console.log(`   Contributors with reviews: ${reviewContributors.length}`);
        console.log(`   Total reviews array entries: ${totalReviewsArray}`);
        console.log(`   Total reviewCount: ${totalReviewCount}`);
        console.log(`   September reviews array: ${septemberReviewsArray}\n`);

        console.log(`❓ Analysis:`);
        if (septemberProcessedReviews === 0 && septemberReviewsArray > 0) {
            console.log(`   ⚠️  Reviews exist but NOT in processedReviews array!`);
            console.log(`   This means reviews were added by the regular cron job,`);
            console.log(`   not by the backfill service. Backfill can still add them to processedReviews.`);
        } else if (septemberProcessedReviews > 0 && septemberProcessedReviews === septemberReviewsArray) {
            console.log(`   ✅ All September reviews are tracked in processedReviews`);
        } else if (septemberProcessedReviews > 0) {
            console.log(`   ⚠️  Partial tracking: ${septemberProcessedReviews} in processedReviews, ${septemberReviewsArray} in reviews array`);
        }

        // Sample data
        if (contributors.length > 0) {
            console.log(`\n📝 Sample processedReviews:`);
            const sample = contributors[0];
            console.log(`   ${sample.username}: ${sample.processedReviews.length} total`);
            if (sample.processedReviews.length > 0) {
                const sampleReview = sample.processedReviews[0];
                console.log(`   Sample: PR #${sampleReview.prNumber}, Review ID: ${sampleReview.reviewId}, Date: ${sampleReview.processedDate}`);
            }
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkProcessedReviews();
