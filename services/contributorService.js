import { Octokit } from '@octokit/rest';
                    import dbClient from '../config/db-config.js';
                    import Contributor from '../models/contributor.js';
                    import FetchDate from '../models/fetchDate.js';
                    import mongoSanitize from 'express-mongo-sanitize';
                    import fetch from 'node-fetch';

                    const octokit = new Octokit({
                        auth: process.env.GITHUB_TOKEN,
                        request: {
                            fetch: fetch
                        }
                    });

                    const repoOwner = process.env.REPO_OWNER;
                    const repoName = process.env.REPO_NAME;

                    export const updateContributor = async (username, type) => {
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
                    };

                    const getLastFetchDate = async () => {
                        const fetchDate = await FetchDate.findOne({}).sort({ date: -1 });
                        return fetchDate ? fetchDate.date : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
                    };

                    const updateLastFetchDate = async (date) => {
                        await FetchDate.updateOne({}, { date: date }, { upsert: true });
                    };

                    export const fetchPullRequests = async () => {
                        try {
                            const lastFetchDate = await getLastFetchDate();
                            const { data: pullRequests } = await octokit.rest.pulls.list({
                                owner: repoOwner,
                                repo: repoName,
                                state: 'all',
                                per_page: 100,
                                sort: 'updated',
                                direction: 'desc',
                                since: lastFetchDate.toISOString(),
                            });

                            for (const pr of pullRequests) {
                                await updateContributor(pr.user.login, 'prCount');
                                if (pr.reviews) {
                                    for (const review of pr.reviews) {
                                        await updateContributor(review.user.login, 'reviewCount');
                                    }
                                }
                            }

                            await updateLastFetchDate(new Date());
                        } catch (err) {
                            console.error('Error fetching pull requests', err);
                        }
                    };

                    export const fetchReviews = async () => {
                        try {
                            const lastFetchDate = await getLastFetchDate();
                            const { data: pullRequests } = await octokit.rest.pulls.list({
                                owner: repoOwner,
                                repo: repoName,
                                state: 'all',
                                per_page: 100,
                                sort: 'updated',
                                direction: 'desc',
                                since: lastFetchDate.toISOString(),
                            });

                            for (const pr of pullRequests) {
                                const { data: reviews } = await octokit.rest.pulls.listReviews({
                                    owner: repoOwner,
                                    repo: repoName,
                                    pull_number: pr.number, // Ensure pull_number is correctly passed
                                    per_page: 100,
                                });

                                for (const review of reviews) {
                                    await updateContributor(review.user.login, 'reviewCount');
                                }
                            }

                            await updateLastFetchDate(new Date());
                        } catch (err) {
                            console.error('Error fetching reviews', err);
                        }
                    };

                    export const awardBadges = async (pullRequestNumber = null, test = false) => {
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
                    };

                    export const getTopContributors = async () => {
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
                        return contributors;
                    };

                    export const getTopReviewers = async () => {
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
                        return reviewers;
                    };