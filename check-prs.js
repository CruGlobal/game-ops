import { Octokit } from '@octokit/rest';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

console.log('Checking for merged PRs in Q4 2025 (Oct 1 - Dec 31)...');

try {
  const { data: pulls } = await octokit.pulls.list({
    owner: 'CruGlobal',
    repo: 'cru-terraform',
    state: 'closed',
    sort: 'updated',
    direction: 'desc',
    per_page: 50
  });
  
  const q4Start = new Date('2025-10-01T00:00:00Z');
  const q4End = new Date('2025-12-31T23:59:59Z');
  
  const mergedInQ4 = pulls.filter(pr => {
    if (!pr.merged_at) return false;
    const mergedDate = new Date(pr.merged_at);
    return mergedDate >= q4Start && mergedDate <= q4End;
  });
  
  console.log(`Found ${mergedInQ4.length} PRs merged in Q4 2025:`);
  mergedInQ4.forEach(pr => {
    console.log(`  PR #${pr.number}: ${pr.title} by ${pr.user.login} - merged ${pr.merged_at}`);
  });
  
  if (mergedInQ4.length === 0) {
    console.log('\nNo merged PRs found in Q4 2025. Checking recent closed PRs...');
    pulls.slice(0, 10).forEach(pr => {
      console.log(`  PR #${pr.number}: ${pr.state}, merged_at: ${pr.merged_at || 'null'}, updated: ${pr.updated_at}`);
    });
  }
} catch (e) {
  console.error('Error:', e.message);
}