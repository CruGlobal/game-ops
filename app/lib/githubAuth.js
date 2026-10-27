// app/lib/githubAuth.js
// Single source of GitHub credentials for every server-side call (Octokit REST, GraphQL
// and raw fetch).
//
// Two modes, picked from the environment on every call:
// - 'app': GITHUB_APP_ID + GITHUB_APP_PRIVATE_KEY + GITHUB_APP_INSTALLATION_ID are all
//   set. Calls run as the CruGlobal-owned GitHub App installation, so nothing depends on
//   one person's account. Installation tokens expire after an hour; @octokit/auth-app
//   mints and caches them, which is why callers ask for a token per request instead of
//   reading one string at module load.
//   The app needs: repository Metadata, Contents and Pull requests (read), Discussions
//   (read and write, for the announcement posts); organization Members (read).
// - 'token': falls back to GITHUB_TOKEN (a personal access token), the original setup.
//
// Setting only some of the app variables is treated as a mistake, not as app mode: it
// logs a warning and keeps using GITHUB_TOKEN so a half-finished rollout cannot break
// ingestion or sign-in checks.

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
 * Which credentials GitHub calls will use: 'app', 'token' or 'none'.
 */
export function getGitHubAuthMode() {
    const present = APP_VARS.filter((name) => process.env[name]);
    if (present.length === APP_VARS.length) return 'app';

    if (present.length > 0 && !warnedPartialConfig) {
        warnedPartialConfig = true;
        const missing = APP_VARS.filter((name) => !process.env[name]);
        logger.warn('GitHub App auth is partly configured; falling back to GITHUB_TOKEN', { missing });
    }

    return process.env.GITHUB_TOKEN ? 'token' : 'none';
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
