import { Octokit } from '@octokit/rest';
import fetch from 'node-fetch';
import logger from '../utils/logger.js';
import { prisma } from '../lib/prisma.js';

const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
    request: { fetch }
});

const repoOwner = process.env.REPO_OWNER;
const repoName = process.env.REPO_NAME;

// Automation accounts that open PRs on behalf of a real contributor. PRs opened
// by these accounts must be reattributed to the human who initiated them (e.g.
// via TerraBloks) instead of awarding points to the bot. Generic [bot] accounts
// (dependabot, github-actions) are intentionally NOT here — they have no human
// initiator and are already filtered from leaderboards.
export const PROXY_BOT_LOGINS = new Set([
    'terrabloks[bot]',
    'cru-devops'
]);

export const isProxyBot = (login) => !!login && PROXY_BOT_LOGINS.has(login);

// GitHub no-reply commit emails encode the login: `<id>+<login>@users.noreply.github.com`
// or the older `<login>@users.noreply.github.com`.
const NOREPLY_RE = /^(?:\d+\+)?([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)@users\.noreply\.github\.com$/i;

/**
 * Pull the real contributor's GitHub login out of a PR's commits.
 *
 * The chosen signal is the `Co-authored-by:` trailer TerraBloks stamps on its
 * bot commit — that names the person who initiated the PR. Commits are scanned
 * in order, so the first co-author found wins. A no-reply email yields the login
 * directly; a plain email is mapped to a login via the commit-author objects
 * GitHub already resolved on the PR.
 *
 * Pure (no network) so it can be unit-tested. `commits` is the array returned by
 * octokit.rest.pulls.listCommits.
 *
 * @param {Array} commits - GitHub commit objects
 * @returns {string|null} the real contributor's login, or null if none found
 */
export const extractRealAuthorFromCommits = (commits = []) => {
    // email (lowercased) -> login, from commits GitHub mapped to an account.
    const emailToLogin = new Map();
    for (const c of commits) {
        const email = c?.commit?.author?.email?.toLowerCase();
        const login = c?.author?.login;
        if (email && login) emailToLogin.set(email, login);
    }

    const coAuthorRe = /^Co-authored-by:\s*[^<]*<([^>]+)>/gim;

    for (const c of commits) {
        const message = c?.commit?.message || '';
        let match;
        while ((match = coAuthorRe.exec(message)) !== null) {
            const email = match[1].trim().toLowerCase();
            // Prefer the login GitHub itself resolved for this email: it carries the
            // account's real casing. GitHub lowercases the no-reply local part, so
            // parsing it out is only a fallback.
            if (emailToLogin.has(email)) return emailToLogin.get(email);
            const noreply = email.match(NOREPLY_RE);
            if (noreply) return noreply[1];
        }
    }

    return null;
};

/**
 * Resolve the real contributor for a proxy-bot PR by fetching its commits.
 *
 * @param {number} prNumber
 * @returns {Promise<string|null>} the real contributor's login, or null
 */
export const resolveProxyAuthor = async (prNumber) => {
    let commits;
    try {
        const { data } = await octokit.rest.pulls.listCommits({
            owner: repoOwner,
            repo: repoName,
            pull_number: prNumber,
            per_page: 100
        });
        commits = data;
    } catch (err) {
        logger.error('Attribution: failed to list commits for proxy-bot PR', {
            prNumber,
            error: err.message
        });
        return null;
    }

    const login = extractRealAuthorFromCommits(commits);
    if (!login) {
        logger.warn('Attribution: no co-author trailer found for proxy-bot PR', { prNumber });
    }
    return login;
};

/**
 * Map a GitHub login onto the spelling this database already stores for that person.
 *
 * GitHub treats logins case-insensitively, but `contributors.username` is a plain
 * unique text column, so `cru-luis-rodriguez` and `cru-Luis-Rodriguez` are two
 * separate rows. Logins recovered from a no-reply email arrive lowercased (GitHub
 * lowercases the local part), which forked those contributors into a second row
 * that restarted its badges from zero and — because the DevOps team sync only ever
 * matches the canonical login — surfaced on the public leaderboard despite
 * `excludeDevOpsFromLeaderboards`.
 *
 * The match is deliberately case-insensitive-oldest-first rather than exact-first:
 * where a fork already exists, exact-first would keep routing to the newer stray
 * row. Oldest wins sends every spelling back to the row holding the history, so an
 * already-split contributor stops drifting further apart before anyone merges the
 * rows. Only case variants collide here; a genuine rename is a different string and
 * is left alone.
 *
 * @param {string} login - a GitHub login in any casing
 * @returns {Promise<string>} the username to key contributor records on
 */
export const resolveContributorUsername = async (login) => {
    if (!login) return login;

    const existing = await prisma.contributor.findFirst({
        where: { username: { equals: login, mode: 'insensitive' } },
        orderBy: { createdAt: 'asc' },
        select: { username: true }
    });
    if (existing) return existing.username;

    // First time we've seen this person: ask GitHub for the canonical casing so the
    // row about to be created is right from the start.
    try {
        const { data } = await octokit.rest.users.getByUsername({ username: login });
        return data?.login || login;
    } catch (err) {
        logger.warn('Attribution: could not resolve canonical casing for login', {
            login,
            error: err.message
        });
        return login;
    }
};
