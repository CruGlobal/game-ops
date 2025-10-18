import mongoose from 'mongoose';
import Contributor from '../../models/contributor.js';

async function checkDuplicates() {
    try {
        await mongoose.connect('mongodb://localhost:27017/github-scoreboard');

        const contributors = await Contributor.find({}).select('username prCount processedPRs');

        let totalMismatch = 0;
        let contributorsWithMismatch = [];

        for (const contributor of contributors) {
            const prCount = contributor.prCount || 0;
            const processedCount = contributor.processedPRs?.length || 0;

            if (prCount !== processedCount) {
                totalMismatch += Math.abs(prCount - processedCount);
                contributorsWithMismatch.push({
                    username: contributor.username,
                    prCount,
                    processedCount,
                    diff: prCount - processedCount
                });
            }
        }

        console.log(`🔍 Duplicate Check:\n`);
        console.log(`   Contributors checked: ${contributors.length}`);
        console.log(`   Contributors with mismatch: ${contributorsWithMismatch.length}`);
        console.log(`   Total mismatch: ${totalMismatch}\n`);

        if (contributorsWithMismatch.length > 0) {
            console.log(`⚠️  Mismatches found:\n`);
            contributorsWithMismatch.slice(0, 10).forEach(c => {
                console.log(`   ${c.username}: prCount=${c.prCount}, tracked=${c.processedCount}, diff=${c.diff}`);
            });
        } else {
            console.log(`✅ No mismatches - all PRs properly tracked!`);
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

checkDuplicates();
