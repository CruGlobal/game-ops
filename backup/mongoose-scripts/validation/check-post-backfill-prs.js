import mongoose from 'mongoose';
import Contributor from '../../models/contributor.js';

async function checkPostBackfillPRs() {
    try {
        await mongoose.connect('mongodb://localhost:27017/github-scoreboard');
        console.log('✅ Connected to MongoDB\n');

        // Backfill completed around Oct 18, 2025 at 16:45 (15:14 start + 6060s duration)
        const backfillEnd = new Date('2025-10-18T16:45:00Z');

        console.log(`🔍 Checking for PRs added AFTER backfill completion (${backfillEnd.toISOString()})\n`);
        console.log('='.repeat(80));

        const contributors = await Contributor.find({})
            .select('username prCount processedPRs')
            .lean();

        let totalPostBackfillPRs = 0;
        const postBackfillDetails = [];

        for (const contributor of contributors) {
            const postBackfillPRs = contributor.processedPRs?.filter(p => {
                const processedDate = new Date(p.processedDate);
                return processedDate > backfillEnd;
            }) || [];

            if (postBackfillPRs.length > 0) {
                totalPostBackfillPRs += postBackfillPRs.length;

                postBackfillDetails.push({
                    username: contributor.username,
                    count: postBackfillPRs.length,
                    prs: postBackfillPRs.sort((a, b) =>
                        new Date(b.processedDate) - new Date(a.processedDate)
                    )
                });
            }
        }

        console.log(`\n📊 SUMMARY:`);
        console.log(`   Total PRs added AFTER backfill: ${totalPostBackfillPRs}`);
        console.log(`   Contributors affected: ${postBackfillDetails.length}`);
        console.log('');

        if (postBackfillDetails.length > 0) {
            console.log('\n📋 DETAILS BY CONTRIBUTOR:\n');

            // Sort by count descending
            postBackfillDetails.sort((a, b) => b.count - a.count);

            for (const detail of postBackfillDetails) {
                console.log(`👤 ${detail.username} (+${detail.count} PRs)`);

                // Show first 5 PRs
                const samplesToShow = detail.prs.slice(0, 5);
                for (const pr of samplesToShow) {
                    const date = new Date(pr.processedDate);
                    console.log(`   • PR #${pr.prNumber}: ${pr.prTitle}`);
                    console.log(`     Added: ${date.toLocaleString()}`);
                    console.log(`     Action: ${pr.action}`);
                }

                if (detail.prs.length > 5) {
                    console.log(`   ... and ${detail.prs.length - 5} more`);
                }
                console.log('');
            }

            // Check for potential duplicates (same PR number, different timestamps)
            console.log('\n🔍 CHECKING FOR DUPLICATES IN POST-BACKFILL PRs:\n');

            for (const detail of postBackfillDetails) {
                const prNumbers = detail.prs.map(p => p.prNumber);
                const uniquePRNumbers = new Set(prNumbers);

                if (prNumbers.length !== uniquePRNumbers.size) {
                    console.log(`⚠️  ${detail.username} has duplicate PR numbers in post-backfill data!`);

                    // Find which PR numbers are duplicated
                    const counts = {};
                    for (const num of prNumbers) {
                        counts[num] = (counts[num] || 0) + 1;
                    }

                    for (const [prNum, count] of Object.entries(counts)) {
                        if (count > 1) {
                            console.log(`   PR #${prNum} appears ${count} times`);
                        }
                    }
                }
            }

            // Check time distribution
            console.log('\n⏰ TIME DISTRIBUTION OF POST-BACKFILL PRs:\n');

            const allPostBackfillPRs = postBackfillDetails.flatMap(d => d.prs);
            const hourCounts = {};

            for (const pr of allPostBackfillPRs) {
                const date = new Date(pr.processedDate);
                const hourKey = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:00`;
                hourCounts[hourKey] = (hourCounts[hourKey] || 0) + 1;
            }

            const sortedHours = Object.entries(hourCounts).sort((a, b) => a[0].localeCompare(b[0]));
            for (const [hour, count] of sortedHours) {
                console.log(`   ${hour} - ${count} PRs added`);
            }
        }

        await mongoose.disconnect();
        console.log('\n✅ Investigation complete');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

checkPostBackfillPRs();
