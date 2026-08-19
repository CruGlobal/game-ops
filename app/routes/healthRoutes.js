import express from 'express';
import { Octokit } from '@octokit/rest';
import logger from '../utils/logger.js';
// The shared client, not a second `new PrismaClient()`. Instantiating another one here
// opened a second connection pool against the same database purely to answer health
// probes.
import { prisma } from '../lib/prisma.js';

const router = express.Router();

// The health endpoint is polled continuously (a 15s monitor is ~240 hits/hour). Asking
// GitHub for the rate limit on every hit spends the shared token's budget to report on
// itself, so the answer is cached briefly.
const GITHUB_HEALTH_TTL_MS = 60 * 1000;
let githubHealthCache = { checkedAt: 0, value: null };

// Health check endpoint
router.get('/health', async (req, res) => {
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: process.env.npm_package_version || '1.0.0',
        environment: process.env.NODE_ENV || 'development',
        checks: {}
    };

    try {
        // Database health check
        try {
            await prisma.$queryRaw`SELECT 1`;
            health.checks.database = {
                status: 'healthy',
                state: 'connected'
            };
        } catch (dbError) {
            // /api/health is deliberately public for the ALB and Datadog, so the raw
            // driver message (which carries host, database and query detail) must not
            // travel with the response. Log it instead.
            logger.error('Health check: database unreachable', { error: dbError.message });
            health.checks.database = {
                status: 'unhealthy',
                state: 'disconnected',
                ...(process.env.NODE_ENV === 'production' ? {} : { error: dbError.message })
            };
        }

        // GitHub API health check
        if (process.env.GITHUB_TOKEN) {
            if (githubHealthCache.value && Date.now() - githubHealthCache.checkedAt < GITHUB_HEALTH_TTL_MS) {
                health.checks.github = { ...githubHealthCache.value, cached: true };
            } else {
                try {
                    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
                    const rateLimit = await octokit.rateLimit.get();
                    githubHealthCache = {
                        checkedAt: Date.now(),
                        value: {
                            status: 'healthy',
                            remaining: rateLimit.data.rate.remaining,
                            limit: rateLimit.data.rate.limit,
                            reset: new Date(rateLimit.data.rate.reset * 1000).toISOString()
                        }
                    };
                    health.checks.github = githubHealthCache.value;
                } catch (error) {
                    logger.error('Health check: GitHub API unreachable', { error: error.message });
                    // Not cached: a failure should be retried on the next probe rather
                    // than pinned as unhealthy for a minute.
                    health.checks.github = {
                        status: 'unhealthy',
                        ...(process.env.NODE_ENV === 'production' ? {} : { error: error.message })
                    };
                }
            }
        } else {
            health.checks.github = {
                status: 'not_configured',
                message: 'GitHub token not provided'
            };
        }

        // Overall health status
        const allHealthy = Object.values(health.checks).every(
            check => check.status === 'healthy' || check.status === 'not_configured'
        );
        
        if (!allHealthy) {
            health.status = 'degraded';
        }

        const statusCode = health.status === 'ok' ? 200 : 503;
        res.status(statusCode).json(health);

    } catch (error) {
        logger.error('Health check failed', { error: error.message });
        res.status(503).json({
            status: 'error',
            timestamp: new Date().toISOString(),
            error: error.message
        });
    }
});

// Readiness probe (for Kubernetes)
router.get('/ready', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        res.status(200).json({ status: 'ready' });
    } catch (error) {
        res.status(503).json({ status: 'not_ready', error: error.message });
    }
});

// Liveness probe (for Kubernetes)
router.get('/live', (req, res) => {
    res.status(200).json({ status: 'alive', uptime: process.uptime() });
});

// ALB health check endpoint (CruGlobal standard)
router.get('/monitors/lb', (req, res) => {
    res.status(200).json({
        status: 'ok',
        service: 'game-ops',
        timestamp: new Date().toISOString()
    });
});

export default router;