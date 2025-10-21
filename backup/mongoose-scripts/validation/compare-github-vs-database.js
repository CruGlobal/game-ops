import { Octokit } from '@octokit/rest';
import mongoose from 'mongoose';
import Contributor from '../../models/contributor.js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenv.config({ path: join(__dirname, '../../../.env') });

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const repoOwner = process.env.REPO_OWNER.replace(/"/g, '');
const repoName = process.env.REPO_NAME.replace(/"/g, '');

async function compareGitHubVsDatabase() {
    try {
        console.log(`🔍 Comparing GitHub vs Database for ${repoOwner}/${repoName}\n`);

        // Connect to database
        await mongoose.connect('mongodb://localhost:27017/github-scoreboard');
        console.log('✅ Connected to database\n');

        // Define date ranges to check
        const months = [
            { name: 'August 2025', start: '2025-08-01', end: '2025-08-31' },
            { name: 'September 2025', start: '2025-09-01', end: '2025-09-30' },
            { name: 'October 2025', start: '2025-10-01', end: '2025-10-31' }
        ];

        console.log('📊 Monthly Comparison:\n');
        console.log('Month'.padEnd(20) + 'GitHub PRs'.padEnd(15) + 'Database PRs'.padEnd(15) + 'Difference');
        console.log('-'.repeat(70));

        for (const month of months) {
            const startDate = new Date(month.start);
            const endDate = new Date(month.end);

            // Count from GitHub
            let githubCount = 0;
            let page = 1;
            let hasMore = true;

            console.log(`\n🔄 Fetching ${month.name} from GitHub...`);

            while (hasMore) {
                const { data: prs } = await octokit.pulls.list({
                    owner: repoOwner,
                    repo: repoName,
                    state: 'closed',
                    sort: 'updated',
                    direction: 'desc',
                    per_page: 100,
                    page
                });

                if (prs.length === 0) break;

                const monthPRs = prs.filter(pr => {
                    if (!pr.merged_at) return false;
                    const mergedDate = new Date(pr.merged_at);
                    return mergedDate >= startDate && mergedDate <= endDate;
                });

                githubCount += monthPRs.length;

                // Check if we've gone past the month
                const oldestPR = prs[prs.length - 1];
                if (oldestPR.merged_at && new Date(oldestPR.merged_at) < startDate) {
                    hasMore = false;
                }

                page++;

                // Safety limit
                if (page > 100) {
                    console.log('   ⚠️  Reached page limit (100), stopping scan');
                    break;
                }

                // Progress indicator
                if (page % 5 === 0) {
                    process.stdout.write(`   Scanned ${page * 100} PRs...\r`);
                }
            }

            console.log(`   ✅ GitHub scan complete (${page - 1} pages)          `);

            // Count from Database
            const contributors = await Contributor.find({}).select('contributions').lean();

            let dbCount = 0;
            for (const contributor of contributors) {
                if (contributor.contributions) {
                    const monthContributions = contributor.contributions.filter(contrib => {
                        const date = new Date(contrib.date);
                        return date >= startDate && date <= endDate;
                    });
                    dbCount += monthContributions.length;
                }
            }

            const difference = githubCount - dbCount;
            const diffSymbol = difference > 0 ? '❌' : difference < 0 ? '⚠️' : '✅';

            console.log(
                month.name.padEnd(20) +
                githubCount.toString().padEnd(15) +
                dbCount.toString().padEnd(15) +
                `${diffSymbol} ${difference}`
            );

            if (difference > 0) {
                console.log(`   → Missing ${difference} PRs in database`);
            } else if (difference < 0) {
                console.log(`   → Database has ${Math.abs(difference)} MORE PRs (possible duplicates?)`);
            } else {
                console.log(`   → Perfect match!`);
            }
        }

        console.log('\n' + '-'.repeat(70));
        console.log('\n💡 Interpretation:');
        console.log('   ✅ = Data matches perfectly');
        console.log('   ❌ = Missing PRs (app wasn\'t running during this period)');
        console.log('   ⚠️ = Extra PRs in database (check for duplicates)\n');

        await mongoose.disconnect();
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.status === 404) {
            console.error('\n💡 Tip: Check REPO_OWNER and REPO_NAME in .env file');
        }
        process.exit(1);
    }
}

compareGitHubVsDatabase();
