import { Octokit } from '@octokit/rest';
import dbClient from '../config/db-config.js';
import Contributor from '../models/contributor.js';
import FetchDate from '../models/fetchDate.js';
import mongoSanitize from 'express-mongo-sanitize';
import fetch from 'node-fetch';

// Initialize Octokit with GitHub token and custom fetch
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN,
    request: {
        fetch: fetch
    }
});

const repoOwner = process.env.REPO_OWNER;
const repoName = process.env.REPO_NAME;
const domain = process.env.DOMAIN;

// Function to sleep for a specified number of milliseconds
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to initialize the database
export const initializeDatabase = async () => {
    try {
        await Contributor.deleteMany({});

        let page = 1;
        let per_page = 100;
        let hasMorePages = true;
        let totalProcessed = 0;

        while (hasMorePages) {
            // Check rate limit
            const rateLimit = await octokit.rateLimit.get();
            const remainingRequests = rateLimit.data.rate.remaining;
            const resetTime = rateLimit.data.rate.reset * 1000; // Convert to milliseconds

            console.log(`Remaining API requests: ${remainingRequests}`);

            if (remainingRequests <= 1000) {
                const waitTime = resetTime - Date.now();
                console.log(`Rate limit is low. Waiting for ${waitTime / 1000} seconds until reset.`);
                await sleep(waitTime);
            }

            const { data: pullRequests } = await octokit.rest.pulls.list({
                owner: repoOwner,
                repo: repoName,
                state: 'all',
                per_page: per_page,
                page: page,
                sort: 'updated',
                direction: 'desc',
            });

            if (pullRequests.length === 0) {
                hasMorePages = false;
                break;
            }

            for (const pr of pullRequests) {
                const prDate = new Date(pr.updated_at);
                const merged = !!pr.merged_at; // Check if the PR is merged
                await updateContributor(pr.user.login, 'prCount', prDate, merged);

                const { data: reviews } = await octokit.rest.pulls.listReviews({
                    owner: repoOwner,
                    repo: repoName,
                    pull_number: pr.number,
                    per_page: per_page,
                });

                for (const review of reviews) {
                    const reviewDate = new Date(review.submitted_at);
                    await updateContributor(review.user.login, 'reviewCount', reviewDate);
                }

                // Throttle requests to avoid hitting rate limits
                await sleep(3000); // Sleep for 3 seconds between each pull request

                totalProcessed++;
                console.log(`Processed ${totalProcessed} pull requests`);
            }

            page += 1;
        }

        console.log('Database initialized successfully');
    } catch (err) {
        console.error('Error initializing database', err);
    }
};

// Update contributor's PR or review count with date
export const updateContributor = async (username, type, date, merged = false) => {
    if (!['prCount', 'reviewCount'].includes(type)) {
        throw new Error('Invalid type'); // Throw an error if the type is invalid
    }
    const { data: userData } = await octokit.rest.users.getByUsername({
        username: username
    });

    const updateExpression = type === 'prCount' ?
            `set prCount = prCount + :val, avatarUrl = :avatarUrl, lastUpdated = :lastUpdated, contributions = list_append(if_not_exists(contributions, :empty_list), :new_entry)` :
            `set reviewCount = reviewCount + :val, avatarUrl = :avatarUrl, lastUpdated = :lastUpdated, reviews = list_append(if_not_exists(reviews, :empty_list), :new_entry)`;

    const expressionAttributeValues = {
        ':val': 1,
        ':avatarUrl': userData.avatar_url,
        ':lastUpdated': new Date().toISOString(),
        ':empty_list': [],
        ':new_entry': [{ date: date.toISOString(), count: 1, merged: merged }],
    };

    if (process.env.NODE_ENV === 'production') {
        const params = {
            TableName: 'Contributors',
            Key: { username: username },
            UpdateExpression: updateExpression,
            ExpressionAttributeValues:expressionAttributeValues,
            ReturnValues: 'ALL_NEW'
        };
        await dbClient.update(params).promise(); // Update the contributor in the database
    } else {
        let contributor = await Contributor.findOne({ username: mongoSanitize.sanitize(username) });
        if (!contributor) {
            contributor = new Contributor({ username, avatarUrl: userData.avatar_url });
        }
        contributor[type] += 1;
        contributor.avatarUrl = userData.avatar_url;
        contributor.lastUpdated = Date.now();
        if (type === 'prCount') {
            contributor.contributions.push({ date: date, count: 1, merged: merged });
        } else {
            contributor.reviews.push({ date: date, count: 1 });
        }
        await contributor.save(); // Save the contributor to the database
    }
};

// Get the last fetch date from the database
const getLastFetchDate = async () => {
    const fetchDate = await FetchDate.findOne({}).sort({ date: -1 });
    return fetchDate ? fetchDate.date : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // Return the last fetch date or a default date
};

// Update the last fetch date in the database
const updateLastFetchDate = async (date) => {
    await FetchDate.updateOne({}, { date: date }, { upsert: true }); // Update or insert the fetch date
};

// Fetch pull requests and update contributors' PR counts
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
          if (pr.merged_at || pr.state === 'closed' && pr.merge_commit_sha) {
            const username = pr.user.login;
            const date = new Date(pr.updated_at);
            const merged = !!pr.merged_at; // Check if the PR is merged
            await updateContributor(username, 'prCount', date, merged); // Pass the date to updateContributor

            const { data: reviews } = await octokit.rest.pulls.listReviews({
                owner: repoOwner,
                repo: repoName,
                pull_number: pr.number,
                per_page: 100,
            });

            for (const review of reviews) {
                const reviewUsername = review.user.login;
                const reviewDate = new Date(review.submitted_at);
                await updateContributor(reviewUsername, 'reviewCount', reviewDate); // Pass the date to updateContributor
            }
          }
        }

        await updateLastFetchDate(new Date()); // Update the last fetch date
    } catch (err) {
        console.error('Error fetching pull requests', err); // Log any errors
    }
};

// Award badges to contributors based on their contributions
export const awardBadges = async (pullRequestNumber = null) => {
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
                continue; // Skip bot users
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
                badgeImage = '10_pr_badge.png';
                contributor.first10PrsAwarded = true;
            } else if (contributor.reviewCount >= 10 && !contributor.first10ReviewsAwarded) {
                badgeAwarded = '10 Reviews badge';
                badgeImage = '10_review_badge.png';
                contributor.first10ReviewsAwarded = true;
            } else if (contributor.prCount >= 50 && !contributor.first50PrsAwarded) {
                badgeAwarded = '50 PRs badge';
                badgeImage = '50_prs_badge.png';
                contributor.first50PrsAwarded = true;
            } else if (contributor.reviewCount >= 50 && !contributor.first50ReviewsAwarded) {
                badgeAwarded = '50 Reviews badge';
                badgeImage = '50_reviews_badge.png';
                contributor.first50ReviewsAwarded = true;
            } else if (contributor.prCount >= 100 && !contributor.first100PrsAwarded) {
                badgeAwarded = '100 PRs badge';
                badgeImage = '100_prs_badge.png';
                contributor.first100PrsAwarded = true;
            } else if (contributor.reviewCount >= 100 && !contributor.first100ReviewsAwarded) {
                badgeAwarded = '100 Reviews badge';
                badgeImage = '100_reviews_badge.png';
                contributor.first100ReviewsAwarded = true;
            } else if (contributor.prCount >= 500 && !contributor.first500PrsAwarded) {
                badgeAwarded = '500 PRs badge';
                badgeImage = '500_prs_badge.png';
                contributor.first500PrsAwarded = true;
            } else if (contributor.reviewCount >= 500 && !contributor.first500ReviewsAwarded) {
                badgeAwarded = '500 Reviews badge';
                badgeImage = '500_reviews_badge.png';
                contributor.first500ReviewsAwarded = true;
            } else if (contributor.prCount >= 1000 && !contributor.first1000PrsAwarded) {
                badgeAwarded = '1000 PRs badge';
                badgeImage = '1000_prs_badge.png';
                contributor.first1000PrsAwarded = true;
            } else if (contributor.reviewCount >= 1000 && !contributor.first1000ReviewsAwarded) {
                badgeAwarded = '1000 Reviews badge';
                badgeImage = '1000_reviews_badge.png';
                contributor.first1000ReviewsAwarded = true;
            }

            if (badgeAwarded) {
                // Log the awarded badge (commented out GitHub API call)
                console.log(`🎉 Congratulations @${contributor.username}, you've earned the ${badgeAwarded}! 🎉\n\n![Badge](${domain}/images/${badgeImage})`);

                results.push({ username: contributor.username, badge: badgeAwarded, badgeImage: badgeImage });

                if (process.env.NODE_ENV === 'production') {
                    const updateParams = {
                        TableName: 'Contributors',
                        Key: { username: contributor.username },
                        UpdateExpression: 'set prCount = :prCount, reviewCount = :reviewCount, firstPrAwarded = :firstPrAwarded, firstReviewAwarded = :firstReviewAwarded, first10PrsAwarded = :first10PrsAwarded, first10ReviewsAwarded = :first10ReviewsAwarded, first50PrsAwarded = :first50PrsAwarded, first50ReviewsAwarded = :first50ReviewsAwarded, first100PrsAwarded = :first100PrsAwarded, first100ReviewsAwarded = :first100ReviewsAwarded, first500PrsAwarded = :first500PrsAwarded, first500ReviewsAwarded = :first500ReviewsAwarded, first1000PrsAwarded = :first1000PrsAwarded, first1000ReviewsAwarded = :first1000ReviewsAwarded, badges = list_append(if_not_exists(badges, :empty_list), :new_badge)',
                        ExpressionAttributeValues: {
                            ':prCount': contributor.prCount,
                            ':reviewCount': contributor.reviewCount,
                            ':firstPrAwarded': contributor.firstPrAwarded,
                            ':firstReviewAwarded': contributor.firstReviewAwarded,
                            ':first10PrsAwarded': contributor.first10PrsAwarded,
                            ':first10ReviewsAwarded': contributor.first10ReviewsAwarded,
                            ':first50PrsAwarded': contributor.first50PrsAwarded,
                            ':first50ReviewsAwarded': contributor.first50ReviewsAwarded,
                            ':first100PrsAwarded': contributor.first100PrsAwarded,
                            ':first100ReviewsAwarded': contributor.first100ReviewsAwarded,
                            ':first500PrsAwarded': contributor.first500PrsAwarded,
                            ':first500ReviewsAwarded': contributor.first500ReviewsAwarded,
                            ':first1000PrsAwarded': contributor.first1000PrsAwarded,
                            ':first1000ReviewsAwarded': contributor.first1000ReviewsAwarded,
                            ':empty_list': [],
                            ':new_badge': [{ badge: badgeAwarded, date: new Date().toISOString() }],
                        },
                    };
                    await dbClient.update(updateParams).promise(); // Update the contributor in the database
                } else {
                    contributor.badges = contributor.badges || [];
                    contributor.badges.push({ badge: badgeAwarded, date: new Date().toISOString() });
                    await contributor.save(); // Save the contributor to the database
                }
            }
        }
    } catch (err) {
        console.error('Error awarding badges', err); // Log any errors
    }
    return results;
};

export const getTopContributorsDateRange = async (startDate, endDate, page, limit) => {
    let contributors;
    const query = {
        contributions: {
            $elemMatch: {
                date: { $gte: startDate, $lte: endDate },
                merged: true // Filter for merged contributions
            }
        },
        username: { $not: /\[bot\]$/ }
    };

    if (process.env.NODE_ENV === 'production') {
        const params = {
            TableName: 'Contributors',
            KeyConditionExpression: 'contributions.date BETWEEN :startDate AND :endDate',
            FilterExpression: 'NOT contains(username, :bot)',
            ExpressionAttributeValues: {
                ':startDate': startDate.toISOString(),
                ':endDate': endDate.toISOString(),
                ':bot': '[bot]',
                ':merged': true
            },
            ProjectionExpression: 'username, contributions, avatarUrl, badges, totalBillsAwarded',
            Limit: limit,
            ExclusiveStartKey: (page - 1) * limit
        };
        const data = await dbClient.query(params).promise();
        contributors = data.Items;
    } else {
        contributors = await Contributor.find(query)
            .sort({ 'contributions.count': -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .select('username contributions avatarUrl badges totalBillsAwarded');
    }

    // Calculate total pull requests for each contributor in the given date range
    contributors = contributors.map(contributor => {
        const totalPrCount = contributor.contributions
            .filter(contribution => contribution.date >= startDate && contribution.date <= endDate)
            .reduce((total, contribution) => total + contribution.count, 0);
        return { ...contributor.toObject(), totalPrCount };
    });

    // Sort contributors by totalPrCount
    contributors.sort((a, b) => b.totalPrCount - a.totalPrCount);

    // Calculate total pull requests in the given date range
    const totalPullRequests = contributors.reduce((total, contributor) => {
        return total + contributor.totalPrCount;
    }, 0);

    return { contributors, totalPullRequests };
};

export const getTopReviewersDateRange = async (startDate, endDate, page, limit) => {
    let reviewers;
    const query = {
        reviews: {
            $elemMatch: {
                date: { $gte: startDate, $lte: endDate }
            }
        },
        username: { $not: /\[bot\]$/ }
    };

    if (process.env.NODE_ENV === 'production') {
        const params = {
            TableName: 'Contributors',
            KeyConditionExpression: 'reviews.date BETWEEN :startDate AND :endDate',
            FilterExpression: 'NOT contains(username, :bot)',
            ExpressionAttributeValues: {
                ':startDate': startDate.toISOString(),
                ':endDate': endDate.toISOString(),
                ':bot': '[bot]'
            },
            ProjectionExpression: 'username, reviews, avatarUrl, badges, totalBillsAwarded',
            Limit: limit,
            ExclusiveStartKey: (page - 1) * limit
        };
        const data = await dbClient.query(params).promise();
        reviewers = data.Items;
    } else {
        reviewers = await Contributor.find(query)
            .sort({ 'reviews.count': -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .select('username reviews avatarUrl badges totalBillsAwarded');
    }

    // Calculate total reviews for each reviewer in the given date range
    reviewers = reviewers.map(reviewer => {
        const totalReviewCount = reviewer.reviews
            .filter(review => review.date >= startDate && review.date <= endDate)
            .reduce((total, review) => total + review.count, 0);
        return { ...reviewer.toObject(), totalReviewCount };
    });

    // Sort reviewers by totalReviewCount
    reviewers.sort((a, b) => b.totalReviewCount - a.totalReviewCount);

    // Calculate total reviews in the given date range
    const totalReviews = reviewers.reduce((total, reviewer) => {
        return total + reviewer.totalReviewCount;
    }, 0);

    return { reviewers, totalReviews };
};

// Get the top contributors based on PR count
export const getTopContributors = async () => {
    let contributors;
    if (process.env.NODE_ENV === 'production') {
        const params = {
            TableName: 'Contributors',
            FilterExpression: 'NOT contains(username, :bot)',
            ExpressionAttributeValues: { ':bot': '[bot]' },
            ProjectionExpression: 'username, prCount, avatarUrl, badges, totalBillsAwarded',
            Limit: 50,
        };
        const data = await dbClient.scan(params).promise();
        contributors = data.Items.sort((a, b) => b.prCount - a.prCount); // Sort contributors by PR count
    } else {
        contributors = await Contributor.find({ username: { $not: /\[bot\]$/ } }).sort({ prCount: -1 }).limit(50).select('username prCount avatarUrl badges totalBillsAwarded');
    }
    return contributors;
};

// Get the top reviewers based on review count
export const getTopReviewers = async () => {
    let reviewers;
    if (process.env.NODE_ENV === 'production') {
        const params = {
            TableName: 'Contributors',
            FilterExpression: 'NOT contains(username, :bot)',
            ExpressionAttributeValues: { ':bot': '[bot]' },
            ProjectionExpression: 'username, reviewCount, avatarUrl, badges,totalBillsAwarded',
            Limit: 50,
        };
        const data = await dbClient.scan(params).promise();
        reviewers = data.Items.sort((a, b) => b.reviewCount - a.reviewCount); // Sort reviewers by review count
    } else {
        reviewers = await Contributor.find({ username: { $not: /\[bot\]$/ } }).sort({ reviewCount: -1 }).limit(50).select('username reviewCount avatarUrl badges totalBillsAwarded');
    }
    return reviewers;
};

// Award bills and vonettes to contributors based on their contributions
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
                continue; // Skip bot users
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
           }  else if ((contributor.prCount >= 500 && !contributor.first500PrsAwarded) || (contributor.reviewCount >= 500 && !contributor.first500ReviewsAwarded)) {
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
                // Log the awarded bills and vonettes (commented out GitHub API call)
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
                    await dbClient.update(updateParams).promise(); // Update the contributor in the database
                } else {
                    contributor.totalBillsAwarded = (contributor.totalBillsAwarded || 0) + billsValue;
                    await contributor.save(); // Save the contributor to the database
                }
            }
        }
    } catch (err) {
        console.error('Error awarding Bills and Vonettes', err); // Log any errors
    }
    return results;
};

// function to fetch activity data
export const fetchActivityData = async (prFrom, prTo) => {
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.GITHUB_TOKEN}`
    };

    const stats = [];
    const blocked = [];

    for (let i = prFrom; i <= prTo; i++) {
        try {
            const url = `https://api.github.com/repos/${repoOwner}/${repoName}/pulls/${i}`;
            const response = await fetch(url, { headers });
            if (!response.ok) {
                if (response.status === 404) {
                    console.warn(`Pull request ${i} not found.`);
                    continue; // Skip to the next pull request
                }
                throw new Error(`Failed to fetch pull request ${i}: ${response.statusText}`);
            }
            const prData = await response.json();
            updateStats(stats, prData.user.login, "pr");

            const reviewsUrl = `https://api.github.com/repos/${repoOwner}/${repoName}/pulls/${i}/reviews`;
            const reviewsResponse = await fetch(reviewsUrl, { headers });
            if (!reviewsResponse.ok) {
                throw new Error(`Failed to fetch reviews for pull request ${i}: ${reviewsResponse.statusText}`);
            }
            const reviewsData = await reviewsResponse.json();

            for (const review of reviewsData) {
                if (review.state === "APPROVED") {
                    updateStats(stats, review.user.login, "approved");
                } else if (review.state === "COMMENTED") {
                    updateStats(stats, review.user.login, "commented");
                } else if (review.state === "CHANGES_REQUESTED") {
                    updateStats(stats, review.user.login, "change");
                    updateChange(blocked, prData.user.login, review.user.login, "change");
                } else if (review.state === "DISMISSED") {
                    updateStats(stats, review.user.login, "dismissed");
                }
            }
        } catch (error) {
            console.error(`Error fetching activity data for pull request ${i}:`, error);
        }
    }

    return { stats, blocked };
};

function updateStats(stats, user, statType) {
    let found = false;
    for (const stat of stats) {
        if (stat[0] === user) {
            if (statType === "approved") {
                stat[1] += 1;
            } else if (statType === "commented") {
                stat[2] += 1;
            } else if (statType === "change") {
                stat[3] += 1;
            } else if (statType === "dismissed") {
                stat[4] += 1;
            } else if (statType === "pr") {
                stat[5] += 1;
            }
            found = true;
            break;
        }
    }
    if (!found) {
        if (statType === "approved") {
            stats.push([user, 1, 0, 0, 0, 0]);
        } else if (statType === "commented") {
            stats.push([user, 0, 1, 0, 0, 0]);
        } else if (statType === "change") {
            stats.push([user, 0, 0, 1, 0, 0]);
        } else if (statType === "dismissed") {
            stats.push([user, 0, 0, 0, 1, 0]);
        } else if (statType === "pr") {
            stats.push([user, 0, 0, 0, 0, 1]);
        }
    }
}

function updateChange(blocked, userRaised, user, changeType) {
    let found = false;
    for (const block of blocked) {
        if (block[0] === user && block[1] === userRaised) {
            if (changeType === "change") {
                block[2] += 1;
            }
            found = true;
            break;
        }
    }
    if (!found) {
        if (changeType === "change") {
            blocked.push([user, userRaised, 1, 0]);
        }
    }
}