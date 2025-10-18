import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Contributor from '../../models/contributor.js';

dotenv.config();

async function verifyData() {
    const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/github-scoreboard';
    await mongoose.connect(mongoUri);

    console.log('Checking September 2025 data...\n');

    const contributors = await Contributor.find({}).select('username contributions').lean();

    let septemberPRs = 0;
    const septemberContributors = [];

    contributors.forEach(c => {
        if (c.contributions) {
            const septPRs = c.contributions.filter(contrib => {
                const date = new Date(contrib.date);
                return date.getMonth() === 8 && date.getFullYear() === 2025; // September = month 8
            });

            if (septPRs.length > 0) {
                septemberPRs += septPRs.length;
                septemberContributors.push({
                    username: c.username,
                    prs: septPRs.length
                });
            }
        }
    });

    console.log('✅ September 2025 Data Summary:');
    console.log(`   Total PRs: ${septemberPRs}`);
    console.log(`   Contributors with September PRs: ${septemberContributors.length}\n`);

    if (septemberContributors.length > 0) {
        console.log('Top 10 September Contributors:');
        septemberContributors
            .sort((a, b) => b.prs - a.prs)
            .slice(0, 10)
            .forEach((c, i) => {
                console.log(`   ${i + 1}. ${c.username}: ${c.prs} PRs`);
            });
    } else {
        console.log('⚠️  No September data found - backfill may not have completed yet');
    }

    console.log('\n📊 Full Date Distribution:');
    console.log(`   Aug 2025: ${contributors.reduce((sum, c) => sum + (c.contributions?.filter(co => new Date(co.date).getMonth() === 7 && new Date(co.date).getFullYear() === 2025).length || 0), 0)} PRs`);
    console.log(`   Sep 2025: ${septemberPRs} PRs`);
    console.log(`   Oct 2025: ${contributors.reduce((sum, c) => sum + (c.contributions?.filter(co => new Date(co.date).getMonth() === 9 && new Date(co.date).getFullYear() === 2025).length || 0), 0)} PRs`);

    await mongoose.disconnect();
    process.exit(0);
}

verifyData().catch(e => {
    console.error('Error:', e);
    process.exit(1);
});
