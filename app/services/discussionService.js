import { prisma } from '../lib/prisma.js';
import logger from '../utils/logger.js';

/**
 * Post quarterly winners announcement as a GitHub Discussion.
 * Checks enableGitHubDiscussions in QuarterSettings; returns early if disabled.
 * Never throws — logs a warning on failure.
 *
 * @param {String} quarterString - e.g. "2025-Q1"
 * @param {Object} billResults - Result from awardQuarterlyBills()
 * @param {Object} quarterlyWinner - QuarterlyWinner record from archiveQuarterWinners()
 */
export async function postQuarterlyWinnersDiscussion(quarterString, billResults, quarterlyWinner) {
    try {
        const settings = await prisma.quarterSettings.findUnique({
            where: { id: 'quarter-config' }
        });

        if (!settings?.enableGitHubDiscussions) {
            logger.debug('GitHub Discussion announcements disabled, skipping');
            return;
        }

        const token = process.env.GITHUB_TOKEN;
        const owner = process.env.REPO_OWNER || process.env.GITHUB_OWNER;
        const repo = process.env.REPO_NAME || process.env.GITHUB_REPO;

        if (!token || !owner || !repo) {
            logger.warn('Cannot post discussion — GITHUB_TOKEN, REPO_OWNER, or REPO_NAME not set');
            return;
        }

        // 1. Get repositoryId
        const repoData = await graphql(token, `
            query($owner: String!, $repo: String!) {
                repository(owner: $owner, name: $repo) {
                    id
                    discussionCategories(first: 10) {
                        nodes { id name }
                    }
                }
            }
        `, { owner, repo });

        const repositoryId = repoData.data?.repository?.id;
        if (!repositoryId) {
            logger.warn('Could not find repository ID — are Discussions enabled on the repo?');
            return;
        }

        // 2. Find "Announcements" category (or first available)
        const categories = repoData.data.repository.discussionCategories?.nodes || [];
        const announcementCat = categories.find(c => c.name === 'Announcements')
            || categories.find(c => c.name === 'General')
            || categories[0];

        if (!announcementCat) {
            logger.warn('No discussion categories found — enable Discussions on the repo first');
            return;
        }

        // 3. Build the discussion body
        const body = buildDiscussionBody(quarterString, billResults, quarterlyWinner);
        const title = `${quarterString} Quarterly Winners`;

        // 4. Create the discussion
        await graphql(token, `
            mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
                createDiscussion(input: {
                    repositoryId: $repositoryId
                    categoryId: $categoryId
                    title: $title
                    body: $body
                }) {
                    discussion { url }
                }
            }
        `, {
            repositoryId,
            categoryId: announcementCat.id,
            title,
            body
        });

        logger.info(`Posted quarterly winners discussion for ${quarterString}`);
    } catch (error) {
        logger.warn('Failed to post quarterly winners discussion', {
            quarter: quarterString,
            error: error.message
        });
    }
}

/**
 * Build the markdown body for the quarterly winners discussion.
 */
function buildDiscussionBody(quarterString, billResults, quarterlyWinner) {
    const winner = quarterlyWinner?.winner || {};
    const top3 = quarterlyWinner?.top3 || [];
    const totalParticipants = quarterlyWinner?.totalParticipants || 0;

    const medals = ['', '🥈', '🥉'];
    const lines = [
        `# ${quarterString} — Quarterly Results`,
        '',
        `## 🏆 Champion`,
        '',
        `**@${winner.username || 'N/A'}** takes the crown with **${winner.pointsThisQuarter || 0} points**!`,
        `- PRs: ${winner.prsThisQuarter || 0}`,
        `- Reviews: ${winner.reviewsThisQuarter || 0}`,
        `- Award: **1 Vonette** (5 Bills)`,
        '',
    ];

    if (top3.length > 1) {
        lines.push('## Podium', '');
        top3.forEach((c, i) => {
            const medal = i === 0 ? '🥇' : medals[i] || '';
            const award = i === 0 ? '1 Vonette' : '1 Bill';
            lines.push(`${medal} **#${c.rank || i + 1} @${c.username}** — ${c.pointsThisQuarter || 0} pts (${award})`);
        });
        lines.push('');
    }

    // DevOps participation
    if (billResults) {
        const devOpsAwarded = billResults.devOpsAwarded || [];
        if (devOpsAwarded.length > 0) {
            lines.push('## DevOps Participation Bills', '');
            devOpsAwarded.forEach(d => {
                lines.push(`- @${d.username}: **1 Bill** (${d.contributions} contributions)`);
            });
            lines.push('');
        }
    }

    lines.push(`---`);
    lines.push(`*${totalParticipants} total contributors this quarter*`);

    return lines.join('\n');
}

/**
 * Post a new-challenge announcement as a GitHub Discussion.
 * Accepts one or more challenges; a multi-challenge array renders as a single
 * batched announcement (used by the weekly cron so Monday doesn't generate 3
 * separate discussions).
 *
 * Checks enableGitHubDiscussions in QuarterSettings; returns early if disabled.
 * Never throws; logs a warning on failure.
 *
 * @param {Array<Object>} challenges - Challenge records from Prisma
 */
export async function postNewChallengesDiscussion(challenges) {
    const list = Array.isArray(challenges) ? challenges.filter(Boolean) : [];
    if (list.length === 0) return;

    try {
        const settings = await prisma.quarterSettings.findUnique({
            where: { id: 'quarter-config' }
        });

        if (!settings?.enableGitHubDiscussions) {
            logger.debug('GitHub Discussion announcements disabled, skipping new-challenge post');
            return;
        }

        const token = process.env.GITHUB_TOKEN;
        const owner = process.env.REPO_OWNER || process.env.GITHUB_OWNER;
        const repo = process.env.REPO_NAME || process.env.GITHUB_REPO;

        if (!token || !owner || !repo) {
            logger.warn('Cannot post new-challenge discussion: GITHUB_TOKEN, REPO_OWNER, or REPO_NAME not set');
            return;
        }

        const repoData = await graphql(token, `
            query($owner: String!, $repo: String!) {
                repository(owner: $owner, name: $repo) {
                    id
                    discussionCategories(first: 10) {
                        nodes { id name }
                    }
                }
            }
        `, { owner, repo });

        const repositoryId = repoData.data?.repository?.id;
        if (!repositoryId) {
            logger.warn('Could not find repository ID for new-challenge discussion');
            return;
        }

        const categories = repoData.data.repository.discussionCategories?.nodes || [];
        const announcementCat = categories.find(c => c.name === 'Announcements')
            || categories.find(c => c.name === 'General')
            || categories[0];

        if (!announcementCat) {
            logger.warn('No discussion categories found for new-challenge post');
            return;
        }

        const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
        const challengesUrl = `${baseUrl.replace(/\/$/, '')}/challenges`;
        const title = list.length === 1
            ? 'A new challenge is live'
            : `${list.length} new challenges are live`;
        const body = buildGenericChallengeBody(list.length, challengesUrl);

        await graphql(token, `
            mutation($repositoryId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
                createDiscussion(input: {
                    repositoryId: $repositoryId
                    categoryId: $categoryId
                    title: $title
                    body: $body
                }) {
                    discussion { url }
                }
            }
        `, {
            repositoryId,
            categoryId: announcementCat.id,
            title,
            body
        });

        logger.info('Posted new-challenge discussion', {
            count: list.length,
            ids: list.map(c => c.id)
        });
    } catch (error) {
        logger.warn('Failed to post new-challenge discussion', {
            count: list.length,
            error: error.message
        });
    }
}

// Intentionally generic: we link to the challenges page rather than inlining
// titles/descriptions/rewards so readers click through to see what's new.
function buildGenericChallengeBody(count, challengesUrl) {
    const headline = count === 1
        ? 'A new challenge was just added.'
        : `${count} new challenges were just added.`;

    return [
        `## 🎯 ${headline}`,
        '',
        `Everyone is auto-enrolled — just contribute as usual and you'll earn points.`,
        '',
        `👉 [See what's new on the challenges page](${challengesUrl})`
    ].join('\n');
}

/**
 * Minimal GraphQL helper using fetch (same pattern as verify-quarter-user.js).
 */
async function graphql(token, query, variables = {}) {
    const response = await fetch('https://api.github.com/graphql', {
        method: 'POST',
        headers: {
            'Authorization': `bearer ${token}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`GitHub GraphQL error ${response.status}: ${text}`);
    }

    const json = await response.json();
    if (json.errors) {
        throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }
    return json;
}
