import express from 'express';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import cors from 'cors';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';
import { Server } from 'socket.io';
import contributorRoutes from './routes/contributorRoutes.js';
import healthRoutes from './routes/healthRoutes.js';
import challengeRoutes from './routes/challengeRoutes.js';
import { awardBillsAndVonettesController, fetchPRs, fetchPRsCron, awardContributorBadges, awardContributorBadgesCron } from './controllers/contributorController.js';
import { generateWeeklyChallenges, checkExpiredChallenges } from './services/challengeService.js';
import { errorHandler } from './middleware/errorHandler.js';
import logger from './utils/logger.js';
import session from 'express-session';
import passport from './config/passport.js';
import jwt from 'jsonwebtoken';
import { ensureAuthenticated } from './middleware/ensureAuthenticated.js';
import { socketConfig, SOCKET_EVENTS } from './config/websocket-config.js';
import { setSocketIO } from './utils/socketEmitter.js';
import testRoutes from './routes/testRoutes.js';


dotenv.config();

const app = express();
const port = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.use(errorHandler);

app.use(express.json());

app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "'nonce-lexicostatistics'"],
            imgSrc: ["'self'", "data:", "https://github.com", "https://avatars.githubusercontent.com"],
            connectSrc: ["'self'", "ws://localhost:3000", "wss://localhost:3000"]
        }
    }
}));
app.use(mongoSanitize());
app.use(cors());

app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    if (req.url.includes('github.com')) {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    } else {
        res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    }
    next();
});

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
});
app.use(limiter);

app.use(session({
    secret: process.env.GITHUB_CLIENT_SECRET,
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// Create HTTP server and initialize Socket.IO
const httpServer = createServer(app);
const io = new Server(httpServer, socketConfig);

// Set Socket.IO instance for use in other modules
setSocketIO(io);

// Socket.IO connection handling
io.on(SOCKET_EVENTS.CONNECTION, (socket) => {
    logger.info('Client connected', { socketId: socket.id });

    socket.on(SOCKET_EVENTS.SUBSCRIBE_UPDATES, () => {
        socket.join('scoreboard-updates');
        logger.info('Client subscribed to updates', { socketId: socket.id });
    });

    socket.on(SOCKET_EVENTS.UNSUBSCRIBE_UPDATES, () => {
        socket.leave('scoreboard-updates');
        logger.info('Client unsubscribed from updates', { socketId: socket.id });
    });

    socket.on(SOCKET_EVENTS.DISCONNECT, () => {
        logger.info('Client disconnected', { socketId: socket.id });
    });
});

// Set the view engine to EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Root route to render the index.ejs template
app.get('/', (req, res) => {
    res.render('index');
});

// Route to render the activity.ejs template
app.get('/activity', (req, res) => {
    res.render('activity');
});

// Route to render the charts.ejs template
app.get('/charts', (req, res) => {
    res.render('charts');
});

// Route to render the top-cat.ejs template
app.get('/top-cat', (req, res) => {
    res.render('top-cat');
});

// Routes for GitHub authentication
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email'] }));

app.get('/auth/github/callback',
    passport.authenticate('github', { failureRedirect: '/' }),
    (req, res) => {
        if (!req.user) {
            logger.error('Failed to obtain access token during GitHub OAuth callback');
            return res.redirect('/');
        }
        const token = jwt.sign({ username: req.user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.redirect(`/admin?token=${token}`);
    }
);

// Protect the admin route
app.get('/admin', ensureAuthenticated, (req, res) => {
    res.render('admin', { user: req.user });
});

app.use(express.static('public'));
app.use('/api', contributorRoutes);
app.use('/api', healthRoutes);
app.use('/api/challenges', challengeRoutes);

// Test routes (development only)
if (process.env.NODE_ENV !== 'production') {
    app.use('/api', testRoutes);
    logger.info('Test routes enabled for WebSocket testing');
}

//Schedule tasks to be run on the server
cron.schedule('0 * * * *', async () => {
    logger.info('Running hourly task to fetch PRs and reviews');
    try {
        //await fetchPRsCron();
        logger.info('Data fetched successfully');
    } catch (error) {
        logger.error('Error fetching data', { error: error.message });
    }
});

cron.schedule('0 * * * *', async () => {
    logger.info('Running hourly task to award badges');
    try {
        //await awardContributorBadgesCron();
        logger.info('Badges awarded successfully');
    } catch (error) {
        logger.error('Error awarding badges', { error: error.message });
    }
});

cron.schedule('0 0 * * *', async () => {
    logger.info('Running daily task to award Bills and Vonettes');
    try {
        //await awardBillsAndVonettes();
        logger.info('Bills and Vonettes awarded successfully');
    } catch (error) {
        logger.error('Error awarding Bills and Vonettes', { error: error.message });
    }
});

// Gamification Cron Jobs

// Generate new challenges every Monday at midnight
cron.schedule('0 0 * * 1', async () => {
    logger.info('Running weekly task to generate challenges');
    try {
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
        const count = await checkExpiredChallenges();
        logger.info('Expired challenges checked', { updatedCount: count });
    } catch (error) {
        logger.error('Error checking expired challenges', { error: error.message });
    }
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});

httpServer.listen(port, () => {
    logger.info('GitHub PR Scoreboard app started', {
        port,
        environment: process.env.NODE_ENV || 'development',
        url: `http://localhost:${port}`,
        websocket: 'enabled'
    });
});