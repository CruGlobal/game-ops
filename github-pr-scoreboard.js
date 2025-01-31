import express from 'express';
        import { Octokit } from '@octokit/rest';
        import cron from 'node-cron';
        import dotenv from 'dotenv';
        import rateLimit from 'express-rate-limit';
        import helmet from 'helmet';
        import mongoSanitize from 'express-mongo-sanitize';
        import fetch from 'node-fetch';
        import cors from 'cors';
        import dbClient from './db-config.js';
        import Contributor from './models/contributor.js'; // Only used for MongoDB

        dotenv.config();

        const app = express();
        const port = 3000;

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

        const octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN,
            request: {
                fetch: fetch
            }
        });

        const repoOwner = process.env.REPO_OWNER;
        const repoName = process.env.REPO_NAME;

        async function updateContributor(username, type) {
            if (!['prCount', 'reviewCount'].includes(type)) {
                throw new Error('Invalid type');
            }
            const { data: userData } = await octokit.rest.users.getByUsername({
                username: username
            });

            if (process.env.NODE_ENV === 'production') {
                const params = {
                    TableName: 'Contributors',
                    Key: { username: username },
                    UpdateExpression: `set ${type} = ${type} + :val, avatarUrl = :avatarUrl, lastUpdated = :lastUpdated`,
                    ExpressionAttributeValues: {
                        ':val': 1,
                        ':avatarUrl': userData.avatar_url,
                        ':lastUpdated': new Date().toISOString(),
                    },
                    ReturnValues: 'ALL_NEW'
                };
                await dbClient.update(params).promise();
            } else {
                let contributor = await Contributor.findOne({ username: mongoSanitize.sanitize(username) });
                if (!contributor) {
                    contributor = new Contributor({ username, avatarUrl: userData.avatar_url });
                }
                contributor[type] += 1;
                contributor.avatarUrl = userData.avatar_url;
                contributor.lastUpdated = Date.now();
                await contributor.save();
            }
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

        async function awardBadges(pullRequestNumber = null, test = false) {
            const results = [];
            try {
                let contributors;
                if (process.env.NODE_ENV === 'production') {
                    const params = { TableName: 'Contributors' };
                    const data = await dbClient.scan(params).promise();
                    contributors = data.Items;
                } else {
                    contributors = await Contributor.find();
                }

                for (const contributor of contributors) {
                    if (/\[bot\]$/.test(contributor.username)) {
                        continue;
                    }
                    let badgeAwarded = null;
                    if (test && contributor.username === 'cru-Luis-Rodriguez') {
                        await octokit.rest.issues.createComment({
                            owner: repoOwner,
                            repo: repoName,
                            issue_number: pullRequestNumber || contributor.lastPR,
                            body: `🎉 Congratulations @${contributor.username}, you've earned a test badge! 🎉\n\nYou have earned 1 bill buck.\n\n![1 bill](${domain}/images/1_bill_57X27.png)`,
                        });
                        badgeAwarded = 'test badge';
                    } else {
                        if (contributor.prCount === 1) {
                            await octokit.rest.issues.createComment({
                                owner: repoOwner,
                                repo: repoName,
                                issue_number: pullRequestNumber || contributor.lastPR,
                                body: `🎉 Congratulations @${contributor.username}, you've earned a badge for your first PR! 🎉`,
                            });
                            badgeAwarded = 'first PR badge';
                        }
                        if (contributor.reviewCount === 1) {
                            await octokit.rest.issues.createComment({
                                owner: repoOwner,
                                repo: repoName,
                                issue_number: pullRequestNumber || contributor.lastReview,
                                body: `🎉 Congratulations @${contributor.username}, you've earned a badge for your first review! 🎉`,
                            });
                            badgeAwarded = 'first review badge';
                        }
                        if (contributor.prCount === 10 && !contributor.first10PrsAwarded) {
                            await octokit.rest.issues.createComment({
                                owner: repoOwner,
                                repo: repoName,
                                issue_number: pullRequestNumber || contributor.lastPR,
                                body: `🎉 Congratulations @${contributor.username}, you've earned one BillBuck for your first 10 PRs! 🎉 \n\n![1 bill](${domain}/images/1_bill_57X27.png)`,
                            });
                            badgeAwarded = 'first 10 PRs Award';
                            contributor.first10PrsAwarded = true;
                        }
                        if (contributor.reviewCount === 10 && !contributor.first10ReviewsAwarded) {
                            await octokit.rest.issues.createComment({
                                owner: repoOwner,
                                repo: repoName,
                                issue_number: pullRequestNumber || contributor.lastReview,
                                body: `🎉 Congratulations @${contributor.username}, you've earned one Bill for your first 10 reviews! 🎉\n\n![1 bill](${domain}/images/1_bill_57X27.png)`,
                            });
                            badgeAwarded = 'first 10 reviews Award';
                            contributor.first10ReviewsAwarded = true;
                        }
                        if (contributor.prCount >= 20) {
                            await octokit.rest.issues.createComment({
                                owner: repoOwner,
                                repo: repoName,
                                issue_number: pullRequestNumber || contributor.lastPR,
                                body: `🎉 Congratulations @${contributor.username}, you've earned a badge for 20 PRs! 🎉`,
                            });
                            badgeAwarded = '20 PRs badge';
                            contributor.prCount = 0;
                        }
                    }
                    if (badgeAwarded) {
                        results.push({ username: contributor.username, badge: badgeAwarded });
                    }

                    if (process.env.NODE_ENV === 'production') {
                        const updateParams = {
                            TableName: 'Contributors',
                            Key: { username: contributor.username },
                            UpdateExpression: 'set prCount = :prCount, reviewCount = :reviewCount, first10PrsAwarded = :first10PrsAwarded, first10ReviewsAwarded = :first10ReviewsAwarded',
                            ExpressionAttributeValues: {
                                ':prCount': contributor.prCount,
                                ':reviewCount': contributor.reviewCount,
                                ':first10PrsAwarded': contributor.first10PrsAwarded,
                                ':first10ReviewsAwarded': contributor.first10ReviewsAwarded,
                            },
                        };
                        await dbClient.update(updateParams).promise();
                    } else {
                        await contributor.save();
                    }
                }
            } catch (err) {
                console.error('Error awarding badges', err);
            }
            return results;
        }

        cron.schedule('0 0 * * *', async () => {
            await fetchPullRequests();
            await awardBadges();
        });

        app.get('/top-contributors', async (req, res) => {
            try {
                let contributors;
                if (process.env.NODE_ENV === 'production') {
                    const params = {
                        TableName: 'Contributors',
                        FilterExpression: 'NOT contains(username, :bot)',
                        ExpressionAttributeValues: { ':bot': '[bot]' },
                        ProjectionExpression: 'username, prCount, avatarUrl',
                        Limit: 10,
                    };
                    const data = await dbClient.scan(params).promise();
                    contributors = data.Items.sort((a, b) => b.prCount - a.prCount);
                } else {
                    contributors = await Contributor.find({ username: { $not: /\[bot\]$/ } }).sort({ prCount: -1 }).limit(10).select('username prCount avatarUrl');
                }
                res.json(contributors);
            } catch (err) {
                res.status(500).json({ error: 'Internal Server Error' });
            }
        });

        app.get('/top-reviewers', async (req, res) => {
            try {
                let reviewers;
                if (process.env.NODE_ENV === 'production') {
                    const params = {
                        TableName: 'Contributors',
                        FilterExpression: 'NOT contains(username, :bot)',
                        ExpressionAttributeValues: { ':bot': '[bot]' },
                        ProjectionExpression: 'username, reviewCount, avatarUrl',
                        Limit: 10,
                    };
                    const data = await dbClient.scan(params).promise();
                    reviewers = data.Items.sort((a, b) => b.reviewCount - a.reviewCount);
                } else {
                    reviewers = await Contributor.find({ username: { $not: /\[bot\]$/ } }).sort({ reviewCount: -1 }).limit(10).select('username reviewCount avatarUrl');
                }
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

        app.get('/award-badges', async (req, res) => {
            const pullRequestNumber = req.query.pull_request_number;
            const test = req.query.test === 'true';
            try {
                const results = await awardBadges(pullRequestNumber, test);
                res.status(200).json({ message: 'Badges awarded successfully.', results });
            } catch (err) {
                res.status(500).json({ message: 'Error awarding badges.' });
            }
        });

        app.listen(port, () => {
            console.log(`GitHub PR Scoreboard app listening on http://localhost:${port}`);
        });