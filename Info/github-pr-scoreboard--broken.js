import express from 'express';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import cors from 'cors';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import contributorRoutes from './routes/contributorRoutes.js';
import { awardBillsAndVonettesController, fetchPRs, fetchReviewsData, awardContributorBadges } from './controllers/contributorController.js';
import { errorHandler } from './middleware/errorHandler.js';
import session from 'express-session';
import passport from './config/passport.js';
import jwt from 'jsonwebtoken';
import { ensureAuthenticated } from './middleware/ensureAuthenticated.js';

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
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https://github.com", "https://avatars.githubusercontent.com"]
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

// Routes for GitHub authentication
app.get('/auth/github', passport.authenticate('github', { scope: ['user:email','read:org'] }));

app.get('/auth/github/callback',
    passport.authenticate('github', { failureRedirect: '/' }),
    (req, res) => {
        if (!req.user) {
            console.error('Failed to obtain access token');
            return res.redirect('/');
        }
        const token = jwt.sign({ username: req.user.username }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.redirect(`/admin?token=${token}`);
    }
);

// Protect the admin route
app.get('/admin', ensureAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.use(express.static('public'));
app.use('/api', contributorRoutes);

const scheduleTask = (cronTime, taskName, taskFunction) => {
    cron.schedule(cronTime, async () => {
        console.log(`Running a task ${taskName}`);
        try {
            await taskFunction();
            console.log(`${taskName} completed successfully`);
        } catch (error) {
            console.error(`Error during ${taskName}:`, error);
        }
    });
};

// Schedule tasks to be run on the server
scheduleTask('0 * * * *', 'every hour to fetch PRs and reviews', async () => {
    await fetchPRs();
    await fetchReviewsData();
});

scheduleTask('0 * * * *', 'every hour to award badges', awardContributorBadges);

scheduleTask('0 * * * *', 'every hour to award Bills and Vonettes', awardBillsAndVonettesController);

// Route to manually trigger database initialization
app.get('/initialize-database', async (req, res) => {
    try {
        await initializeDatabase();
        res.status(200).send('Database initialized successfully');
    } catch (err) {
        res.status(500).send('Error initializing database');
    }
});

app.listen(port, () => {
    console.log(`GitHub PR Scoreboard app listening on http://localhost:${port}`);
});