import mongoose from 'mongoose';
import Contributor from '../../models/contributor.js';

/**
 * Monitor for new duplicates after fix
 * Run this after fixing duplicates to verify cron doesn't create new ones
 */
async function monitorDuplicates() {
    try {
        await mongoose.connect('mongodb://localhost:27017/github-scoreboard');
        console.log('✅ Connected to MongoDB\n');

        const contributors = await Contributor.find({}).lean();

        let totalPRCount = 0;
        let totalProcessedPRs = 0;
        let totalReviewCount = 0;
        let totalProcessedReviews = 0;
        let mismatches = [];

        for (const contributor of contributors) {
            const prCount = contributor.prCount || 0;
            const processedPRCount = contributor.processedPRs?.length || 0;
            const reviewCount = contributor.reviewCount || 0;
            const processedReviewCount = contributor.processedReviews?.length || 0;

            totalPRCount += prCount;
            totalProcessedPRs += processedPRCount;
            totalReviewCount += reviewCount;
            totalProcessedReviews += processedReviewCount;

            // Check for mismatches
            if (prCount !== processedPRCount || reviewCount !== processedReviewCount) {
                mismatches.push({
                    username: contributor.username,
                    prCount,
                    processedPRs: processedPRCount,
                    prDiff: prCount - processedPRCount,
                    reviewCount,
                    processedReviews: processedReviewCount,
                    reviewDiff: reviewCount - processedReviewCount
                });
            }
        }

        console.log('📊 DATABASE INTEGRITY CHECK\n');
        console.log('='.repeat(80));
        console.log('');

        console.log(`Total PR Count:          ${totalPRCount}`);
        console.log(`Total Processed PRs:     ${totalProcessedPRs}`);
        console.log(`Difference:              ${totalPRCount - totalProcessedPRs}`);
        console.log('');
        console.log(`Total Review Count:      ${totalReviewCount}`);
        console.log(`Total Processed Reviews: ${totalProcessedReviews}`);
        console.log(`Difference:              ${totalReviewCount - totalProcessedReviews}`);
        console.log('');

        if (mismatches.length === 0) {
            console.log('✅ NO MISMATCHES FOUND - Database is clean!\n');
            console.log('The duplicate prevention fix is working correctly.');
        } else {
            console.log(`⚠️  FOUND ${mismatches.length} MISMATCHES:\n`);

            for (const mismatch of mismatches) {
                console.log(`👤 ${mismatch.username}`);
                if (mismatch.prDiff !== 0) {
                    console.log(`   PRs: ${mismatch.prCount} vs ${mismatch.processedPRs} (${mismatch.prDiff > 0 ? '+' : ''}${mismatch.prDiff})`);
                }
                if (mismatch.reviewDiff !== 0) {
                    console.log(`   Reviews: ${mismatch.reviewCount} vs ${mismatch.processedReviews} (${mismatch.reviewDiff > 0 ? '+' : ''}${mismatch.reviewDiff})`);
                }
            }

            console.log('\n⚠️  New duplicates may be getting created!');
            console.log('   Check if Docker was restarted after the fix.');
        }

        console.log('\n' + '='.repeat(80));
        console.log('\n💡 RECOMMENDATIONS:\n');
        console.log('   1. Run this script hourly to monitor for new duplicates');
        console.log('   2. If mismatches appear, check Docker logs for errors');
        console.log('   3. Verify cron job is using the fixed code');
        console.log('   4. Check admin page "Data Overview" for real-time status');
        console.log('');

        await mongoose.disconnect();
        console.log('✅ Monitoring complete\n');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

monitorDuplicates();
