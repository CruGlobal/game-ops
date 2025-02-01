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
const domain = process.env.DOMAIN;

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
                pull_number: pr.number,
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
            let badgeImage = null;

            if (contributor.prCount >= 1 && !contributor.firstPrAwarded) {
                badgeAwarded = '1st PR badge';
                badgeImage = '1st_pr_badge.png';
                contributor.firstPrAwarded = true;
            } else if (contributor.reviewCount >= 1 && !contributor.firstReviewAwarded) {
                badgeAwarded = '1st Review badge';
                badgeImage = '1st_review_badge.png';
                contributor.firstReviewAwarded = true;
            } else if (contributor.prCount >= 10 && !contributor.first10PrsAwarded) {
                badgeAwarded = '10 PRs badge';
                badgeImage = '10th_pr_badge.png';
                contributor.first10PrsAwarded = true;
            } else if (contributor.reviewCount >= 10 && !contributor.first10ReviewsAwarded) {
                badgeAwarded = '10 Reviews badge';
                badgeImage = '10th_review_badge.png';
                contributor.first10ReviewsAwarded = true;
            } else if (contributor.prCount >= 500 && !contributor.first500PrsAwarded) {
                badgeAwarded = '500 PRs badge';
                badgeImage = '500th_pr_badge.png';
                contributor.first500PrsAwarded = true;
            } else if (contributor.reviewCount >= 500 && !contributor.first500ReviewsAwarded) {
                badgeAwarded = '500 Reviews badge';
                badgeImage = '500th_review_badge.png';
                contributor.first500ReviewsAwarded = true;
            } else if (contributor.prCount >= 1000 && !contributor.first1000PrsAwarded) {
                badgeAwarded = '1000 PRs badge';
                badgeImage = '1000th_pr_badge.png';
                contributor.first1000PrsAwarded = true;
            } else if (contributor.reviewCount >= 1000 && !contributor.first1000ReviewsAwarded) {
                badgeAwarded = '1000 Reviews badge';
                badgeImage = '1000th_reviews_badge.png';
                contributor.first1000ReviewsAwarded = true;
            }

            if (badgeAwarded) {
                //await octokit.rest.issues.createComment({
                //    owner: repoOwner,
                //    repo: repoName,
                //    issue_number: pullRequestNumber || contributor.lastPR,
                //    body: `🎉 Congratulations @${contributor.username}, you''ve earned the ${badgeAwarded}! 🎉\n\n![Badge](${domain}/images/${badgeImage})`,
                //});
                console.log(`🎉 Congratulations @${contributor.username}, you''ve earned the ${badgeAwarded}! 🎉\n\n![Badge](${domain}/images/${badgeImage})`);

                results.push({ username: contributor.username, badge: badgeAwarded, badgeImage: badgeImage });

                if (process.env.NODE_ENV === 'production') {
                    const updateParams = {
                        TableName: 'Contributors',
                        Key: { username: contributor.username },
                        UpdateExpression: 'set prCount = :prCount, reviewCount = :reviewCount, firstPrAwarded = :firstPrAwarded, firstReviewAwarded = :firstReviewAwarded, first10PrsAwarded = :first10PrsAwarded, first10ReviewsAwarded = :first10ReviewsAwarded, first500PrsAwarded = :first500PrsAwarded, first500ReviewsAwarded = :first500ReviewsAwarded, first1000PrsAwarded = :first1000PrsAwarded, first1000ReviewsAwarded = :first1000ReviewsAwarded, badges = list_append(if_not_exists(badges, :empty_list), :new_badge)',
                        ExpressionAttributeValues: {
                            ':prCount': contributor.prCount,
                            ':reviewCount': contributor.reviewCount,
                            ':firstPrAwarded': contributor.firstPrAwarded,
                            ':firstReviewAwarded': contributor.firstReviewAwarded,
                            ':first10PrsAwarded': contributor.first10PrsAwarded,
                            ':first10ReviewsAwarded': contributor.first10ReviewsAwarded,
                            ':first500PrsAwarded': contributor.first500PrsAwarded,
                            ':first500ReviewsAwarded': contributor.first500ReviewsAwarded,
                            ':first1000PrsAwarded': contributor.first1000PrsAwarded,
                            ':first1000ReviewsAwarded': contributor.first1000ReviewsAwarded,
                            ':empty_list': [],
                            ':new_badge': [{ badge: badgeAwarded, date: new Date().toISOString() }],
                        },
                    };
                    await dbClient.update(updateParams).promise();
                } else {
                    contributor.badges = contributor.badges || [];
                    contributor.badges.push({ badge: badgeAwarded, date: new Date().toISOString() });
                    await contributor.save();
                }
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
            ProjectionExpression: 'username, prCount, avatarUrl, badges, totalBillsAwarded',
            Limit: 10,
        };
        const data = await dbClient.scan(params).promise();
        contributors = data.Items.sort((a, b) => b.prCount - a.prCount);
    } else {
        contributors = await Contributor.find({ username: { $not: /\[bot\]$/ } }).sort({ prCount: -1 }).limit(10).select('username prCount avatarUrl badges totalBillsAwarded');
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
            ProjectionExpression: 'username, reviewCount, avatarUrl, badges,totalBillsAwarded',
            Limit: 10,
        };
        const data = await dbClient.scan(params).promise();
        reviewers = data.Items.sort((a, b) => b.reviewCount - a.reviewCount);
    } else {
        reviewers = await Contributor.find({ username: { $not: /\[bot\]$/ } }).sort({ reviewCount: -1 }).limit(10).select('username reviewCount avatarUrl badges totalBillsAwarded');
    }
    return reviewers;
};

export const awardBillsAndVonettes = async (pullRequestNumber = null, test = false) => {
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

            let billsAwarded = null;
            let billsImage = null;
            let billsValue = 0;

            if (contributor.prCount >= 10 && !contributor.first10PrsAwarded) {
                billsAwarded = 'Bill';
                billsImage = '1_bill_57X27.png';
                billsValue += 1;
                contributor.first10PrsAwarded = true;
            } else if (contributor.reviewCount >= 10 && !contributor.first10ReviewsAwarded) {
                billsAwarded = 'Bill';
                billsImage = '1_bill_57X27.png';
                billsValue += 1;
                contributor.first10ReviewsAwarded = true;
            } else if ((contributor.prCount >= 500 || contributor.reviewCount >= 500) && (!contributor.first500PrsAwarded || !contributor.first500ReviewsAwarded)) {
                billsAwarded = 'Vonette';
                billsImage = '5_vonett_57_25.png';
                billsValue += 5;
                if (contributor.prCount >= 500) contributor.first500PrsAwarded = true;
                if (contributor.reviewCount >= 500) contributor.first500ReviewsAwarded = true;
            }

            const totalContributions = contributor.prCount + contributor.reviewCount;
            const newBills = Math.floor(totalContributions / 100) - (contributor.totalBillsAwarded || 0);

            if (newBills > 0) {
                billsAwarded = 'Bill';
                billsImage = '1_bill_57X27.png';
                billsValue += newBills;
            }

            if (billsValue > 0) {
                //await octokit.rest.issues.createComment({
                //    owner: repoOwner,
                //    repo: repoName,
                //    issue_number: pullRequestNumber || contributor.lastPR,
                //    body: `🎉 Congratulations @${contributor.username}, you've earned ${billsValue} ${billsAwarded}(s)! 🎉\n\n![${billsAwarded}](${domain}/images/${billsImage})`,
                //});
                console.log(`🎉 Congratulations @${contributor.username}, you've earned ${billsValue} ${billsAwarded}(s)! 🎉\n\n![${billsAwarded}](${domain}/images/${billsImage})`);

                results.push({ username: contributor.username, bills: billsAwarded, billsImage: billsImage });

                if (process.env.NODE_ENV === 'production') {
                    const updateParams = {
                        TableName: 'Contributors',
                        Key: { username: contributor.username },
                        UpdateExpression: 'set totalBillsAwarded = if_not_exists(totalBillsAwarded, :start) + :billsValue',
                        ExpressionAttributeValues: {
                            ':start': 0,
                            ':billsValue': billsValue,
                        },
                    };
                    await dbClient.update(updateParams).promise();
                } else {
                    contributor.totalBillsAwarded = (contributor.totalBillsAwarded || 0) + billsValue;
                    await contributor.save();
                }
            }
        }
    } catch (err) {
        console.error('Error awarding Bills and Vonettes', err);
    }
    return results;
};