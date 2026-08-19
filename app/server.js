import express from 'express';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';
import cron from 'node-cron';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import contributorRoutes from './routes/contributorRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import challengeRoutes from './routes/challengeRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';
import { fetchPRsCron, awardContributorBadgesCron } from './controllers/contributorController.js';
import { generateWeeklyChallenges, checkExpiredChallenges } from './services/challengeService.js';
import { checkAndResetIfNewQuarter } from './services/quarterlyService.js';
import { verifyStreaks } from './services/streakService.js';
import { syncDevOpsTeamFromGitHub } from './services/devOpsTeamService.js';
import { errorHandler } from './middleware/errorHandler.js';
import logger from './utils/logger.js';
import session from 'express-session';
import passport from './config/passport.js';
import { ensureDevOpsTeamMember } from './middleware/ensureDevOpsTeamMember.js';
import { ensureRepositoryAccess } from './middleware/ensureRepositoryAccess.js';
import { socketConfig, SOCKET_EVENTS } from './config/websocket-config.js';
import { setSocketIO } from './utils/socketEmitter.js';
import testRoutes from './routes/testRoutes.js';
import { ensureAppSettingsTable, getCronEnabled } from './lib/appSettings.js';
import { mountMcp } from './mcp/index.js';
import { drain, pendingCount } from './lib/inFlightWork.js';
import { prisma } from './lib/prisma.js';


dotenv.config();

const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Store raw body for webhook signature verification
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

// Generate a fresh, unguessable CSP nonce per request. Exposed to templates as
// `nonce` (via res.locals) and consumed by the helmet scriptSrc directive below.
app.use((req, res, next) => {
    res.locals.nonce = crypto.randomBytes(16).toString('base64');
    next();
});

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "https://cdn.socket.io", (req, res) => `'nonce-${res.locals.nonce}'`],
            imgSrc: ["'self'", "data:", "https://github.com", "https://avatars.githubusercontent.com"],
            // 'self' covers same-origin ws/wss for Socket.IO in any deployment
            connectSrc: ["'self'", "https://cdn.jsdelivr.net"]
        }
    }
}));
// Restrict CORS to known origins. The UI is served same-origin, so cross-origin
// access is only the configured deployment origin(s); CORS_ORIGINS is a
// comma-separated allowlist, defaulting to BASE_URL (or localhost in dev).
const allowedOrigins = (process.env.CORS_ORIGINS || process.env.BASE_URL || 'http://localhost:3000')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
app.use(cors({ origin: allowedOrigins, credentials: true }));

// Only enable COEP/COOP when needed (e.g., production or explicitly enabled)
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_COEP === 'true') {
    app.use((req, res, next) => {
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        // CORP applies to our resources; using conservative default
        if (req.url.includes('github.com')) {
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        } else {
            res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
        }
        next();
    });
}

// Rate limiting - environment-aware configuration
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.NODE_ENV === 'production' ? 500 : 10000, // 10k for dev, 500 for prod
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
    // GitHub delivers every hook from a small IP pool, so a busy day can exhaust one
    // shared per-IP budget. GitHub does not retry a 429, so the events are simply
    // lost. The endpoint authenticates by HMAC signature, not by rate.
    skip: (req) => req.path.startsWith('/api/webhooks/')
});
app.use(limiter);

// Behind the ALB in production, trust the proxy so secure cookies are set
// correctly (TLS is terminated at the load balancer).
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Falling back to the OAuth client secret couples two trust domains: rotating the
// OAuth app would silently invalidate every session, and exposure of either secret
// would compromise both. Refuse to boot instead of doing that quietly.
if (!process.env.SESSION_SECRET) {
    if (process.env.NODE_ENV === 'production') {
        throw new Error('SESSION_SECRET is required in production');
    }
    logger.warn('SESSION_SECRET is not set; using an insecure development secret');
}

const sessionMiddleware = session({
    secret: process.env.SESSION_SECRET || 'insecure-development-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        // Without a maxAge the cookie is a session cookie the server can never expire,
        // and MemoryStore never evicts it.
        maxAge: 12 * 60 * 60 * 1000
    }
});

app.use(sessionMiddleware);

app.use(passport.initialize());
app.use(passport.session());

// Create HTTP server and initialize Socket.IO
const httpServer = createServer(app);
const io = new Server(httpServer, socketConfig);

// Set Socket.IO instance for use in other modules
setSocketIO(io);

// The socket streams the same org-gated data as the pages, so the handshake carries
// the same requirement. Reusing the Express session middleware gives the handshake
// access to the passport user without a second auth mechanism.
io.engine.use(sessionMiddleware);
io.use((socket, next) => {
    if (process.env.NODE_ENV === 'test') return next();
    if (socket.request.session?.passport?.user) return next();
    logger.warn('Rejected unauthenticated socket handshake', { socketId: socket.id });
    return next(new Error('Authentication required'));
});

// Socket.IO connection handling
io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
    logger.info('Client connected', { socketId: socket.id });

    socket.on(SOCKET_EVENTS.SUBSCRIBE_UPDATES, () => {
        socket.join('game-ops-updates');
        logger.info('Client subscribed to updates', { socketId: socket.id });
    });

    socket.on(SOCKET_EVENTS.UNSUBSCRIBE_UPDATES, () => {
        socket.leave('game-ops-updates');
        logger.info('Client unsubscribed from updates', { socketId: socket.id });
    });

    socket.on(SOCKET_EVENTS.DISCONNECT, () => {
        logger.info('Client disconnected', { socketId: socket.id });
    });
});

// Set the view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Root route - redirect to leaderboard
app.get('/', (req, res) => {
    res.redirect('/leaderboard');
});

// Route to render the leaderboard.ejs template (new home page)
// Requires repository access (any org member or collaborator)
app.get('/leaderboard', ensureRepositoryAccess, (req, res) => {
    res.render('leaderboard', { user: req.user });
});

// Route to render the challenges.ejs template
// Requires repository access (any org member or collaborator)
app.get('/challenges', ensureRepositoryAccess, (req, res) => {
    res.render('challenges', { user: req.user });
});

// Route to render individual profile pages
// Requires repository access (any org member or collaborator)
app.get('/profile/:username', ensureRepositoryAccess, async (req, res) => {
    try {
        const { username } = req.params;

        // Import contributorService
        const { getContributorByUsername } = await import('./services/contributorService.js');
        const contributor = await getContributorByUsername(username);

        if (!contributor) {
            return res.status(404).render('error', {
                errorCode: 404,
                errorMessage: 'Contributor Not Found',
                errorDescription: `The contributor "${username}" could not be found in our database.`
            });
        }

        res.render('profile', { contributor });
    } catch (error) {
        logger.error('Error loading profile page', { error: error.message, username: req.params.username });
        res.status(500).render('error', {
            errorCode: 500,
            errorMessage: 'Server Error',
            errorDescription: 'An error occurred while loading the profile page. Please try again later.'
        });
    }
});

// Data views — require repository access (any org member or collaborator)
app.get('/activity', ensureRepositoryAccess, (req, res) => {
    res.render('activity');
});

app.get('/charts', ensureRepositoryAccess, (req, res) => {
    res.render('charts');
});

app.get('/analytics', ensureRepositoryAccess, (req, res) => {
    res.render('analytics');
});

// Routes for GitHub authentication
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));

// Without this there is no server-side way to end a session: the cookie stays valid
// until it expires, and with MemoryStore the only other way to clear one is a restart.
app.post('/logout', (req, res, next) => {
    req.logout((err) => {
        if (err) return next(err);
        req.session.destroy((destroyErr) => {
            if (destroyErr) return next(destroyErr);
            res.clearCookie('connect.sid');
            res.json({ success: true });
        });
    });
});

app.get('/auth/github/callback',
    // keepSessionInfo preserves req.session.returnTo across passport 0.6.0's
    // login session regeneration; without it deep links fall back to /leaderboard.
    passport.authenticate('github', { failureRedirect: '/', keepSessionInfo: true }),
    (req, res) => {
        if (!req.user) {
            logger.error('Failed to obtain access token during GitHub OAuth callback');
            return res.redirect('/');
        }

        // Authentication is carried by the httpOnly session cookie established by
        // passport above. We do NOT mint a JWT into the redirect URL — that leaked
        // the token via browser history, Referer headers, and proxy logs.
        const returnTo = req.session.returnTo || '/leaderboard';
        delete req.session.returnTo; // Clear the stored URL
        res.redirect(returnTo);
    }
);

// Protect admin routes - more specific routes first
app.get('/admin/challenges', ensureDevOpsTeamMember, (req, res) => {
    res.render('challenge-management', { user: req.user });
});

app.get('/admin', ensureDevOpsTeamMember, (req, res) => {
    res.render('admin', { user: req.user });
});

app.use(express.static('public'));
// Public by necessity: the ALB and Datadog probe these, and GitHub webhooks
// authenticate by HMAC signature rather than by session.
app.use('/api', healthRoutes);
app.use('/api/webhooks', webhookRoutes);

// Everything else under /api serves exactly the data the org-gated pages render, so
// it carries the same guard. ensureRepositoryAccess answers /api/* with 401 JSON
// instead of an OAuth redirect.
app.use('/api', ensureRepositoryAccess, contributorRoutes);
app.use('/api/challenges', ensureRepositoryAccess, challengeRoutes);
app.use('/api/analytics', ensureRepositoryAccess, analyticsRoutes);

// Test routes (development only)
if (process.env.NODE_ENV !== 'production') {
    app.use('/api', testRoutes);
    logger.info('Test routes enabled for WebSocket testing');
}

// MCP server (/mcp) — gated by the same GitHub DevOps-team auth as admin.
mountMcp(app);

// Error-handling middleware must be registered AFTER all routes so it can
// catch errors thrown by them.
app.use(errorHandler);

//Schedule tasks to be run on the server
async function shouldRunCron(taskName) {
    try {
        // Check global toggle first
        const globalEnabled = await getCronEnabled();
        if (!globalEnabled) {
            logger.info(`Cron globally disabled; skipping task: ${taskName}`);
            return false;
        }
        // Check per-task toggle
        const { isTaskEnabled } = await import('./lib/appSettings.js');
        const taskEnabled = await isTaskEnabled(taskName);
        if (!taskEnabled) {
            logger.info(`Task "${taskName}" disabled; skipping`);
            return false;
        }
        return true;
    } catch (e) {
        logger.warn(`Cron status check failed for ${taskName}: ${e.message}. Defaulting to disabled.`);
        return false;
    }
}

// Ensure settings table exists early
ensureAppSettingsTable()
    .then(async () => {
        const enabled = await getCronEnabled();
        logger.info(`Cron system initialized. Enabled: ${enabled ? 'YES' : 'NO (default)'}`);
    })
    .catch(err => {
        logger.error('Failed to initialize app settings table', { error: err.message });
    });

// Catch-up fetch every 6 hours (webhooks handle real-time updates)
cron.schedule('0 */6 * * *', async () => {
    logger.info('Running 6-hour catch-up fetch for PRs and reviews');
    try {
        if (!(await shouldRunCron('prReviewSync'))) return;
        const result = await fetchPRsCron();
        logger.info('Catch-up fetch completed', { result });
    } catch (error) {
        logger.error('Error in catch-up fetch', { error: error.message });
    }
});

cron.schedule('0 */6 * * *', async () => {
    logger.info('Running 6-hour task to award badges');
    try {
        if (!(await shouldRunCron('badgeAwards'))) return;
        const result = await awardContributorBadgesCron();
        logger.info('Badges awarded successfully', { badgesCount: result?.length || 0 });
    } catch (error) {
        logger.error('Error awarding badges', { error: error.message });
    }
});

// Bills/Vonettes are now awarded quarterly (at quarter boundary via checkAndResetIfNewQuarter)
// The old daily bill cron job has been removed.

// Gamification Cron Jobs

// Generate new challenges every Monday at midnight
cron.schedule('0 0 * * 1', async () => {
    logger.info('Running weekly task to generate challenges');
    try {
        if (!(await shouldRunCron('challengeGen'))) return;
        const challenges = await generateWeeklyChallenges();
        logger.info('Weekly challenges generated', { count: challenges.length });
    } catch (error) {
        logger.error('Error generating weekly challenges', { error: error.message });
    }
});

// Check expired challenges daily at midnight
cron.schedule('0 0 * * *', async () => {
    logger.info('Running daily task to check expired challenges');
    try {
        if (!(await shouldRunCron('challengeExpiry'))) return;
        const count = await checkExpiredChallenges();
        logger.info('Expired challenges checked', { updatedCount: count });
    } catch (error) {
        logger.error('Error checking expired challenges', { error: error.message });
    }
});

// Check and reset quarterly stats daily at midnight
cron.schedule('0 0 * * *', async () => {
    logger.info('Running daily task to check quarterly reset');
    try {
        if (!(await shouldRunCron('quarterCheck'))) return;
        const result = await checkAndResetIfNewQuarter();
        if (result.quarterChanged) {
            logger.info('Quarterly stats reset completed', {
                oldQuarter: result.oldQuarter,
                newQuarter: result.newQuarter,
                winnersArchived: result.winnersArchived
            });
        } else {
            logger.info('No quarterly reset needed');
        }
    } catch (error) {
        logger.error('Error checking quarterly reset', { error: error.message });
    }
});

// Break stale streaks daily at midnight (idle contributors don't break otherwise)
cron.schedule('0 0 * * *', async () => {
    logger.info('Running daily task to verify streaks');
    try {
        if (!(await shouldRunCron('streakCheck'))) return;
        const result = await verifyStreaks();
        logger.info('Streak verification done', { checked: result.checked, broken: result.broken });
    } catch (error) {
        logger.error('Error verifying streaks', { error: error.message });
    }
});

// Sync DevOps team from GitHub daily at 2 AM UTC
cron.schedule('0 2 * * *', async () => {
    logger.info('Running daily task to sync DevOps team from GitHub');
    try {
        if (!(await shouldRunCron('devOpsSync'))) return;
        const result = await syncDevOpsTeamFromGitHub(false);
        if (result.success) {
            logger.info('DevOps team synced from GitHub', {
                totalMembers: result.totalMembers,
                addedMembers: result.addedMembers?.length || 0,
                removedMembers: result.removedMembers?.length || 0
            });
        } else {
            logger.info('DevOps team sync skipped', { reason: result.message });
        }
    } catch (error) {
        logger.error('Error syncing DevOps team from GitHub', { error: error.message });
    }
});

// Graceful shutdown handling
// "Gracefully" was only a log line: process.exit(0) killed the process immediately,
// including any webhook whose points and claim writes were still in flight. GitHub has
// already received a 200 for those deliveries and will not send them again, so the work
// was simply lost. Stop taking new connections, let the outstanding work settle, close
// the database cleanly, then exit.
let shuttingDown = false;
const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`${signal} received, shutting down gracefully`, { pending: pendingCount() });

    httpServer.close(() => logger.info('Stopped accepting new connections'));

    const { drained, remaining } = await drain(8000);
    if (!drained) logger.warn('Exiting with work unfinished', { remaining });

    try {
        await prisma.$disconnect();
    } catch (err) {
        logger.error('Error disconnecting Prisma during shutdown', { error: err.message });
    }

    process.exit(0);
};

process.on('SIGTERM', () => { shutdown('SIGTERM'); });
process.on('SIGINT', () => { shutdown('SIGINT'); });

httpServer.listen(port, () => {
    logger.info('Game Ops app started', {
        port,
        environment: process.env.NODE_ENV || 'development',
        url: `http://localhost:${port}`,
        websocket: 'enabled'
    });
});
