import { Octokit } from '@octokit/rest';
import Contributor from '../models/contributor.js';
import { getSocketIO } from '../utils/socketEmitter.js';
import logger from '../utils/logger.js';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const repoOwner = process.env.REPO_OWNER || 'CruGlobal';
const repoName = process.env.REPO_NAME || 'android';

// Backfill state
let backfillState = {
    isRunning: false,
    shouldStop: false,
    progress: {
        status: 'idle',
        totalPRs: 0,
        processedPRs: 0,
        processedReviews: 0,
        currentPR: null,
        rateLimit: 5000,
        rateLimitReset: null,
        startTime: null,
        endTime: null
    }
};

/**
 * Get current backfill status
 */
export function getBackfillStatus() {
    return {
        isRunning: backfillState.isRunning,
        progress: { ...backfillState.progress }
    };
}

/**
 * Stop the backfill process
 */
export function stopBackfill() {
    if (backfillState.isRunning) {
        backfillState.shouldStop = true;
        logger.info('Backfill stop requested');
        return { success: true, message: 'Backfill will stop after current PR' };
    }
    return { success: false, message: 'No backfill is currently running' };
}

/**
 * Check GitHub rate limit
 */
async function checkRateLimit() {
    try {
        const { data } = await octokit.rateLimit.get();
        const remaining = data.rate.remaining;
        const resetTime = new Date(data.rate.reset * 1000);

        backfillState.progress.rateLimit = remaining;
        backfillState.progress.rateLimitReset = resetTime;

        return { remaining, resetTime };
    } catch (error) {
        logger.error('Error checking rate limit:', error);
        return { remaining: 0, resetTime: new Date() };
    }
}

/**
 * Wait until rate limit resets
 */
async function waitForRateLimit(resetTime) {
    const now = new Date();
    const waitTime = resetTime - now;

    if (waitTime > 0) {
        const minutes = Math.ceil(waitTime / 60000);
        logger.info(`Rate limit reached. Waiting ${minutes} minutes until reset...`);

        backfillState.progress.status = `Waiting for rate limit reset (${minutes}m)`;
        emitBackfillProgress();

        await new Promise(resolve => setTimeout(resolve, waitTime + 5000)); // Add 5s buffer
    }
}

/**
 * Emit progress update via WebSocket
 */
function emitBackfillProgress() {
    const io = getSocketIO();
    if (!io) return;

    const progress = { ...backfillState.progress };

    // Calculate ETA
    if (progress.startTime && progress.processedPRs > 0) {
        const elapsed = Date.now() - progress.startTime;
        const rate = progress.processedPRs / elapsed; // PRs per ms
        const remaining = progress.totalPRs - progress.processedPRs;
        const etaMs = remaining / rate;
        const etaMinutes = Math.ceil(etaMs / 60000);
        progress.eta = `${etaMinutes} minutes`;
    } else {
        progress.eta = 'Calculating...';
    }

    // Calculate percentage
    progress.percentage = progress.totalPRs > 0
        ? Math.floor((progress.processedPRs / progress.totalPRs) * 100)
        : 0;

    io.to('scoreboard-updates').emit('backfill-progress', progress);
}

/**
 * Process a single PR
 */
async function processPR(pr) {
    try {
        const username = pr.user.login;
        let prAdded = 0;
        let reviewsAdded = 0;

        // Find or create contributor
        let contributor = await Contributor.findOne({ username });
        if (!contributor) {
            contributor = new Contributor({
                username,
                avatarUrl: pr.user.avatar_url,
                prCount: 0,
                reviewCount: 0,
                contributions: [],
                reviews: [],
                processedPRs: [],
                processedReviews: []
            });
        }

        // Check if PR already processed (duplicate prevention for PR)
        const prAlreadyProcessed = contributor.processedPRs?.some(p => p.prNumber === pr.number);

        if (!prAlreadyProcessed) {
            // Add PR to contributions
            contributor.prCount += 1;
            contributor.contributions.push({
                date: pr.merged_at,
                merged: true
            });

            // Track in processedPRs
            if (!contributor.processedPRs) {
                contributor.processedPRs = [];
            }
            contributor.processedPRs.push({
                prNumber: pr.number,
                prTitle: pr.title,
                processedDate: pr.merged_at,
                action: 'authored'
            });

            prAdded = 1;
            logger.debug(`Added PR #${pr.number} for ${username}`);
        } else {
            logger.debug(`PR #${pr.number} already processed for ${username}, but checking reviews...`);
        }

        // ALWAYS fetch and process reviews, even if PR was already processed
        // (Reviews might not have been backfilled yet)
        try {
            const { data: reviews } = await octokit.pulls.listReviews({
                owner: repoOwner,
                repo: repoName,
                pull_number: pr.number
            });

            for (const review of reviews) {
                if (review.state === 'APPROVED' || review.state === 'COMMENTED') {
                    const reviewerUsername = review.user.login;

                    let reviewer = await Contributor.findOne({ username: reviewerUsername });
                    if (!reviewer) {
                        reviewer = new Contributor({
                            username: reviewerUsername,
                            avatarUrl: review.user.avatar_url,
                            prCount: 0,
                            reviewCount: 0,
                            reviews: [],
                            processedReviews: []
                        });
                    }

                    // Check if review already processed
                    const reviewAlreadyProcessed = reviewer.processedReviews?.some(r => r.reviewId === review.id);
                    if (!reviewAlreadyProcessed) {
                        reviewer.reviewCount += 1;

                        // Add to reviews array (matches schema: date + count)
                        reviewer.reviews.push({
                            date: review.submitted_at,
                            count: 1
                        });

                        // Track in processedReviews for duplicate prevention
                        if (!reviewer.processedReviews) {
                            reviewer.processedReviews = [];
                        }
                        reviewer.processedReviews.push({
                            reviewId: review.id,
                            prNumber: pr.number,
                            processedDate: review.submitted_at
                        });

                        await reviewer.save();
                        reviewsAdded++;

                        logger.debug(`Added review by ${reviewerUsername} on PR #${pr.number}`);
                    }
                }
            }
        } catch (reviewError) {
            logger.error(`Error fetching reviews for PR #${pr.number}:`, reviewError.message);
        }

        // Save contributor if PR was added
        if (prAdded > 0) {
            await contributor.save();
        }

        return { prAdded, reviewsAdded, skipped: prAdded === 0 && reviewsAdded === 0 };

    } catch (error) {
        logger.error(`Error processing PR #${pr.number}:`, error);
        return { error: error.message };
    }
}

/**
 * Start historical data backfill
 * @param {String} startDate - ISO date string
 * @param {String} endDate - ISO date string
 * @param {Boolean} checkRateLimits - Whether to respect rate limits
 */
export async function startBackfill(startDate, endDate, checkRateLimits = true) {
    if (backfillState.isRunning) {
        return { success: false, message: 'Backfill is already running' };
    }

    backfillState.isRunning = true;
    backfillState.shouldStop = false;
    backfillState.progress = {
        status: 'Initializing...',
        totalPRs: 0,
        processedPRs: 0,
        processedReviews: 0,
        currentPR: null,
        rateLimit: 5000,
        rateLimitReset: null,
        startTime: Date.now(),
        endTime: null
    };

    logger.info(`Starting backfill from ${startDate} to ${endDate}`);

    try {
        // Check initial rate limit
        if (checkRateLimits) {
            const rateLimit = await checkRateLimit();
            if (rateLimit.remaining < 100) {
                await waitForRateLimit(rateLimit.resetTime);
            }
        }

        // Fetch PRs in pages
        let page = 1;
        const perPage = 100;
        let totalPRsFound = 0;
        let totalPRsProcessed = 0;
        let totalReviewsProcessed = 0;

        backfillState.progress.status = 'Counting PRs...';
        emitBackfillProgress();

        // First pass: count total PRs to process
        let hasMore = true;
        while (hasMore) {
            const { data: prs } = await octokit.pulls.list({
                owner: repoOwner,
                repo: repoName,
                state: 'closed',
                sort: 'updated',
                direction: 'desc',
                per_page: perPage,
                page
            });

            if (prs.length === 0) {
                hasMore = false;
                break;
            }

            // Filter by date range and merged status
            const filteredPRs = prs.filter(pr => {
                if (!pr.merged_at) return false;
                const mergedDate = new Date(pr.merged_at);
                const start = new Date(startDate);
                const end = new Date(endDate);
                return mergedDate >= start && mergedDate <= end;
            });

            totalPRsFound += filteredPRs.length;

            // If we've gone past the start date, we can stop counting
            const oldestPR = prs[prs.length - 1];
            if (oldestPR.merged_at && new Date(oldestPR.merged_at) < new Date(startDate)) {
                hasMore = false;
            }

            page++;

            if (checkRateLimits && page % 10 === 0) {
                const rateLimit = await checkRateLimit();
                if (rateLimit.remaining < 100) {
                    await waitForRateLimit(rateLimit.resetTime);
                }
            }
        }

        backfillState.progress.totalPRs = totalPRsFound;
        logger.info(`Found ${totalPRsFound} PRs to process`);

        // Second pass: process PRs
        page = 1;
        hasMore = true;

        while (hasMore && !backfillState.shouldStop) {
            backfillState.progress.status = `Fetching page ${page}...`;
            emitBackfillProgress();

            const { data: prs } = await octokit.pulls.list({
                owner: repoOwner,
                repo: repoName,
                state: 'closed',
                sort: 'updated',
                direction: 'desc',
                per_page: perPage,
                page
            });

            if (prs.length === 0) {
                hasMore = false;
                break;
            }

            // Filter and process PRs
            const filteredPRs = prs.filter(pr => {
                if (!pr.merged_at) return false;
                const mergedDate = new Date(pr.merged_at);
                const start = new Date(startDate);
                const end = new Date(endDate);
                return mergedDate >= start && mergedDate <= end;
            });

            for (const pr of filteredPRs) {
                if (backfillState.shouldStop) break;

                backfillState.progress.currentPR = pr.number;
                backfillState.progress.status = `Processing PR #${pr.number}...`;
                emitBackfillProgress();

                const result = await processPR(pr);

                // Count PRs and reviews separately (reviews can be added even if PR is duplicate)
                totalPRsProcessed += result.prAdded || 0;
                totalReviewsProcessed += result.reviewsAdded || 0;

                backfillState.progress.processedPRs++;
                backfillState.progress.processedReviews = totalReviewsProcessed;
                emitBackfillProgress();

                // Check rate limit periodically
                if (checkRateLimits && backfillState.progress.processedPRs % 10 === 0) {
                    const rateLimit = await checkRateLimit();
                    if (rateLimit.remaining < 100) {
                        await waitForRateLimit(rateLimit.resetTime);
                    }
                }
            }

            // Check if we've gone past the start date
            const oldestPR = prs[prs.length - 1];
            if (oldestPR.merged_at && new Date(oldestPR.merged_at) < new Date(startDate)) {
                hasMore = false;
            }

            page++;
        }

        // Complete
        backfillState.progress.endTime = Date.now();
        backfillState.progress.status = backfillState.shouldStop ? 'Stopped' : 'Completed';
        backfillState.isRunning = false;

        emitBackfillProgress();

        const duration = Math.floor((backfillState.progress.endTime - backfillState.progress.startTime) / 1000);

        logger.info(`Backfill ${backfillState.progress.status.toLowerCase()}. Found ${totalPRsFound} PRs. Added ${totalPRsProcessed} new PRs (${totalPRsFound - totalPRsProcessed} were duplicates). Added ${totalReviewsProcessed} reviews. Duration: ${duration}s`);

        return {
            success: true,
            message: `Backfill ${backfillState.progress.status.toLowerCase()}`,
            stats: {
                totalPRsFound: totalPRsFound,
                newPRs: totalPRsProcessed,
                duplicatePRs: totalPRsFound - totalPRsProcessed,
                totalReviews: totalReviewsProcessed,
                duration: `${Math.floor(duration / 60)}m ${duration % 60}s`
            }
        };

    } catch (error) {
        logger.error('Backfill error:', error);
        backfillState.isRunning = false;
        backfillState.progress.status = 'Error';
        backfillState.progress.error = error.message;
        emitBackfillProgress();

        return {
            success: false,
            message: 'Backfill failed',
            error: error.message
        };
    }
}
