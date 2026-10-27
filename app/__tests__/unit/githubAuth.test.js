import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { generateKeyPairSync } from 'crypto';
import express from 'express';
import request from 'supertest';
import nock from 'nock';
import { createOctokit, getGitHubAuthMode, getGitHubToken } from '../../lib/githubAuth.js';
import healthRoutes from '../../routes/healthRoutes.js';
import logger from '../../utils/logger.js';

// GitHub's "Generate a private key" download is PKCS#1 ("BEGIN RSA PRIVATE KEY"), so the
// tests sign with that shape rather than the PKCS#8 Node would default to.
const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' }
});

const AUTH_VARS = ['GITHUB_TOKEN', 'GITHUB_APP_ID', 'GITHUB_APP_PRIVATE_KEY', 'GITHUB_APP_INSTALLATION_ID'];
const APP_ID = '12345';
let savedEnv;

// Each test that mints a token uses its own installation id: getGitHubToken() keeps one
// cached auth per config, and a token cached by an earlier test would hide a missed call.
function configureApp({ installationId, key = privateKey }) {
    process.env.GITHUB_APP_ID = APP_ID;
    process.env.GITHUB_APP_PRIVATE_KEY = key;
    process.env.GITHUB_APP_INSTALLATION_ID = installationId;
}

function jwtPayload(authorizationHeader) {
    const jwt = authorizationHeader.replace(/^bearer /i, '');
    return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
}

function mintInstallationToken(installationId, token) {
    let seenAuthorization;
    const scope = nock('https://api.github.com')
        .post(`/app/installations/${installationId}/access_tokens`)
        .reply(function () {
            seenAuthorization = this.req.headers.authorization;
            return [201, {
                token,
                expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                permissions: { metadata: 'read' },
                repository_selection: 'selected'
            }];
        });
    return { scope, authorization: () => seenAuthorization };
}

const RATE_LIMIT_BODY = {
    resources: {},
    rate: { limit: 5000, remaining: 4999, reset: Math.floor(Date.now() / 1000) + 3600, used: 1 }
};

describe('githubAuth', () => {
    beforeEach(() => {
        savedEnv = Object.fromEntries(AUTH_VARS.map((name) => [name, process.env[name]]));
        AUTH_VARS.forEach((name) => delete process.env[name]);
    });

    afterEach(() => {
        AUTH_VARS.forEach((name) => {
            if (savedEnv[name] === undefined) delete process.env[name];
            else process.env[name] = savedEnv[name];
        });
        nock.cleanAll();
    });

    describe('getGitHubAuthMode', () => {
        it('should be none when no credentials are set', async () => {
            expect(getGitHubAuthMode()).toBe('none');
            await expect(getGitHubToken()).resolves.toBeNull();
        });

        it('should use the personal token when only GITHUB_TOKEN is set', async () => {
            process.env.GITHUB_TOKEN = 'ghp_personal';
            expect(getGitHubAuthMode()).toBe('token');
            await expect(getGitHubToken()).resolves.toBe('ghp_personal');
        });

        it('should prefer the app when all app variables and GITHUB_TOKEN are set', () => {
            process.env.GITHUB_TOKEN = 'ghp_personal';
            configureApp({ installationId: '100' });
            expect(getGitHubAuthMode()).toBe('app');
        });

        it('should fall back to GITHUB_TOKEN and warn once when the app is partly configured', () => {
            const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
            process.env.GITHUB_TOKEN = 'ghp_personal';
            process.env.GITHUB_APP_ID = APP_ID;
            process.env.GITHUB_APP_INSTALLATION_ID = '101';

            expect(getGitHubAuthMode()).toBe('token');
            expect(getGitHubAuthMode()).toBe('token');

            expect(warn).toHaveBeenCalledTimes(1);
            expect(warn).toHaveBeenCalledWith(
                expect.stringContaining('partly configured'),
                { missing: ['GITHUB_APP_PRIVATE_KEY'] }
            );
        });
    });

    describe('getGitHubToken in app mode', () => {
        it('should mint an installation token signed as the app and reuse it from cache', async () => {
            configureApp({ installationId: '200' });
            const mint = mintInstallationToken('200', 'ghs_minted');

            await expect(getGitHubToken()).resolves.toBe('ghs_minted');
            // A second request to the interceptor would fail with "No match", so this
            // only passes if the token was served from cache.
            await expect(getGitHubToken()).resolves.toBe('ghs_minted');

            expect(mint.scope.isDone()).toBe(true);
            expect(String(jwtPayload(mint.authorization()).iss)).toBe(APP_ID);
        });

        it('should accept a private key stored on one line with escaped newlines', async () => {
            configureApp({ installationId: '201', key: privateKey.replace(/\n/g, '\\n') });
            const mint = mintInstallationToken('201', 'ghs_escaped');

            await expect(getGitHubToken()).resolves.toBe('ghs_escaped');
            expect(mint.scope.isDone()).toBe(true);
        });

        it('should throw when GitHub refuses to mint a token', async () => {
            configureApp({ installationId: '202' });
            nock('https://api.github.com')
                .post('/app/installations/202/access_tokens')
                .reply(401, { message: 'Bad credentials' });

            await expect(getGitHubToken()).rejects.toThrow();
        });
    });

    describe('createOctokit', () => {
        it('should send the personal token in token mode', async () => {
            process.env.GITHUB_TOKEN = 'ghp_personal';
            const scope = nock('https://api.github.com')
                .get('/rate_limit')
                .matchHeader('authorization', 'token ghp_personal')
                .reply(200, RATE_LIMIT_BODY);

            const { data } = await createOctokit().rest.rateLimit.get();

            expect(data.rate.limit).toBe(5000);
            expect(scope.isDone()).toBe(true);
        });

        it('should send a minted installation token in app mode', async () => {
            configureApp({ installationId: '300' });
            const mint = mintInstallationToken('300', 'ghs_octokit');
            const api = nock('https://api.github.com')
                .get('/rate_limit')
                .matchHeader('authorization', 'token ghs_octokit')
                .reply(200, RATE_LIMIT_BODY);

            await createOctokit().rest.rateLimit.get();

            expect(mint.scope.isDone()).toBe(true);
            expect(api.isDone()).toBe(true);
        });
    });

    describe('GET /api/health github check', () => {
        const app = express();
        app.use('/api', healthRoutes);

        // Order matters: the route caches a healthy GitHub answer for a minute, and the
        // not-configured branch is checked before that cache is read.
        it('should report not_configured when no credentials are set', async () => {
            const res = await request(app).get('/api/health');
            expect(res.body.checks.github.status).toBe('not_configured');
        });

        it('should report which credentials it used', async () => {
            process.env.GITHUB_TOKEN = 'ghp_personal';
            nock('https://api.github.com').get('/rate_limit').reply(200, RATE_LIMIT_BODY);

            const res = await request(app).get('/api/health');

            expect(res.body.checks.github).toMatchObject({ status: 'healthy', auth: 'token', limit: 5000 });
        });
    });
});
