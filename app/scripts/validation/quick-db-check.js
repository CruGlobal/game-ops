import mongoose from 'mongoose';
import Contributor from '../../models/contributor.js';

async function quickCheck() {
    try {
        await mongoose.connect('mongodb://localhost:27017/github-scoreboard');

        const totalContributors = await Contributor.countDocuments();
        console.log(`Total contributors: ${totalContributors}`);

        const sample = await Contributor.findOne().select('username prCount reviewCount contributions processedPRs');

        if (sample) {
            console.log(`\nSample contributor: ${sample.username}`);
            console.log(`  prCount: ${sample.prCount}`);
            console.log(`  reviewCount: ${sample.reviewCount}`);
            console.log(`  contributions array length: ${sample.contributions?.length || 0}`);
            console.log(`  processedPRs array length: ${sample.processedPRs?.length || 0}`);

            if (sample.contributions && sample.contributions.length > 0) {
                console.log(`  Sample contribution:`, sample.contributions[0]);
            }

            if (sample.processedPRs && sample.processedPRs.length > 0) {
                console.log(`  Sample processedPR:`, sample.processedPRs[0]);
            }
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

quickCheck();
