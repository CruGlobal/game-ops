import mongoose from 'mongoose';
import Contributor from '../../models/contributor.js';

async function checkCurrentTotals() {
    try {
        await mongoose.connect('mongodb://localhost:27017/github-scoreboard');
        console.log('✅ Connected to MongoDB\n');

        const contributors = await Contributor.find({})
            .select('username prCount processedPRs')
            .lean();

        let totalPRCount = 0;
        let totalProcessedPRs = 0;
        let latestProcessedDate = null;
        let oldestProcessedDate = null;

        for (const contributor of contributors) {
            totalPRCount += contributor.prCount || 0;
            totalProcessedPRs += contributor.processedPRs?.length || 0;

            for (const pr of contributor.processedPRs || []) {
                const date = new Date(pr.processedDate);

                if (!latestProcessedDate || date > latestProcessedDate) {
                    latestProcessedDate = date;
                }
                if (!oldestProcessedDate || date < oldestProcessedDate) {
                    oldestProcessedDate = date;
                }
            }
        }

        console.log('📊 CURRENT DATABASE TOTALS:\n');
        console.log(`   Total prCount across all contributors: ${totalPRCount}`);
        console.log(`   Total processedPRs tracked: ${totalProcessedPRs}`);
        console.log(`   Difference (missing from tracking): ${totalPRCount - totalProcessedPRs}`);
        console.log('');
        console.log(`   Oldest processedDate: ${oldestProcessedDate?.toLocaleString()}`);
        console.log(`   Latest processedDate: ${latestProcessedDate?.toLocaleString()}`);
        console.log('');

        // Check last 20 PRs added
        console.log('📋 LAST 20 PRS ADDED TO DATABASE:\n');

        const allPRs = [];
        for (const contributor of contributors) {
            for (const pr of contributor.processedPRs || []) {
                allPRs.push({
                    username: contributor.username,
                    ...pr,
                    processedDate: new Date(pr.processedDate)
                });
            }
        }

        // Sort by processedDate descending
        allPRs.sort((a, b) => b.processedDate - a.processedDate);

        const last20 = allPRs.slice(0, 20);
        for (let i = 0; i < last20.length; i++) {
            const pr = last20[i];
            console.log(`${i + 1}. PR #${pr.prNumber} by ${pr.username}`);
            console.log(`   Added: ${pr.processedDate.toLocaleString()}`);
            console.log(`   Title: ${pr.prTitle?.substring(0, 60)}${pr.prTitle?.length > 60 ? '...' : ''}`);
        }

        await mongoose.disconnect();
        console.log('\n✅ Complete');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

checkCurrentTotals();
