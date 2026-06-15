import { Octokit } from '@octokit/rest';
import fetch from 'node-fetch';
import logger from '../utils/logger.js';

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
            const noreply = email.match(NOREPLY_RE);
            if (noreply) return noreply[1];
            if (emailToLogin.has(email)) return emailToLogin.get(email);
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
