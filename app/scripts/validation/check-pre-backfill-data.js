import mongoose from 'mongoose';
import Contributor from '../../models/contributor.js';

async function checkPreBackfillData() {
    try {
        await mongoose.connect('mongodb://localhost:27017/github-scoreboard');

        const backfillStart = new Date('2025-10-18T15:14:21Z');

        console.log('🔍 Checking for Data Added BEFORE Backfill Started\n');
        console.log(`Backfill started: ${backfillStart.toLocaleString()}\n`);

        const targetUsers = [
            'davidhollenberger',
            'cklineFL',
            'github-actions[bot]',
            'JasonBuckner',
            'jeffboehlke',
            'hal9000jw'
        ];

        for (const username of targetUsers) {
            const contributor = await Contributor.findOne({ username })
                .select('username processedPRs contributions');

            if (!contributor) continue;

            // Check processedPRs for entries before backfill
            const preBacks = contributor.processedPRs?.filter(p => {
                return new Date(p.processedDate) < backfillStart;
            }) || [];

            // Check contributions for entries before backfill (using merged date if available)
            const preContribs = contributor.contributions?.filter(c => {
                return new Date(c.date) < backfillStart;
            }) || [];

            if (preBacks.length > 0 || preContribs.length > 0) {
                console.log(`📊 ${username}:`);

                if (preBacks.length > 0) {
                    console.log(`   ⚠️  ${preBacks.length} PRs in processedPRs BEFORE backfill!`);
                    console.log(`      Oldest: ${new Date(preBacks[0].processedDate).toLocaleString()}`);
                    console.log(`      Sample PR numbers: ${preBacks.slice(0, 3).map(p => `#${p.prNumber}`).join(', ')}`);
                }

                if (preContribs.length > 0) {
                    console.log(`   ℹ️  ${preContribs.length} contributions dated before backfill`);
                    console.log(`      (This is normal - contributions use PR merge date, not processing date)`);
                }
                console.log('');
            }
        }

        // Count all PRs added before backfill across all contributors
        const allContributors = await Contributor.find({}).select('processedPRs');

        let totalPreBackfill = 0;
        for (const c of allContributors) {
            const preCount = c.processedPRs?.filter(p =>
                new Date(p.processedDate) < backfillStart
            ).length || 0;
            totalPreBackfill += preCount;
        }

        console.log(`\n📊 Total PRs in processedPRs BEFORE backfill: ${totalPreBackfill}`);

        if (totalPreBackfill === 10) {
            console.log('\n✅ This matches the 10 missing PRs!');
            console.log('\n💡 Conclusion:');
            console.log('The 10 PRs were added BEFORE the backfill started (likely from');
            console.log('the earlier Sept/Aug backfill attempts or hourly cron runs).');
            console.log('The database was not fully cleared, or new PRs were added');
            console.log('between the clear and backfill start.');
        } else if (totalPreBackfill > 0) {
            console.log(`\n⚠️  Found ${totalPreBackfill} pre-backfill PRs.`);
        } else {
            console.log('\n✅ No pre-backfill PRs found. The mystery continues...');
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

checkPreBackfillData();
