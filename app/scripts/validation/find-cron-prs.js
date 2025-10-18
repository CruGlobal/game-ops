import mongoose from 'mongoose';
import Contributor from '../../models/contributor.js';

async function findCronPRs() {
    try {
        await mongoose.connect('mongodb://localhost:27017/github-scoreboard');

        // Check for PRs processed exactly at 16:00
        const cronTime = new Date('2025-10-18T16:00:00Z');
        const cronTimeEnd = new Date('2025-10-18T16:00:15Z');

        console.log('🔍 Finding PRs Added by Cron at 16:00\n');

        const contributors = await Contributor.find({}).select('username processedPRs');

        let cronPRs = [];

        for (const contributor of contributors) {
            if (!contributor.processedPRs) continue;

            const prsAt16 = contributor.processedPRs.filter(p => {
                const date = new Date(p.processedDate);
                return date >= cronTime && date <= cronTimeEnd;
            });

            if (prsAt16.length > 0) {
                cronPRs.push({
                    username: contributor.username,
                    count: prsAt16.length,
                    prs: prsAt16
                });
            }
        }

        console.log(`Found ${cronPRs.length} contributors with PRs added at 16:00:\n`);

        let totalPRs = 0;
        for (const { username, count, prs } of cronPRs) {
            totalPRs += count;
            console.log(`${username}: ${count} PRs`);
            prs.slice(0, 3).forEach(pr => {
                console.log(`   - PR #${pr.prNumber}: ${pr.prTitle}`);
                console.log(`     Processed: ${new Date(pr.processedDate).toLocaleString()}`);
            });
            if (count > 3) {
                console.log(`   ... and ${count - 3} more`);
            }
            console.log('');
        }

        console.log(`\n📊 Total PRs added by cron at 16:00: ${totalPRs}\n`);

        if (totalPRs === 10) {
            console.log('✅ This matches the 10 missing PRs!');
            console.log('\n💡 Conclusion:');
            console.log('The 10 "missing" PRs were added by the hourly cron job at 16:00');
            console.log('while the backfill was paused for rate limiting.');
            console.log('These are LEGITIMATE recent PRs, not duplicates or errors.');
        } else if (totalPRs > 0) {
            console.log(`⚠️  Found ${totalPRs} PRs, but expected 10.`);
            console.log('Some of the missing PRs may have different causes.');
        } else {
            console.log('❌ No PRs found at exactly 16:00.');
            console.log('The missing PRs have a different cause.');
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

findCronPRs();
