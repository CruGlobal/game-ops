import express from 'express';
import { Octokit } from '@octokit/rest';
import mongoose from 'mongoose';
import cron from 'node-cron';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import fetch from 'node-fetch';
import cors from 'cors'; // Import the cors package

// Load environment variables from .env file
dotenv.config();

const app = express();
const port = 3000;

// Security middleware
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

// Enable CORS
app.use(cors());

// Set COEP headers
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

// Rate limiting middleware
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Serve static files from the "public" directory
app.use(express.static('public'));

// MongoDB schema setup
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/github-scoreboard';
mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
}).catch(err => {
    console.error('Error connecting to MongoDB', err);
    process.exit(1);
});

const ContributorSchema = new mongoose.Schema({
    username: { type: String, required: true },
    prCount: { type: Number, default: 0 },
    reviewCount: { type: Number, default: 0 },
    avatarUrl: { type: String },
    lastUpdated: { type: Date, default: Date.now },
});

const Contributor = mongoose.model('Contributor', ContributorSchema);

// GitHub Octokit setup
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
    request: {
        fetch: fetch
    }
});

const repoOwner = process.env.REPO_OWNER;
const repoName = process.env.REPO_NAME;

// Helper functions
async function updateContributor(username, type) {
    if (!['prCount', 'reviewCount'].includes(type)) {
        throw new Error('Invalid type');
    }
    const { data: userData } = await octokit.rest.users.getByUsername({
            username: username
    });

    let contributor = await Contributor.findOne({ username: mongoSanitize.sanitize(username) });
    if (!contributor) {
        contributor = new Contributor({ username, avatarUrl: userData.avatar_url });
    }
    contributor[type] += 1;
    contributor.avatarUrl = userData.avatar_url;
    contributor.lastUpdated = Date.now();
    await contributor.save();
}

async function fetchPullRequests() {
    try {
        const { data: pullRequests } = await octokit.rest.pulls.list({
            owner: repoOwner,
            repo: repoName,
            state: 'all',
            per_page: 100,
        });

        for (const pr of pullRequests) {
            await updateContributor(pr.user.login, 'prCount');
            if (pr.reviews) {
                for (const review of pr.reviews) {
                    await updateContributor(review.user.login, 'reviewCount');
                }
            }
        }
    } catch (err) {
        console.error('Error fetching pull requests', err);
    }
}

async function awardBadges() {
    try {
        const contributors = await Contributor.find();
        for (const contributor of contributors) {
            if (contributor.prCount >= 20) {
                await octokit.rest.issues.createComment({
                    owner: repoOwner,
                    repo: repoName,
                    issue_number: contributor.lastPR,
                    body: `🎉 Congratulations @${contributor.username}, you've earned a badge for 20 PRs! 🎉`,
                });

                // Reset count after awarding badge
                contributor.prCount = 0;
                await contributor.save();
            }
        }
    } catch (err) {
        console.error('Error awarding badges', err);
    }
}

// Schedule tasks
cron.schedule('0 0 * * *', async () => {
    await fetchPullRequests();
    await awardBadges();
});

// Endpoints
app.get('/top-contributors', async (req, res) => {
    try {
        const contributors = await Contributor.find().sort({ prCount: -1 }).limit(10).select('username prCount avatarUrl');
        res.json(contributors);
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/top-reviewers', async (req, res) => {
    try {
        const reviewers = await Contributor.find().sort({ reviewCount: -1 }).limit(10).select('username reviewCount avatarUrl');
        res.json(reviewers);
    } catch (err) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.get('/fetch-pull-requests', async (req, res) => {
    try {
        await fetchPullRequests();
        res.status(200).send('Pull requests fetched and data updated.');
    } catch (err) {
        res.status(500).send('Error fetching pull requests.');
    }
});

app.listen(port, () => {
    console.log(`GitHub PR Scoreboard app listening on http://localhost:${port}`);
});