import mongoose from 'mongoose';
import Contributor from '../../models/contributor.js';

async function findMissingPRs() {
    try {
        await mongoose.connect('mongodb://localhost:27017/github-scoreboard');

        // Get contributors with mismatches
        const targetUsers = [
            'davidhollenberger',
            'cklineFL',
            'github-actions[bot]',
            'JasonBuckner',
            'jeffboehlke',
            'hal9000jw'
        ];

        console.log('🔍 Investigating Missing PRs\n');
        console.log('Looking for PRs in contributions array but NOT in processedPRs array\n');

        for (const username of targetUsers) {
            const contributor = await Contributor.findOne({ username })
                .select('username prCount contributions processedPRs');

            if (!contributor) continue;

            // Get all PR numbers from processedPRs
            const trackedPRNumbers = new Set(
                contributor.processedPRs?.map(p => p.prNumber) || []
            );

            // Check contributions array
            // The contributions array stores dates, not PR numbers directly
            // We need to count contributions and see which ones don't have corresponding processedPRs

            const prCount = contributor.prCount || 0;
            const trackedCount = contributor.processedPRs?.length || 0;
            const diff = prCount - trackedCount;

            console.log(`\n📊 ${username}:`);
            console.log(`   prCount: ${prCount}`);
            console.log(`   processedPRs: ${trackedCount}`);
            console.log(`   Missing: ${diff}`);
            console.log(`   contributions array: ${contributor.contributions?.length || 0} entries`);

            // Check if contributions array length matches prCount
            if (contributor.contributions) {
                const mergedContributions = contributor.contributions.filter(c => c.merged === true);
                console.log(`   Merged contributions: ${mergedContributions.length}`);

                if (mergedContributions.length !== prCount) {
                    console.log(`   ⚠️  contributions array mismatch!`);
                }
            }

            // Look at date ranges
            if (contributor.contributions && contributor.contributions.length > 0) {
                const dates = contributor.contributions.map(c => new Date(c.date)).sort((a, b) => a - b);
                const oldest = dates[0];
                const newest = dates[dates.length - 1];
                console.log(`   Date range: ${oldest.toLocaleDateString()} to ${newest.toLocaleDateString()}`);
            }

            // Check if processedPRs has any from today (would indicate hourly cron)
            if (contributor.processedPRs && contributor.processedPRs.length > 0) {
                const today = new Date().toDateString();
                const todayPRs = contributor.processedPRs.filter(p =>
                    new Date(p.processedDate).toDateString() === today
                );

                if (todayPRs.length > 0) {
                    console.log(`   ✅ Has ${todayPRs.length} PRs processed today (likely from hourly cron)`);
                    console.log(`      PR numbers: ${todayPRs.map(p => `#${p.prNumber}`).join(', ')}`);
                }
            }
        }

        console.log('\n\n💡 Analysis:\n');
        console.log('If some contributors have PRs from today in processedPRs,');
        console.log('those were added by the HOURLY CRON JOB while backfill was running.');
        console.log('The missing PRs are likely older PRs that were added BEFORE');
        console.log('the processedPRs tracking system was implemented.\n');

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

findMissingPRs();
