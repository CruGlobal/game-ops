import mongoose from 'mongoose';
import Contributor from '../../models/contributor.js';

async function checkCronInterference() {
    try {
        await mongoose.connect('mongodb://localhost:27017/github-scoreboard');

        // Check if any PRs were added during the backfill window
        const backfillStart = new Date('2025-10-18T15:14:21Z');
        const backfillEnd = new Date('2025-10-18T16:45:00Z'); // Approximate end

        console.log('🔍 Checking for Cron Job Interference\n');
        console.log(`Backfill window: ${backfillStart.toLocaleString()} to ${backfillEnd.toLocaleString()}\n`);

        const targetUsers = [
            'davidhollenberger',
            'cklineFL',
            'github-actions[bot]',
            'JasonBuckner',
            'jeffboehlke',
            'hal9000jw'
        ];

        let totalCronPRs = 0;

        for (const username of targetUsers) {
            const contributor = await Contributor.findOne({ username })
                .select('username processedPRs');

            if (!contributor || !contributor.processedPRs) continue;

            // Find PRs processed during backfill window
            const cronPRs = contributor.processedPRs.filter(p => {
                const processedDate = new Date(p.processedDate);
                return processedDate >= backfillStart && processedDate <= backfillEnd;
            });

            if (cronPRs.length > 0) {
                console.log(`\n📊 ${username}:`);
                console.log(`   PRs processed during backfill: ${cronPRs.length}`);

                // Check if these are recent PRs (from Oct 17-18)
                const recentPRs = cronPRs.filter(p => p.prNumber >= 9100);
                const olderPRs = cronPRs.filter(p => p.prNumber < 9100);

                if (recentPRs.length > 0) {
                    console.log(`   ✅ Recent PRs (likely from cron): ${recentPRs.length}`);
                    console.log(`      PR numbers: ${recentPRs.map(p => `#${p.prNumber}`).slice(0, 5).join(', ')}`);
                }

                if (olderPRs.length > 0) {
                    console.log(`   📦 Historical PRs (from backfill): ${olderPRs.length}`);
                }

                totalCronPRs += recentPRs.length;
            }
        }

        console.log(`\n\n📊 Summary:`);
        console.log(`   Total recent PRs added by cron during backfill: ${totalCronPRs}`);

        if (totalCronPRs > 0) {
            console.log(`\n💡 Explanation:`);
            console.log(`   The hourly cron job ran during the backfill and added ${totalCronPRs} recent PRs.`);
            console.log(`   These are LEGITIMATE new PRs, not duplicates.`);
            console.log(`   The "missing" PRs are actually these recent additions!\n`);
        }

        // Now check for truly missing PRs (in contributions but not in processedPRs)
        console.log('\n🔍 Checking for truly missing PRs (old data):\n');

        for (const username of targetUsers) {
            const contributor = await Contributor.findOne({ username })
                .select('username prCount contributions processedPRs');

            if (!contributor) continue;

            const prCount = contributor.prCount || 0;
            const processedCount = contributor.processedPRs?.length || 0;
            const diff = prCount - processedCount;

            if (diff > 0) {
                // Check if contributions array has non-merged entries
                const contributionsCount = contributor.contributions?.length || 0;
                const mergedCount = contributor.contributions?.filter(c => c.merged === true).length || 0;

                console.log(`${username}:`);
                console.log(`   prCount: ${prCount}`);
                console.log(`   processedPRs: ${processedCount}`);
                console.log(`   contributions total: ${contributionsCount}`);
                console.log(`   contributions merged: ${mergedCount}`);

                if (prCount !== mergedCount) {
                    console.log(`   ⚠️  prCount (${prCount}) != merged contributions (${mergedCount})`);
                    console.log(`   This suggests ${prCount - mergedCount} PRs were counted but not marked merged\n`);
                } else if (contributionsCount > mergedCount) {
                    console.log(`   ℹ️  Has ${contributionsCount - mergedCount} non-merged contributions\n`);
                } else {
                    console.log(`   ⚠️  Mystery: ${diff} PRs unaccounted for\n`);
                }
            }
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

checkCronInterference();
