import { Octokit } from '@octokit/rest';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../../.env') });

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const repoOwner = process.env.REPO_OWNER.replace(/"/g, '');
const repoName = process.env.REPO_NAME.replace(/"/g, '');

async function getRepoInfo() {
    try {
        const { data: repo } = await octokit.repos.get({
            owner: repoOwner,
            repo: repoName
        });

        console.log(`📁 Repository: ${repo.full_name}\n`);
        console.log(`📅 Created: ${new Date(repo.created_at).toLocaleDateString()}`);
        console.log(`📅 Last Updated: ${new Date(repo.updated_at).toLocaleDateString()}\n`);

        // Get first and last PR
        const { data: oldestPRs } = await octokit.pulls.list({
            owner: repoOwner,
            repo: repoName,
            state: 'all',
            sort: 'created',
            direction: 'asc',
            per_page: 1
        });

        const { data: newestPRs } = await octokit.pulls.list({
            owner: repoOwner,
            repo: repoName,
            state: 'all',
            sort: 'created',
            direction: 'desc',
            per_page: 1
        });

        if (oldestPRs.length > 0) {
            console.log(`🔹 First PR: #${oldestPRs[0].number} - ${new Date(oldestPRs[0].created_at).toLocaleDateString()}`);
        }

        if (newestPRs.length > 0) {
            console.log(`🔹 Latest PR: #${newestPRs[0].number} - ${new Date(newestPRs[0].created_at).toLocaleDateString()}`);
        }

        console.log(`\n💡 Recommended backfill start date: ${new Date(oldestPRs[0]?.created_at || repo.created_at).toISOString().split('T')[0]}`);
        console.log(`💡 Recommended backfill end date: ${new Date().toISOString().split('T')[0]}\n`);

    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

getRepoInfo();
