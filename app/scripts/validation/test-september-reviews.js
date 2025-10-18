import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root (one level up from app/)
dotenv.config({ path: join(__dirname, '..', '.env') });

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const repoOwner = process.env.REPO_OWNER.replace(/"/g, '');  // Remove quotes
const repoName = process.env.REPO_NAME.replace(/"/g, '');

console.log(`Using repo: ${repoOwner}/${repoName}\n`);

async function testSeptemberReviews() {
    try {
        console.log('Fetching September 2025 PRs from GitHub...\n');

        const startDate = new Date('2025-09-01T00:00:00Z');
        const endDate = new Date('2025-09-30T23:59:59Z');

        // Fetch PRs
        const { data: prs } = await octokit.pulls.list({
            owner: repoOwner,
            repo: repoName,
            state: 'closed',
            sort: 'updated',
            direction: 'desc',
            per_page: 100,
            page: 1
        });

        const septemberPRs = prs.filter(pr => {
            if (!pr.merged_at) return false;
            const mergedDate = new Date(pr.merged_at);
            return mergedDate >= startDate && mergedDate <= endDate;
        });

        console.log(`Found ${septemberPRs.length} September PRs\n`);

        if (septemberPRs.length === 0) {
            console.log('No September PRs found!');
            return;
        }

        // Check reviews on first 5 PRs
        console.log('Checking reviews on first 5 September PRs:\n');

        for (let i = 0; i < Math.min(5, septemberPRs.length); i++) {
            const pr = septemberPRs[i];

            console.log(`PR #${pr.number} - "${pr.title}"`);
            console.log(`  Merged: ${pr.merged_at}`);
            console.log(`  Author: ${pr.user.login}`);

            try {
                const { data: reviews } = await octokit.pulls.listReviews({
                    owner: repoOwner,
                    repo: repoName,
                    pull_number: pr.number
                });

                console.log(`  Total reviews: ${reviews.length}`);

                if (reviews.length > 0) {
                    const approvedOrCommented = reviews.filter(r =>
                        r.state === 'APPROVED' || r.state === 'COMMENTED'
                    );
                    console.log(`  APPROVED/COMMENTED: ${approvedOrCommented.length}`);

                    reviews.slice(0, 3).forEach(review => {
                        console.log(`    - ${review.user.login}: ${review.state} on ${review.submitted_at}`);
                    });
                } else {
                    console.log(`  ⚠️  No reviews found`);
                }
            } catch (error) {
                console.log(`  ❌ Error fetching reviews: ${error.message}`);
            }

            console.log('');
        }

        // Summary statistics
        let totalReviews = 0;
        let totalApprovedOrCommented = 0;
        let prsWithReviews = 0;

        console.log('Scanning all September PRs for review statistics...\n');

        for (const pr of septemberPRs) {
            try {
                const { data: reviews } = await octokit.pulls.listReviews({
                    owner: repoOwner,
                    repo: repoName,
                    pull_number: pr.number
                });

                if (reviews.length > 0) {
                    prsWithReviews++;
                    totalReviews += reviews.length;
                    const approvedOrCommented = reviews.filter(r =>
                        r.state === 'APPROVED' || r.state === 'COMMENTED'
                    );
                    totalApprovedOrCommented += approvedOrCommented.length;
                }
            } catch (error) {
                console.log(`Error on PR #${pr.number}: ${error.message}`);
            }
        }

        console.log('📊 September Review Statistics:');
        console.log(`   Total PRs: ${septemberPRs.length}`);
        console.log(`   PRs with reviews: ${prsWithReviews}`);
        console.log(`   Total reviews (all states): ${totalReviews}`);
        console.log(`   APPROVED/COMMENTED reviews: ${totalApprovedOrCommented}`);
        console.log(`   Average reviews per PR: ${(totalReviews / septemberPRs.length).toFixed(2)}`);

    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

testSeptemberReviews();
