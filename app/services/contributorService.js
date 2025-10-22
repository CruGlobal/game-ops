import { Octokit } from '@octokit/rest';
import { prisma } from '../lib/prisma.js';
import fetch from 'node-fetch';
import { emitPRUpdate, emitBadgeAwarded, emitLeaderboardUpdate, emitReviewUpdate } from '../utils/socketEmitter.js';
import { updateStreak, checkStreakBadges } from './streakService.js';
import { calculatePoints, awardPoints, awardReviewPoints } from './pointsService.js';
import { checkAndAwardAchievements } from './achievementService.js';
import { updateChallengeProgress } from './challengeService.js';
import { checkAndResetIfNewQuarter, updateQuarterlyStats } from './quarterlyService.js';

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
        // In test environment, avoid external GitHub API calls
        if (process.env.NODE_ENV === 'test') {
            console.log('Database initialized successfully (test mode)');
            return 'Database initialized successfully.';
        }
        await prisma.contributor.deleteMany({});

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
        return 'Database initialized successfully.';
    } catch (err) {
        console.error('Error initializing database', err);
        throw err;
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

    let contributor = await prisma.contributor.findUnique({
        where: { username: username }
    });
    
    if (!contributor) {
        contributor = await prisma.contributor.create({
            data: {
                username,
                avatarUrl: userData.avatar_url,
                prCount: 0,
                reviewCount: 0
            }
        });
    }

    // Extract date for aggregation (date only, no time)
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    const updateData = {
        avatarUrl: userData.avatar_url,
        lastUpdated: new Date()
    };

    if (type === 'prCount') {
        updateData.prCount = { increment: 1 };
        
        // Create or update Contribution record (daily aggregate)
        const existingContribution = await prisma.contribution.findFirst({
            where: {
                contributorId: contributor.id,
                date: dateOnly
            }
        });

        if (existingContribution) {
            await prisma.contribution.update({
                where: { id: existingContribution.id },
                data: {
                    count: { increment: 1 },
                    merged: merged || existingContribution.merged
                }
            });
        } else {
            await prisma.contribution.create({
                data: {
                    contributorId: contributor.id,
                    date: dateOnly,
                    count: 1,
                    merged: merged
                }
            });
        }
    } else {
        updateData.reviewCount = { increment: 1 };
        
        // Create or update Review record (daily aggregate)
        const existingReview = await prisma.review.findFirst({
            where: {
                contributorId: contributor.id,
                date: dateOnly
            }
        });

        if (existingReview) {
            await prisma.review.update({
                where: { id: existingReview.id },
                data: {
                    count: { increment: 1 }
                }
            });
        } else {
            await prisma.review.create({
                data: {
                    contributorId: contributor.id,
                    date: dateOnly,
                    count: 1
                }
            });
        }
    }

    const updated = await prisma.contributor.update({
        where: { username },
        data: updateData,
        select: {
            username: true,
            prCount: true,
            reviewCount: true,
            totalPoints: true,
            avatarUrl: true
        }
    });

    // Emit socket event for real-time updates
    if (type === 'prCount') {
        emitPRUpdate({
            username: updated.username,
            prCount: Number(updated.prCount)
        });
    } else {
        emitReviewUpdate({
            username: updated.username,
            reviewCount: Number(updated.reviewCount)
        });
    }

    // Emit leaderboard update for live UI updates
    emitLeaderboardUpdate({
        username: updated.username,
        pullRequestCount: Number(updated.prCount),
        reviewCount: Number(updated.reviewCount),
        totalPoints: Number(updated.totalPoints),
        avatarUrl: updated.avatarUrl
    });
};

// Get the last fetch date from the database
const getLastFetchDate = async () => {
    const fetchDate = await prisma.fetchDate.findFirst({
        orderBy: { date: 'desc' }
    });
    return fetchDate ? fetchDate.date : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // Return the last fetch date or a default date
};

// Update the last fetch date in the database
const updateLastFetchDate = async (date) => {
    await prisma.fetchDate.upsert({
        where: { id: 'last-fetch' },
        update: { date },
        create: { id: 'last-fetch', date }
    });
};

// Fetch pull requests and update contributors' PR counts
export const fetchPullRequests = async () => {
    try {
        // Check if we've entered a new quarter and reset if needed
        await checkAndResetIfNewQuarter();

        let prsAdded = 0;
        let reviewsAdded = 0;
        const processStartTime = Date.now();

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

            // Gamification: Update streak, award points, check achievements
            try {
                let contributor = await prisma.contributor.findUnique({
                    where: { username },
                    include: {
                        processedPRs: {
                            where: { prNumber: BigInt(pr.number), action: 'authored' }
                        },
                        activeChallenges: true
                    }
                });

                // For merged PRs only
                if (merged) {
                    // ✅ FIX: Check for duplicates BEFORE updating (if contributor exists)
                    const alreadyProcessed = contributor?.processedPRs && contributor.processedPRs.length > 0;

                    if (alreadyProcessed) {
                        // Skip this PR - already processed
                        continue;
                    }

                    // Not a duplicate - safe to process
                    await updateContributor(username, 'prCount', date, merged);

                    // Re-fetch contributor (updateContributor may have created it)
                    contributor = await prisma.contributor.findUnique({
                        where: { username },
                        include: {
                            activeChallenges: true,
                            achievements: { select: { achievementId: true } }
                        }
                    });

                    if (contributor) {
                        // Add to processedPRs with contributorId (not username)
                        try {
                            await prisma.processedPR.create({
                                data: {
                                    contributorId: contributor.id,
                                    prNumber: BigInt(pr.number),
                                    prTitle: pr.title,
                                    action: 'authored',
                                    processedDate: new Date()
                                }
                            });
                            prsAdded++;
                        } catch (createError) {
                            // Handle duplicate key error (P2002) - PR was processed by another process (e.g., backfill)
                            if (createError.code === 'P2002') {
                                console.log(`PR #${pr.number} already processed by another process, skipping gamification to avoid duplicates`);
                                continue; // Skip gamification for this PR to avoid duplicate points
                            }
                            throw createError; // Re-throw other errors
                        }

                        // Update streak
                        await updateStreak(contributor, pr.merged_at);
                        await checkStreakBadges(contributor);

                        // Award points based on PR labels
                        const pointsData = calculatePoints(pr, contributor);
                        await awardPoints(contributor, pointsData.points, 'PR Merged', pr.number);

                        // Update quarterly stats (only if PR merged in current quarter)
                        await updateQuarterlyStats(username, {
                            prs: 1,
                            points: pointsData.points
                        }, pr.merged_at);

                        // Update challenge progress
                        if (contributor.activeChallenges && contributor.activeChallenges.length > 0) {
                            const { checkLabelMatch } = await import('./challengeService.js');

                            for (const activeChallenge of contributor.activeChallenges) {
                                const challenge = await prisma.challenge.findUnique({
                                    where: { id: activeChallenge.challengeId }
                                });

                                if (!challenge) continue;

                                let shouldIncrement = false;

                                // Check challenge type
                                if (challenge.type === 'pr-merge') {
                                    shouldIncrement = true;
                                } else if (challenge.type === 'okr-label') {
                                    // Check if PR labels match challenge filters
                                    const prLabels = pr.labels || [];
                                    shouldIncrement = checkLabelMatch(prLabels, challenge.labelFilters);
                                }

                                if (shouldIncrement) {
                                    await updateChallengeProgress(username, challenge.id, 1);
                                }
                            }
                        }

                        // Check and award achievements
                        await checkAndAwardAchievements(contributor);
                    }  // End if (contributor)
                }  // End if (merged)
            } catch (gamificationError) {
                console.error('Gamification error for PR:', pr.number, gamificationError);
                // Don't fail the whole process if gamification fails
            }

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

                // Gamification: Award review points and check achievements
                try {
                    const reviewer = await prisma.contributor.findUnique({
                        where: { username: reviewUsername },
                        include: {
                            processedReviews: {
                                where: {
                                    reviewId: BigInt(review.id)
                                }
                            },
                            pointsHistory: {
                                orderBy: { timestamp: 'desc' },
                                take: 1
                            },
                            activeChallenges: true,
                            achievements: { select: { achievementId: true } }
                        }
                    });
                    
                    if (reviewer) {
                        // Track processed review to prevent duplicates
                        const alreadyProcessedReview = reviewer.processedReviews && reviewer.processedReviews.length > 0;

                        if (!alreadyProcessedReview) {
                            // Add to processedReviews with contributorId (not username)
                            try {
                                await prisma.processedReview.create({
                                    data: {
                                        contributorId: reviewer.id,
                                        prNumber: BigInt(pr.number),
                                        reviewId: BigInt(review.id),
                                        processedDate: new Date()
                                    }
                                });
                                reviewsAdded++;
                            } catch (createError) {
                                // Handle duplicate key error (P2002) - review was processed by another process
                                if (createError.code === 'P2002') {
                                    console.log(`Review ${review.id} on PR #${pr.number} already processed by another process, skipping gamification to avoid duplicates`);
                                    continue; // Skip gamification for this review to avoid duplicate points
                                }
                                throw createError; // Re-throw other errors
                            }
                        }

                        const award = await awardReviewPoints(reviewer);

                        // Update quarterly stats for review using the awarded points (only if review in current quarter)
                        await updateQuarterlyStats(reviewUsername, {
                            reviews: 1,
                            points: award?.points || 0
                        }, review.submitted_at);

                        // Update challenge progress for reviews
                        if (reviewer.activeChallenges && reviewer.activeChallenges.length > 0) {
                            for (const activeChallenge of reviewer.activeChallenges) {
                                const challenge = await prisma.challenge.findUnique({
                                    where: { id: activeChallenge.challengeId }
                                });
                                if (challenge && challenge.type === 'review') {
                                    await updateChallengeProgress(reviewUsername, challenge.id, 1);
                                }
                            }
                        }

                        await checkAndAwardAchievements(reviewer);
                    }
                } catch (gamificationError) {
                    console.error('Gamification error for review:', review.id, gamificationError);
                }
            }
          }
        }

        // Update metadata
        try {
            let metadata = await prisma.pRMetadata.findUnique({
                where: {
                    repoOwner_repoName: {
                        repoOwner,
                        repoName
                    }
                }
            });

            const fetchHistory = metadata?.fetchHistory || [];
            fetchHistory.push({
                fetchDate: new Date(),
                prRangeFetched: `Auto fetch (${pullRequests.length} PRs processed)`,
                prsAdded,
                reviewsAdded
            });

            // Keep only last 20 fetch history records
            const limitedHistory = fetchHistory.slice(-20);

            await prisma.pRMetadata.upsert({
                where: {
                    repoOwner_repoName: {
                        repoOwner,
                        repoName
                    }
                },
                update: {
                    lastFetchDate: new Date(),
                    fetchHistory: limitedHistory
                },
                create: {
                    repoOwner,
                    repoName,
                    lastFetchDate: new Date(),
                    fetchHistory: limitedHistory
                }
            });

            console.log(`Updated metadata: ${prsAdded} PRs, ${reviewsAdded} reviews added`);
        } catch (metadataError) {
            console.error('Error updating metadata:', metadataError);
            // Don't fail the whole operation if metadata update fails
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

            contributors = await prisma.contributor.findMany();
        

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
                badgeAwarded = '10 PR badge';
                badgeImage = '10_prs_badge.png';
                contributor.first10PrsAwarded = true;
            } else if (contributor.reviewCount >= 10 && !contributor.first10ReviewsAwarded) {
                badgeAwarded = '10 Reviews badge';
                badgeImage = '10_reviews_badge.png';
                contributor.first10ReviewsAwarded = true;
            } else if (contributor.prCount >= 50 && !contributor.first50PrsAwarded) {
                badgeAwarded = '50 PR badge';
                badgeImage = '50_prs_badge.png';
                contributor.first50PrsAwarded = true;
            } else if (contributor.reviewCount >= 50 && !contributor.first50ReviewsAwarded) {
                badgeAwarded = '50 Reviews badge';
                badgeImage = '50_reviews_badge.png';
                contributor.first50ReviewsAwarded = true;
            } else if (contributor.prCount >= 100 && !contributor.first100PrsAwarded) {
                badgeAwarded = '100 PR badge';
                badgeImage = '100_prs_badge.png';
                contributor.first100PrsAwarded = true;
            } else if (contributor.reviewCount >= 100 && !contributor.first100ReviewsAwarded) {
                badgeAwarded = '100 Reviews badge';
                badgeImage = '100_reviews_badge.png';
                contributor.first100ReviewsAwarded = true;
            } else if (contributor.prCount >= 500 && !contributor.first500PrsAwarded) {
                badgeAwarded = '500 PR badge';
                badgeImage = '500_prs_badge.png';
                contributor.first500PrsAwarded = true;
            } else if (contributor.reviewCount >= 500 && !contributor.first500ReviewsAwarded) {
                badgeAwarded = '500 Reviews badge';
                badgeImage = '500_reviews_badge.png';
                contributor.first500ReviewsAwarded = true;
            } else if (contributor.prCount >= 1000 && !contributor.first1000PrsAwarded) {
                badgeAwarded = '1000 PR badge';
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

                // Emit socket event for badge notification
                emitBadgeAwarded({
                    username: contributor.username,
                    badgeName: badgeAwarded,
                    badgeType: 'achievement'
                });


                    const badges = contributor.badges || [];
                    badges.push({ badge: badgeAwarded, date: new Date().toISOString() });
                    await prisma.contributor.update({
                        where: { username: contributor.username },
                        data: {
                            badges,
                            firstPrAwarded: contributor.firstPrAwarded,
                            firstReviewAwarded: contributor.firstReviewAwarded,
                            first10PrsAwarded: contributor.first10PrsAwarded,
                            first10ReviewsAwarded: contributor.first10ReviewsAwarded,
                            first50PrsAwarded: contributor.first50PrsAwarded,
                            first50ReviewsAwarded: contributor.first50ReviewsAwarded,
                            first100PrsAwarded: contributor.first100PrsAwarded,
                            first100ReviewsAwarded: contributor.first100ReviewsAwarded,
                            first500PrsAwarded: contributor.first500PrsAwarded,
                            first500ReviewsAwarded: contributor.first500ReviewsAwarded,
                            first1000PrsAwarded: contributor.first1000PrsAwarded,
                            first1000ReviewsAwarded: contributor.first1000ReviewsAwarded
                        }
                    });
                
            }
        }
    } catch (err) {
        console.error('Error awarding badges', err); // Log any errors
    }
    return results;
};

export const getTopContributorsDateRange = async (startDate, endDate, page, limit) => {
    // Get contributors with their contributions in the date range
    const contributors = await prisma.contributor.findMany({
        where: {
            username: {
                not: {
                    endsWith: '[bot]'
                }
            }
        },
        select: {
            username: true,
            avatarUrl: true,
            badges: true,
            totalBillsAwarded: true,
            contributions: {
                where: {
                    date: {
                        gte: startDate,
                        lte: endDate
                    },
                    merged: true
                }
            }
        }
    });

    // Calculate total PR count for each contributor in the date range
    const contributorsWithCounts = contributors.map(contributor => {
        const totalPrCount = contributor.contributions.reduce((total, contribution) => {
            return total + contribution.count;
        }, 0);
        
        return { 
            username: contributor.username,
            avatarUrl: contributor.avatarUrl,
            badges: contributor.badges,
            totalBillsAwarded: Number(contributor.totalBillsAwarded || 0),
            totalPrCount
        };
    });

    // Filter out contributors with 0 PRs and sort by totalPrCount
    const sortedContributors = contributorsWithCounts
        .filter(c => c.totalPrCount > 0)
        .sort((a, b) => b.totalPrCount - a.totalPrCount);

    // Apply pagination
    const paginatedContributors = sortedContributors.slice((page - 1) * limit, page * limit);

    // Calculate total pull requests in the given date range
    const totalPullRequests = sortedContributors.reduce((total, contributor) => {
        return total + contributor.totalPrCount;
    }, 0);

    return { contributors: paginatedContributors, totalPullRequests };
};

export const getTopReviewersDateRange = async (startDate, endDate, page, limit) => {
    // Get reviewers with their reviews in the date range
    const reviewers = await prisma.contributor.findMany({
        where: {
            username: {
                not: {
                    endsWith: '[bot]'
                }
            }
        },
        select: {
            username: true,
            avatarUrl: true,
            badges: true,
            totalBillsAwarded: true,
            reviews: {
                where: {
                    date: {
                        gte: startDate,
                        lte: endDate
                    }
                }
            }
        }
    });

    // Calculate total review count for each reviewer in the date range
    const reviewersWithCounts = reviewers.map(reviewer => {
        const totalReviewCount = reviewer.reviews.reduce((total, review) => {
            return total + review.count;
        }, 0);
        
        return { 
            username: reviewer.username,
            avatarUrl: reviewer.avatarUrl,
            badges: reviewer.badges,
            totalBillsAwarded: Number(reviewer.totalBillsAwarded || 0),
            totalReviewCount
        };
    });

    // Filter out reviewers with 0 reviews and sort by totalReviewCount
    const sortedReviewers = reviewersWithCounts
        .filter(r => r.totalReviewCount > 0)
        .sort((a, b) => b.totalReviewCount - a.totalReviewCount);

    // Apply pagination
    const paginatedReviewers = sortedReviewers.slice((page - 1) * limit, page * limit);

    // Calculate total reviews in the given date range
    const totalReviews = sortedReviewers.reduce((total, reviewer) => {
        return total + reviewer.totalReviewCount;
    }, 0);

    return { reviewers: paginatedReviewers, totalReviews };
};

// Get the top contributors based on PR count with gamification data
export const getTopContributors = async () => {
    let contributors;

        contributors = await prisma.contributor.findMany({
            where: {
                username: {
                    not: {
                        endsWith: '[bot]'
                    }
                }
            },
            orderBy: {
                prCount: 'desc'
            },
            take: 50,
            select: {
                username: true,
                prCount: true,
                reviewCount: true,
                avatarUrl: true,
                badges: true,
                totalBillsAwarded: true,
                totalPoints: true,
                currentStreak: true,
                longestStreak: true,
                sevenDayBadge: true,
                thirtyDayBadge: true,
                ninetyDayBadge: true,
                yearLongBadge: true
            }
        });
        
        contributors = contributors.map(c => ({
            ...c,
            prCount: Number(c.prCount),
            reviewCount: Number(c.reviewCount),
            totalBillsAwarded: Number(c.totalBillsAwarded),
            totalPoints: Number(c.totalPoints),
            currentStreak: Number(c.currentStreak),
            longestStreak: Number(c.longestStreak)
        }));
    
    return contributors;
};

// Get the top reviewers based on review count with gamification data
export const getTopReviewers = async () => {
    let reviewers;

        reviewers = await prisma.contributor.findMany({
            where: {
                username: {
                    not: {
                        endsWith: '[bot]'
                    }
                }
            },
            orderBy: {
                reviewCount: 'desc'
            },
            take: 50,
            select: {
                username: true,
                prCount: true,
                reviewCount: true,
                avatarUrl: true,
                badges: true,
                totalBillsAwarded: true,
                totalPoints: true,
                currentStreak: true,
                longestStreak: true,
                sevenDayBadge: true,
                thirtyDayBadge: true,
                ninetyDayBadge: true,
                yearLongBadge: true
            }
        });
        
        reviewers = reviewers.map(r => ({
            ...r,
            prCount: Number(r.prCount),
            reviewCount: Number(r.reviewCount),
            totalBillsAwarded: Number(r.totalBillsAwarded),
            totalPoints: Number(r.totalPoints),
            currentStreak: Number(r.currentStreak),
            longestStreak: Number(r.longestStreak)
        }));
    
    return reviewers;
};

// Get a single contributor by username
export const getContributorByUsername = async (username) => {

        const contributor = await prisma.contributor.findUnique({
            where: { username }
        });
        
        if (!contributor) return null;
        
        return {
            ...contributor,
            prCount: Number(contributor.prCount),
            reviewCount: Number(contributor.reviewCount),
            totalPoints: Number(contributor.totalPoints),
            currentStreak: Number(contributor.currentStreak),
            longestStreak: Number(contributor.longestStreak),
            totalBillsAwarded: Number(contributor.totalBillsAwarded)
        };
    
};

// Award bills and vonettes to contributors based on their contributions
export const awardBillsAndVonettes = async (pullRequestNumber = null, test = false) => {
    const results = [];
    try {
        let contributors;

            contributors = await prisma.contributor.findMany();
        

        for (const contributor of contributors) {
            if (/\[bot\]$/.test(contributor.username)) {
                continue; // Skip bot users
            }

            // Convert BigInt to Number for comparisons
            const prCount = Number(contributor.prCount);
            const reviewCount = Number(contributor.reviewCount);
            const totalBillsAwarded = Number(contributor.totalBillsAwarded || 0);

            let billsAwarded = null;
            let billsImage = null;
            let billsValue = 0;
            let hasMilestone = false;

            // Check for Vonette first (highest priority)
            if ((prCount >= 500 && !contributor.first500PrsAwarded) || (reviewCount >= 500 && !contributor.first500ReviewsAwarded)) {
                billsAwarded = 'Vonette';
                billsImage = '5_vonett_57_25.png';
                billsValue = 5;
                hasMilestone = true;
                if (prCount >= 500) contributor.first500PrsAwarded = true;
                if (reviewCount >= 500) contributor.first500ReviewsAwarded = true;
            }
            // Check for initial Bill milestones (10 PRs or 10 reviews) - only award once
            else if ((prCount >= 10 && !contributor.first10PrsAwarded) || (reviewCount >= 10 && !contributor.first10ReviewsAwarded)) {
                // Only award if they haven't received ANY initial milestone bill yet
                if (totalBillsAwarded === 0) {
                    billsAwarded = 'Bill';
                    billsImage = '1_bill_57X27.png';
                    billsValue = 1;
                    hasMilestone = true;
                    if (prCount >= 10) contributor.first10PrsAwarded = true;
                    if (reviewCount >= 10) contributor.first10ReviewsAwarded = true;
                }
            }

            // Check for incremental bills (every 100 total contributions)
            // Only award incremental if NO milestone was awarded
            if (!hasMilestone) {
                const totalContributions = prCount + reviewCount;
                const newBills = Math.floor(totalContributions / 100) - totalBillsAwarded;

                if (newBills > 0) {
                    billsAwarded = 'Bill';
                    billsImage = '1_bill_57X27.png';
                    billsValue = newBills;
                }
            }

            if (billsValue > 0) {
                // Log the awarded bills and vonettes
                console.log(`🎉 Congratulations @${contributor.username}, you've earned ${billsValue} ${billsAwarded}(s)! 🎉\n\n![${billsAwarded}](${domain}/images/${billsImage})`);

                results.push({ username: contributor.username, bills: billsAwarded, billsImage: billsImage });

                // Update database
                await prisma.contributor.update({
                    where: { username: contributor.username },
                    data: {
                        totalBillsAwarded: {
                            increment: billsValue
                        },
                        first10PrsAwarded: contributor.first10PrsAwarded,
                        first10ReviewsAwarded: contributor.first10ReviewsAwarded,
                        first500PrsAwarded: contributor.first500PrsAwarded,
                        first500ReviewsAwarded: contributor.first500ReviewsAwarded
                    }
                });

                // Post comment to GitHub if enabled
                await postBillsComment(contributor, billsAwarded, billsValue, billsImage);
            }
        }
    } catch (err) {
        console.error('Error awarding Bills and Vonettes', err); // Log any errors
    }
    return results;
};

/**
 * Post bills/vonettes notification as GitHub comment
 * @param {Object} contributor - Contributor document
 * @param {String} billType - 'Bill' or 'Vonette'
 * @param {Number} billValue - Number of bills/vonettes awarded
 * @param {String} billImage - Image filename
 */
async function postBillsComment(contributor, billType, billValue, billImage) {
    try {
        // Check if bills comments are enabled in settings
        const settings = await prisma.quarterSettings.findUnique({
            where: { id: 'quarter-config' }
        });

        if (!settings?.enableBillsComments) {
            console.log('Bills comments disabled in settings');
            return;
        }

        // Get repo config
        const owner = process.env.REPO_OWNER || process.env.GITHUB_OWNER;
        const repo = process.env.REPO_NAME || process.env.GITHUB_REPO;

        // Skip if owner/repo not configured
        if (!owner || !repo) {
            console.log('Skipping bills comment - REPO_OWNER/REPO_NAME not configured');
            return;
        }

        // Find the most recent PR by this contributor
        const { data: prs } = await octokit.pulls.list({
            owner,
            repo,
            state: 'all',
            per_page: 10,
            sort: 'updated',
            direction: 'desc'
        });

        const userPR = prs.find(pr => pr.user.login === contributor.username);

        if (userPR) {
            const imageUrl = `${domain}/images/${billImage}`;
            const pluralType = billValue > 1 ? `${billType}s` : billType;
            
            const comment = `💵 **${billType} Awarded!**

Congratulations @${contributor.username}! You've earned **${billValue} ${pluralType}**! 🎉

![${billType}](${imageUrl})

Keep up the excellent work! Your contributions make a difference! 🌟`;

            await octokit.issues.createComment({
                owner,
                repo,
                issue_number: userPR.number,
                body: comment
            });

            console.log(`Bills comment posted for ${contributor.username} on PR #${userPR.number}`);
        } else {
            console.log(`No recent PR found for ${contributor.username} to post bills comment`);
        }
    } catch (error) {
        // Don't throw - this is a nice-to-have feature
        console.log(`Could not post bills comment for ${contributor.username}: ${error.message}`);
    }
}

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

/**
 * Get PR fetch range information and database statistics
 * @returns {Object} PR metadata and statistics
 */
export async function getPRRangeInfo() {
    try {
        // Get or create metadata record
        let metadata = await prisma.pRMetadata.findUnique({
            where: {
                repoOwner_repoName: {
                    repoOwner: repoOwner,
                    repoName: repoName
                }
            }
        });

        // Calculate statistics from contributor data
        const contributors = await prisma.contributor.findMany({
            include: {
                processedPRs: true,
                contributions: true
            }
        });

        let totalPRs = 0;
        let totalReviews = 0;
        let oldestDate = null;
        let newestDate = null;
        let allPRNumbers = new Set();

        contributors.forEach(contributor => {
            // Convert BigInt to Number for addition
            totalPRs += Number(contributor.prCount || 0n);
            totalReviews += Number(contributor.reviewCount || 0n);

            // Collect PR numbers from processed PRs
            if (contributor.processedPRs) {
                contributor.processedPRs.forEach(pr => {
                    allPRNumbers.add(pr.prNumber);
                });
            }

            // Find date ranges from contribution history (now a relation, not JSON array)
            if (contributor.contributions && Array.isArray(contributor.contributions) && contributor.contributions.length > 0) {
                contributor.contributions.forEach(contrib => {
                    const contribDate = new Date(contrib.date);
                    if (!oldestDate || contribDate < oldestDate) {
                        oldestDate = contribDate;
                    }
                    if (!newestDate || contribDate > newestDate) {
                        newestDate = contribDate;
                    }
                });
            }
        });

        // Calculate PR range from collected numbers (convert BigInt to Number for sorting)
        const prNumbers = Array.from(allPRNumbers).map(n => Number(n)).sort((a, b) => a - b);
        const firstPR = prNumbers.length > 0 ? prNumbers[0] : null;
        const latestPR = prNumbers.length > 0 ? prNumbers[prNumbers.length - 1] : null;

        // Update or create metadata using Prisma
        metadata = await prisma.pRMetadata.upsert({
            where: {
                repoOwner_repoName: {
                    repoOwner: repoOwner,
                    repoName: repoName
                }
            },
            update: {
                firstPRFetched: firstPR,
                latestPRFetched: latestPR,
                totalPRsInDB: prNumbers.length,
                dateRangeStart: oldestDate,
                dateRangeEnd: newestDate,
                lastFetchDate: new Date()
            },
            create: {
                repoOwner: repoOwner,
                repoName: repoName,
                firstPRFetched: firstPR,
                latestPRFetched: latestPR,
                totalPRsInDB: prNumbers.length,
                dateRangeStart: oldestDate,
                dateRangeEnd: newestDate,
                lastFetchDate: new Date()
            }
        });

        return {
            firstPR: metadata.firstPRFetched,
            latestPR: metadata.latestPRFetched,
            totalPRs: totalPRs, // Total PR count across all contributors
            uniquePRs: metadata.totalPRsInDB, // Unique PR numbers tracked
            totalReviews: totalReviews,
            dateRange: {
                start: metadata.dateRangeStart,
                end: metadata.dateRangeEnd
            },
            lastFetch: metadata.lastFetchDate,
            fetchHistory: [] // Fetch history not tracked in new schema
        };
    } catch (error) {
        console.error('Error getting PR range info:', error);
        throw error;
    }
}

/**
 * Check for duplicate PRs in the database
 * @returns {Object} Duplicate detection results
 */
export async function checkForDuplicates() {
    try {
        const contributors = await prisma.contributor.findMany({
            include: {
                processedPRs: true,
                processedReviews: true
            }
        });

        const duplicates = {
            hasDuplicates: false,
            duplicateCount: 0,
            details: [],
            summary: {
                duplicatePRs: 0,
                duplicateReviews: 0,
                affectedContributors: 0
            }
        };

        // Track all PR numbers and their occurrences
        const prOccurrences = new Map(); // prNumber -> [contributors who have it]
        const reviewOccurrences = new Map(); // prNumber_reviewId -> [contributors]

        contributors.forEach(contributor => {
            // Check for duplicate PRs within same contributor
            if (contributor.processedPRs && contributor.processedPRs.length > 0) {
                const prCounts = {};
                contributor.processedPRs.forEach(pr => {
                    const prNum = pr.prNumber;
                    prCounts[prNum] = (prCounts[prNum] || 0) + 1;

                    // Track across contributors
                    if (!prOccurrences.has(prNum)) {
                        prOccurrences.set(prNum, []);
                    }
                    prOccurrences.get(prNum).push({
                        username: contributor.username,
                        action: pr.action,
                        date: pr.processedDate
                    });
                });

                // Find duplicates within contributor
                Object.entries(prCounts).forEach(([prNum, count]) => {
                    if (count > 1) {
                        duplicates.hasDuplicates = true;
                        duplicates.duplicateCount++;
                        duplicates.details.push({
                            type: 'PR',
                            prNumber: parseInt(prNum),
                            contributor: contributor.username,
                            occurrences: count,
                            issue: `PR #${prNum} counted ${count} times for ${contributor.username}`
                        });
                    }
                });
            }

            // Check for duplicate reviews
            if (contributor.processedReviews && contributor.processedReviews.length > 0) {
                const reviewCounts = {};
                contributor.processedReviews.forEach(review => {
                    const key = `${review.prNumber}_${review.reviewId}`;
                    reviewCounts[key] = (reviewCounts[key] || 0) + 1;

                    if (!reviewOccurrences.has(key)) {
                        reviewOccurrences.set(key, []);
                    }
                    reviewOccurrences.get(key).push({
                        username: contributor.username,
                        date: review.processedDate
                    });
                });

                Object.entries(reviewCounts).forEach(([key, count]) => {
                    if (count > 1) {
                        duplicates.hasDuplicates = true;
                        duplicates.duplicateCount++;
                        const [prNum, reviewId] = key.split('_');
                        duplicates.details.push({
                            type: 'Review',
                            prNumber: parseInt(prNum),
                            reviewId: parseInt(reviewId),
                            contributor: contributor.username,
                            occurrences: count,
                            issue: `Review #${reviewId} on PR #${prNum} counted ${count} times for ${contributor.username}`
                        });
                    }
                });
            }

            // Check if prCount matches processedPRs length
            const processedCount = contributor.processedPRs ? contributor.processedPRs.length : 0;
            if (Number(contributor.prCount) !== processedCount) {
                duplicates.hasDuplicates = true;
                duplicates.details.push({
                    type: 'Mismatch',
                    contributor: contributor.username,
                    totalPRs: Number(contributor.prCount),
                    processedPRs: processedCount,
                    difference: Math.abs(Number(contributor.prCount) - processedCount),
                    issue: `prCount (${contributor.prCount}) doesn't match processedPRs length (${processedCount})`
                });
            }

            // Check if reviewCount matches processedReviews length
            const processedReviewCount = contributor.processedReviews ? contributor.processedReviews.length : 0;
            if (Number(contributor.reviewCount) !== processedReviewCount) {
                duplicates.hasDuplicates = true;
                duplicates.details.push({
                    type: 'Mismatch',
                    contributor: contributor.username,
                    totalReviews: Number(contributor.reviewCount),
                    processedReviews: processedReviewCount,
                    difference: Math.abs(Number(contributor.reviewCount) - processedReviewCount),
                    issue: `reviewCount (${contributor.reviewCount}) doesn't match processedReviews length (${processedReviewCount})`
                });
            }
        });

        // Calculate summary
        duplicates.summary.duplicatePRs = duplicates.details.filter(d => d.type === 'PR').length;
        duplicates.summary.duplicateReviews = duplicates.details.filter(d => d.type === 'Review').length;
        duplicates.summary.mismatches = duplicates.details.filter(d => d.type === 'Mismatch').length;
        duplicates.summary.affectedContributors = new Set(duplicates.details.map(d => d.contributor)).size;

        return duplicates;
    } catch (error) {
        console.error('Error checking for duplicates:', error);
        throw error;
    }
}

/**
 * Fix duplicates by correcting counts and removing duplicate entries
 * Returns statistics about what was fixed
 */
export async function fixDuplicates() {
    try {
        const contributors = await prisma.contributor.findMany({
            include: {
                processedPRs: true,
                processedReviews: true
            }
        });

        const stats = {
            contributorsFixed: 0,
            prCountAdjustments: 0,
            reviewCountAdjustments: 0,
            duplicatePRsRemoved: 0,
            duplicateReviewsRemoved: 0
        };

        for (const contributor of contributors) {
            let updateData = {};
            let needsUpdate = false;
            const processedPRCount = contributor.processedPRs?.length || 0;
            const processedReviewCount = contributor.processedReviews?.length || 0;

            // FIX 1: Correct PR count mismatch
            if (Number(contributor.prCount) !== processedPRCount) {
                const diff = Math.abs(Number(contributor.prCount) - processedPRCount);
                updateData.prCount = processedPRCount;
                stats.prCountAdjustments += diff;
                needsUpdate = true;
            }

            // FIX 2: Correct review count mismatch
            if (Number(contributor.reviewCount) !== processedReviewCount) {
                const diff = Math.abs(Number(contributor.reviewCount) - processedReviewCount);
                updateData.reviewCount = processedReviewCount;
                stats.reviewCountAdjustments += diff;
                needsUpdate = true;
            }

            // FIX 3: Remove duplicate PRs from processedPRs array
            const prsToDelete = [];
            if (contributor.processedPRs && contributor.processedPRs.length > 0) {
                const seen = new Set();

                for (const pr of contributor.processedPRs) {
                    const key = `${pr.prNumber}_${pr.action}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                    } else {
                        prsToDelete.push(pr.id);
                        stats.duplicatePRsRemoved++;
                        needsUpdate = true;
                    }
                }
            }

            // FIX 4: Remove duplicate reviews from processedReviews array
            const reviewsToDelete = [];
            if (contributor.processedReviews && contributor.processedReviews.length > 0) {
                const seen = new Set();

                for (const review of contributor.processedReviews) {
                    const key = `${review.prNumber}_${review.reviewId}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                    } else {
                        reviewsToDelete.push(review.id);
                        stats.duplicateReviewsRemoved++;
                        needsUpdate = true;
                    }
                }
            }

            // Apply updates
            if (needsUpdate) {
                // Delete duplicate PRs and reviews
                if (prsToDelete.length > 0) {
                    await prisma.processedPR.deleteMany({
                        where: {
                            id: { in: prsToDelete }
                        }
                    });
                }
                if (reviewsToDelete.length > 0) {
                    await prisma.processedReview.deleteMany({
                        where: {
                            id: { in: reviewsToDelete }
                        }
                    });
                }
                
                // Update contributor counts if needed
                if (Object.keys(updateData).length > 0) {
                    await prisma.contributor.update({
                        where: { username: contributor.username },
                        data: updateData
                    });
                }
                
                stats.contributorsFixed++;
            }
        }

        console.log('Duplicate fix complete:', stats);
        return stats;
    } catch (error) {
        console.error('Error fixing duplicates:', error);
        throw error;
    }
}