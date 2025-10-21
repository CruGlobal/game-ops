import express from 'express';
import { PrismaClient } from '@prisma/client';
import { Octokit } from '@octokit/rest';
import logger from '../utils/logger.js';

const router = express.Router();
const prisma = new PrismaClient();

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
            health.checks.database = {
                status: 'unhealthy',
                state: 'disconnected',
                error: dbError.message
            };
        }

        // GitHub API health check
        if (process.env.GITHUB_TOKEN) {
            try {
                const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
                const rateLimit = await octokit.rateLimit.get();
                health.checks.github = {
                    status: 'healthy',
                    remaining: rateLimit.data.rate.remaining,
                    limit: rateLimit.data.rate.limit,
                    reset: new Date(rateLimit.data.rate.reset * 1000).toISOString()
                };
            } catch (error) {
                health.checks.github = {
                    status: 'unhealthy',
                    error: error.message
                };
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

export default router;