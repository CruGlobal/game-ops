import express from 'express';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import cors from 'cors';
import cron from 'node-cron';
import contributorRoutes from './routes/contributorRoutes.js';
import { awardBillsAndVonettesController, fetchPRs, fetchReviewsData, awardContributorBadges } from './controllers/contributorController.js';
import { errorHandler } from './middleware/errorHandler.js';


dotenv.config();

const app = express();
const port = 3000;

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
    max: 100,
});
app.use(limiter);

app.use(express.static('public'));
app.use('/api', contributorRoutes);

// Schedule tasks to be run on the server
cron.schedule('0 * * * *', async () => {
    console.log('Running a task every hour to fetch PRs and reviews');
    try {
        await fetchPRs();
        await fetchReviewsData();
        console.log('Data fetched successfully');
    } catch (error) {
        console.error('Error fetching data:', error);
    }
});

//cron.schedule('0 0 * * *', async () => {
//    console.log('Running a task daily to award badges');
//    try {
//        await awardContributorBadges();
//        console.log('Badges awarded successfully');
//    } catch (error) {
//        console.error('Error awarding badges:', error);
//    }
//});

//cron.schedule('0 0 * * *', async () => {
//    console.log('Running a task daily to award Bills and Vonettes');
//    try {
//        await awardBillsAndVonettes();
//        console.log('Bills and Vonettes awarded successfully');
//    } catch (error) {
//        console.error('Error awarding Bills and Vonettes:', error);
//    }
//});

app.listen(port, () => {
    console.log(`GitHub PR Scoreboard app listening on http://localhost:${port}`);
});