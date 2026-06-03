// Game Ops MCP server — exposes the leaderboard / contributor / challenge data
// and a few admin actions as MCP tools over a remote streamable-HTTP endpoint
// (/mcp), gated by the same GitHub DevOps-team auth as the admin pages.
//
// Stateless transport: each POST builds a fresh server + transport, so there is
// no session state to leak between callers. Mutating tools accept `dry_run`
// (default true) and always echo it back, mirroring the ticketmd MCP.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';

import {
    getTopContributors, getTopReviewers, getContributorByUsername,
    getPRRangeInfo, checkForDuplicates, fetchPullRequests, awardBadges
} from '../services/contributorService.js';
import {
    getQuarterConfig, getCurrentQuarter, getQuarterDateRange, updateQuarterConfig,
    getQuarterlyLeaderboard, getAllTimeLeaderboard, getHallOfFame
} from '../services/quarterlyService.js';
import {
    getActiveChallenges, getAllChallenges, getChallengeById, getChallengeLeaderboard,
    createChallenge, generateWeeklyChallenges
} from '../services/challengeService.js';
import { getStreakLeaderboard, getStreakStats } from '../services/streakService.js';
import {
    syncDevOpsTeamFromGitHub, getDevOpsTeamSettings, getContributorCounts,
    toggleDevOpsLeaderboardFilter
} from '../services/devOpsTeamService.js';
import { ensureDevOpsTeamMember } from '../middleware/ensureDevOpsTeamMember.js';
import logger from '../utils/logger.js';

const SERVER_NAME = 'game-ops';
const SERVER_VERSION = '1.0.0';

function ok(data) {
    return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}
function fail(message) {
    return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: message }, null, 2) }] };
}
// Wrap a tool handler so thrown errors become a structured tool error, not a 500.
function guard(fn) {
    return async (args) => {
        try { return await fn(args || {}); }
        catch (err) { logger.error('MCP tool error', { error: err.message }); return fail(err.message); }
    };
}

/**
 * Build a fresh MCP server with all tools registered.
 * @param {string} actor - the authenticated username (recorded on mutations)
 */
export function buildMcpServer(actor) {
    const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

    // ---- read tools --------------------------------------------------------
    server.tool('get_leaderboard',
        'Get a leaderboard. view: all_time|points (lifetime points), quarterly (current quarter), streaks, contributors (by PRs), reviewers (by reviews).',
        { view: z.enum(['all_time', 'points', 'quarterly', 'streaks', 'contributors', 'reviewers']).default('all_time'), limit: z.number().int().min(1).max(100).default(20) },
        guard(async ({ view, limit }) => {
            let rows;
            if (view === 'all_time' || view === 'points') rows = await getAllTimeLeaderboard(limit);
            else if (view === 'quarterly') rows = await getQuarterlyLeaderboard(null, limit);
            else if (view === 'streaks') rows = await getStreakLeaderboard(limit);
            else if (view === 'contributors') rows = await getTopContributors({ limit });
            else rows = await getTopReviewers({ limit });
            return ok({ view, count: Array.isArray(rows) ? rows.length : undefined, leaderboard: rows });
        }));

    server.tool('get_contributor',
        'Get a single contributor: profile, points, badges and streak stats.',
        { username: z.string().min(1) },
        guard(async ({ username }) => {
            const contributor = await getContributorByUsername(username);
            if (!contributor) return fail(`Contributor not found: ${username}`);
            let streak = null;
            try { streak = await getStreakStats(username); } catch (e) { /* optional */ }
            return ok({ contributor, streak });
        }));

    server.tool('get_challenges',
        'List challenges. status: active (default) or all.',
        { status: z.enum(['active', 'all']).default('active') },
        guard(async ({ status }) => {
            const challenges = status === 'all' ? await getAllChallenges() : await getActiveChallenges();
            return ok({ status, count: Array.isArray(challenges) ? challenges.length : undefined, challenges });
        }));

    server.tool('get_challenge',
        'Get one challenge by id, with its leaderboard.',
        { id: z.string().min(1) },
        guard(async ({ id }) => {
            const challenge = await getChallengeById(id);
            if (!challenge) return fail(`Challenge not found: ${id}`);
            let leaderboard = null;
            try { leaderboard = await getChallengeLeaderboard(id); } catch (e) { /* optional */ }
            return ok({ challenge, leaderboard });
        }));

    server.tool('get_hall_of_fame',
        'Past quarterly winners and top-3 (Hall of Fame).',
        { limit: z.number().int().min(1).max(100).default(20) },
        guard(async ({ limit }) => ok({ hallOfFame: await getHallOfFame(limit) })));

    server.tool('get_quarter_info',
        'Current quarter, its date range, and the quarter configuration.',
        {},
        guard(async () => {
            const config = await getQuarterConfig();
            const current = await getCurrentQuarter();
            let range = null;
            try { range = await getQuarterDateRange(current); } catch (e) { /* optional */ }
            return ok({ currentQuarter: current, dateRange: range, config });
        }));

    server.tool('get_data_overview',
        'PR fetch range / database stats and a duplicate-data summary.',
        {},
        guard(async () => {
            const range = await getPRRangeInfo();
            let duplicates = null;
            try { const d = await checkForDuplicates(); duplicates = { hasDuplicates: d.hasDuplicates, duplicateCount: d.duplicateCount, summary: d.summary }; }
            catch (e) { /* optional */ }
            return ok({ range, duplicates });
        }));

    server.tool('get_devops_team',
        'DevOps team filter settings and contributor counts (total / devops / non-devops).',
        {},
        guard(async () => ok({ settings: await getDevOpsTeamSettings(), counts: await getContributorCounts() })));

    // ---- action tools (mutating; dry_run defaults true) --------------------
    server.tool('trigger_pr_fetch',
        'Run the merged-PR + review catch-up fetch from GitHub (the cron job, on demand).',
        { dry_run: z.boolean().default(true) },
        guard(async ({ dry_run }) => {
            if (dry_run) return ok({ dry_run: true, would: 'fetch merged PRs and reviews from GitHub and update contributor stats' });
            const result = await fetchPullRequests();
            return ok({ dry_run: false, actor, result: result ?? 'ok' });
        }));

    server.tool('award_badges',
        'Award milestone badges. Optionally scope to one username.',
        { username: z.string().optional(), dry_run: z.boolean().default(true) },
        guard(async ({ username, dry_run }) => {
            if (dry_run) return ok({ dry_run: true, would: `award badges${username ? ' for ' + username : ' for all contributors'}` });
            const result = await awardBadges(null, username || null);
            return ok({ dry_run: false, actor, result: result ?? 'ok' });
        }));

    server.tool('sync_devops_team',
        'Sync DevOps team members from the GitHub Teams API (force refresh).',
        { dry_run: z.boolean().default(true) },
        guard(async ({ dry_run }) => {
            if (dry_run) return ok({ dry_run: true, would: 'force-sync the DevOps team membership from GitHub' });
            const result = await syncDevOpsTeamFromGitHub(true);
            return ok({ dry_run: false, actor, result });
        }));

    server.tool('generate_weekly_challenges',
        'Generate the weekly auto challenges (the Monday cron job, on demand).',
        { dry_run: z.boolean().default(true) },
        guard(async ({ dry_run }) => {
            if (dry_run) return ok({ dry_run: true, would: 'generate the 3 weekly auto challenges' });
            const result = await generateWeeklyChallenges();
            return ok({ dry_run: false, actor, result });
        }));

    server.tool('create_challenge',
        'Create a challenge. type: pr-merge|review|streak|points. difficulty: easy|medium|hard.',
        {
            title: z.string().min(1), description: z.string().default(''),
            type: z.enum(['pr-merge', 'review', 'streak', 'points']),
            target: z.number().int().min(1), reward: z.number().int().min(0).default(100),
            difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
            durationDays: z.number().int().min(1).max(90).default(7),
            dry_run: z.boolean().default(true)
        },
        guard(async ({ title, description, type, target, reward, difficulty, durationDays, dry_run }) => {
            const startDate = new Date();
            const endDate = new Date(startDate.getTime() + durationDays * 86400000);
            const data = { title, description, type, target, reward, difficulty, status: 'active', startDate, endDate };
            if (dry_run) return ok({ dry_run: true, would: 'create challenge', challenge: data });
            const challenge = await createChallenge(data);
            return ok({ dry_run: false, actor, challenge });
        }));

    server.tool('set_quarter_config',
        'Set the quarter calculation system. systemType: calendar|fiscal-us|academic|custom. q1StartMonth: 1-12.',
        {
            systemType: z.enum(['calendar', 'fiscal-us', 'academic', 'custom']),
            q1StartMonth: z.number().int().min(1).max(12).default(1),
            dry_run: z.boolean().default(true)
        },
        guard(async ({ systemType, q1StartMonth, dry_run }) => {
            if (dry_run) return ok({ dry_run: true, would: 'update quarter config', systemType, q1StartMonth, note: 'changing the quarter may trigger a reset' });
            const result = await updateQuarterConfig(systemType, q1StartMonth, actor || 'mcp');
            return ok({ dry_run: false, actor, result });
        }));

    server.tool('set_devops_filter',
        'Enable/disable excluding DevOps team members from the leaderboards.',
        { exclude: z.boolean(), dry_run: z.boolean().default(true) },
        guard(async ({ exclude, dry_run }) => {
            if (dry_run) return ok({ dry_run: true, would: `${exclude ? 'exclude' : 'include'} DevOps members on leaderboards` });
            const result = await toggleDevOpsLeaderboardFilter(exclude);
            return ok({ dry_run: false, actor, result });
        }));

    return server;
}

/**
 * Mount the MCP endpoint on the Express app at /mcp, behind the admin GitHub auth.
 * Stateless streamable-HTTP: POST carries JSON-RPC; GET/DELETE are not used.
 */
export function mountMcp(app) {
    app.post('/mcp', ensureDevOpsTeamMember, async (req, res) => {
        const server = buildMcpServer(req.user && req.user.username);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        res.on('close', () => { transport.close(); server.close(); });
        try {
            await server.connect(transport);
            await transport.handleRequest(req, res, req.body);
        } catch (err) {
            logger.error('MCP request error', { error: err.message });
            if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
        }
    });
    const methodNotAllowed = (req, res) => res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed (stateless server: use POST)' }, id: null });
    app.get('/mcp', ensureDevOpsTeamMember, methodNotAllowed);
    app.delete('/mcp', ensureDevOpsTeamMember, methodNotAllowed);
    logger.info('MCP server mounted at /mcp');
}
