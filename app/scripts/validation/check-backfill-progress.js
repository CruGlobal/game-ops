import mongoose from 'mongoose';
import Contributor from '../../models/contributor.js';

async function checkBackfillProgress() {
    try {
        await mongoose.connect('mongodb://localhost:27017/github-scoreboard');

        const contributors = await Contributor.find({}).select('username prCount reviewCount processedPRs processedReviews');

        let totalPRs = 0;
        let totalReviews = 0;
        let totalProcessedPRs = 0;
        let totalProcessedReviews = 0;

        for (const contributor of contributors) {
            totalPRs += contributor.prCount || 0;
            totalReviews += contributor.reviewCount || 0;
            totalProcessedPRs += contributor.processedPRs?.length || 0;
            totalProcessedReviews += contributor.processedReviews?.length || 0;
        }

        console.log(`📊 Backfill Progress:\n`);
        console.log(`   Contributors: ${contributors.length}`);
        console.log(`   Total PRs: ${totalPRs}`);
        console.log(`   Total Reviews: ${totalReviews}`);
        console.log(`   Tracked PRs: ${totalProcessedPRs}`);
        console.log(`   Tracked Reviews: ${totalProcessedReviews}\n`);

        console.log(`💡 Expected total: ~8,517 PRs (from GitHub scan)\n`);

        const percentComplete = ((totalProcessedPRs / 8517) * 100).toFixed(1);
        console.log(`   Progress: ${totalProcessedPRs} / 8,517 (${percentComplete}%)\n`);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

checkBackfillProgress();
