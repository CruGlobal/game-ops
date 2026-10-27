// app/lib/githubAuth.js
// Single source of GitHub credentials for every server-side call (Octokit REST, GraphQL
// and raw fetch).
//
// Two modes, read from the environment when an Octokit client is built (the services build
// theirs at module load, so a change needs a restart) and on every getGitHubToken() call:
// - 'app': GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY + GITHUB_APP_INSTALLATION_ID are all
//   set. Calls run as the CruGlobal-owned GitHub App installation, so nothing depends on
//   one person's account. Installation tokens expire after an hour; @octokit/auth-app
//   mints and caches them, which is why callers ask for a token per request instead of
//   reading one string at module load.
//   The app must be installed on the REPO_OWNER/REPO_NAME repository and needs:
//   repository Metadata, Contents and Pull requests (read), Discussions (read and write,
//   for the announcement posts); organization Members (read).
// - 'token': falls back to GITHUB_TOKEN (a personal access token), the original setup.
//
// Setting only some of the app variables is treated as a mistake, not as app mode: it
// logs a warning and keeps using GITHUB_TOKEN when that is still set, so a half-finished
// rollout cannot break ingestion or sign-in checks. /api/health reports it as
// 'misconfigured' either way, so it cannot pass for healthy.

import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import logger from '../utils/logger.js';

const APP_VARS = ['GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_APP_INSTALLATION_ID'];

let warnedPartialConfig = false;

// Shared by getGitHubToken() so raw fetch callers reuse one installation-token cache.
// Keyed on the config so a changed environment (tests, key rotation in a REPL) is not
// served a token minted for the old app.
let sharedAppAuth = { key: null, auth: null };

/**
 * The GitHub App variables that are missing when at least one is set. Empty when the app
 * is fully configured or not configured at all.
 */
export function getMissingGitHubAppVars() {
    const missing = APP_VARS.filter((name) => !process.env[name]);
    return missing.length === APP_VARS.length ? [] : missing;
}

/**
 * Which credentials GitHub calls will use: 'app', 'token' or 'none'.
 */
export function getGitHubAuthMode() {
    const missing = getMissingGitHubAppVars();
    if (missing.length === 0 && process.env.GITHUB_APP_ID) return 'app';

    const mode = process.env.GITHUB_TOKEN ? 'token' : 'none';
    if (missing.length > 0 && !warnedPartialConfig) {
        warnedPartialConfig = true;
        logger.warn(mode === 'token'
            ? 'GitHub App auth is partly configured; using GITHUB_TOKEN instead'
            : 'GitHub App auth is partly configured and GITHUB_TOKEN is not set; GitHub calls will fail',
        { missing });
    }
    return mode;
}

function appAuthOptions() {
    return {
        appId: process.env.GITHUB_APP_ID,
        // Either GitHub's PKCS#1 download or PKCS#8, with real or "\n"-escaped line
        // breaks: universal-github-app-jwt converts and unescapes it.
        privateKey: process.env.GITHUB_APP_PRIVATE_KEY,
        installationId: process.env.GITHUB_APP_INSTALLATION_ID
    };
}

/**
 * Build an Octokit client authenticated with the current mode. Extra Octokit options
 * (request.fetch, userAgent, ...) pass straight through.
 */
export function createOctokit(options = {}) {
    if (getGitHubAuthMode() === 'app') {
        return new Octokit({ ...options, authStrategy: createAppAuth, auth: appAuthOptions() });
    }
    return new Octokit({ ...options, auth: process.env.GITHUB_TOKEN });
}

/**
 * A bearer token for code that calls the GitHub API without Octokit. Returns null when
 * no credentials are configured. In app mode this may make a network call to mint an
 * installation token, and it throws if GitHub refuses (bad key, app uninstalled).
 */
export async function getGitHubToken() {
    const mode = getGitHubAuthMode();
    if (mode === 'token') return process.env.GITHUB_TOKEN;
    if (mode === 'none') return null;

    const options = appAuthOptions();
    const key = `${options.appId}:${options.installationId}:${options.privateKey}`;
    if (sharedAppAuth.key !== key) {
        sharedAppAuth = { key, auth: createAppAuth(options) };
    }
    const { token } = await sharedAppAuth.auth({ type: 'installation' });
    return token;
}
