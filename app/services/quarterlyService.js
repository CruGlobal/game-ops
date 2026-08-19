import { prisma } from '../lib/prisma.js';
import { POINT_REASONS, POINT_VALUES } from '../config/points-config.js';
import { emitBillAwarded } from '../utils/socketEmitter.js';
import { postQuarterlyWinnersDiscussion } from './discussionService.js';
import { postQuarterlyWinnersSlack } from './slackService.js';
import { sendTertileWinnerBills } from './billsService.js';

// DevOps participation threshold: contributions (PRs + reviews) needed to earn 1 Bill
const DEVOPS_PARTICIPATION_THRESHOLD = 50;

// Minimum contributions (PRs + reviews) for non-DevOps to qualify as quarterly winner
const NON_DEVOPS_WINNER_THRESHOLD = 10;

// Months per period: tertiles are 3 four-month thirds; everything else is
// standard 3-month quarters.
function periodMonths(systemType) {
    return systemType === 'tertile' ? 4 : 3;
}
// Period label prefix: T1/T2/T3 for tertiles, Q1..Q4 otherwise.
function periodPrefix(systemType) {
    return systemType === 'tertile' ? 'T' : 'Q';
}
// Tertiles are labeled by the calendar year the cycle ENDS in. An Oct-start
// cycle (q1Start>1) crosses the new year, so its label = cycle-start-year + 1.
// Other systems are labeled by their cycle-start year (unchanged).
function tertileYearOffset(systemType, q1Start) {
    return (systemType === 'tertile' && q1Start > 1) ? 1 : 0;
}

/**
 * Get quarter configuration from database
 * @returns {Object} Quarter settings
 */
export async function getQuarterConfig() {
    let config = await prisma.quarterSettings.findUnique({
        where: { id: 'quarter-config' }
    });

    if (!config) {
        try {
            // Create default config (tertiles: T1 Oct, T2 Feb, T3 Jun)
            config = await prisma.quarterSettings.create({
                data: {
                    id: 'quarter-config',
                    systemType: 'tertile',
                    q1StartMonth: 10
                }
            });
            console.log('Created default quarter configuration (tertile)');
        } catch (error) {
            // Handle race condition where config was created by another process
            if (error.code === 'P2002') {
                config = await prisma.quarterSettings.findUnique({
                    where: { id: 'quarter-config' }
                });
            } else {
                throw error;
            }
        }
    }

    return config;
}

/**
 * Calculate current quarter based on configuration
 * @returns {String} e.g., "2025-Q1"
 */
export async function getCurrentQuarter() {
    const config = await getQuarterConfig();
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1; // 1-12

    // Get Q1 start month from config
    const q1Start = config.q1StartMonth;
    const pm = periodMonths(config.systemType);

    // Months elapsed since the configured Q1 start, wrapping across the year so
    // non-calendar configs (fiscal/academic/tertile) compute the right period.
    // e.g. tertile q1Start=10 (Oct): Feb→T2, Jun→T3.
    const monthsSinceQ1 = (currentMonth - q1Start + 12) % 12;
    const quarterNum = Math.floor(monthsSinceQ1 / pm) + 1;

    // Cycle-start year, then apply the tertile end-year offset for the label.
    const cycleStartYear = currentMonth >= q1Start ? currentYear : currentYear - 1;
    const year = cycleStartYear + tertileYearOffset(config.systemType, q1Start);

    return `${year}-${periodPrefix(config.systemType)}${quarterNum}`;
}

/**
 * Get quarter date range based on configuration
 * @param {String} quarterString - e.g., "2025-Q1"
 * @returns {Object} { start: Date, end: Date }
 */
export async function getQuarterDateRange(quarterString) {
    const config = await getQuarterConfig();
    const [yearStr, quarterStr] = quarterString.split('-');
    const labelYear = parseInt(yearStr);
    const quarterNum = parseInt(quarterStr.replace(/\D/g, '')); // tolerate Q or T prefix

    const q1Start = config.q1StartMonth;
    const pm = periodMonths(config.systemType);
    // Undo the tertile end-year offset to get the cycle-start year the month
    // math is built on.
    const year = labelYear - tertileYearOffset(config.systemType, q1Start);

    // Absolute month offset (0-indexed from January of the cycle-start year) of
    // this period's first month: period 1 begins at q1Start, each period adds
    // `pm` months. Dividing by 12 rolls the year forward — so periods that cross
    // January (e.g. q1Start=10) get the correct year.
    const startMonthIndex = (q1Start - 1) + (quarterNum - 1) * pm;
    const startYear = year + Math.floor(startMonthIndex / 12);
    const startMonth0 = startMonthIndex % 12;

    const endMonthIndex = startMonthIndex + (pm - 1);
    const endYear = year + Math.floor(endMonthIndex / 12);
    const endMonth0 = endMonthIndex % 12;

    // Use UTC dates to avoid timezone issues
    const startDate = new Date(Date.UTC(startYear, startMonth0, 1, 0, 0, 0));

    // Day 0 of the month after endMonth0 = last day of endMonth0
    const lastDay = new Date(Date.UTC(endYear, endMonth0 + 1, 0)).getUTCDate();
    const endDate = new Date(Date.UTC(endYear, endMonth0, lastDay, 23, 59, 59));

    return { start: startDate, end: endDate };
}

/**
 * Update quarter configuration
 * @param {String} systemType - 'calendar', 'fiscal-us', 'academic', 'custom'
 * @param {Number} q1StartMonth - 1-12
 * @param {String} modifiedBy - Username
 * @param {Boolean} enableGitHubDiscussions - Whether to post quarterly winner announcements as GitHub Discussions
 * @returns {Object} { config, quarterChanged, oldQuarter, newQuarter }
 */
export async function updateQuarterConfig(systemType, q1StartMonth, modifiedBy, enableGitHubDiscussions = false, enableSlackNotifications = false, slackWebhookUrl = null, enableBillsGifts = false) {
    // Get old config and quarter
    const oldConfig = await getQuarterConfig();
    const oldQuarter = await getCurrentQuarter();

    // Map system types to start months
    const systemMonths = {
        'calendar': 1,    // January
        'fiscal-us': 10,  // October
        'academic': 9,    // September
        'tertile': 10,    // October (T1 Oct–Jan, T2 Feb–May, T3 Jun–Sep)
        'custom': q1StartMonth
    };

    const actualStartMonth = systemMonths[systemType] || q1StartMonth;

    // Update config
    const config = await prisma.quarterSettings.upsert({
        where: { id: 'quarter-config' },
        update: {
            systemType,
            q1StartMonth: actualStartMonth,
            enableGitHubDiscussions,
            enableSlackNotifications,
            slackWebhookUrl,
            enableBillsGifts,
            lastModified: new Date(),
            modifiedBy
        },
        create: {
            id: 'quarter-config',
            systemType,
            q1StartMonth: actualStartMonth,
            enableGitHubDiscussions,
            enableSlackNotifications,
            slackWebhookUrl,
            enableBillsGifts,
            lastModified: new Date(),
            modifiedBy
        }
    });

    // Check if quarter changed
    const newQuarter = await getCurrentQuarter();
    const quarterChanged = oldQuarter !== newQuarter;

    // GUARD: changing the configuration re-slices time — it is NOT a real period
    // rollover. So a config change must never award bills/vonettes, announce
    // winners (Slack/GitHub), or reset stats. (Genuine time-based rollovers are
    // handled by the daily checkAndResetIfNewQuarter cron, which does announce +
    // award.) Here we only rebuild DERIVED data so the leaderboards/Hall of Fame
    // reflect the new periods: recompute the Hall of Fame (past periods) and the
    // current period's stats from point history.
    const definitionChanged = quarterChanged
        || oldConfig.systemType !== systemType
        || oldConfig.q1StartMonth !== actualStartMonth;
    let hallOfFameRecomputed = false;
    if (definitionChanged) {
        console.log(`Quarter config changed (${oldQuarter} -> ${newQuarter}); rebuilding Hall of Fame + current stats (no bills/announce/reset).`);
        try {
            await recomputeHallOfFameAll();
            hallOfFameRecomputed = true;
        } catch (e) {
            console.error('Hall of Fame recompute after config change failed:', e.message);
        }
        try {
            await recomputeCurrentQuarterStats();
        } catch (e) {
            console.error('Current-period stats recompute after config change failed:', e.message);
        }
    }

    return {
        config,
        quarterChanged,
        oldQuarter,
        newQuarter,
        hallOfFameRecomputed
    };
}

/**
 * Archive quarter winners before reset
 * @param {String} quarterString - Optional quarter to archive (defaults to current)
 */
/**
 * Per-contributor totals for a quarter, derived from point_history.
 *
 * point_history is append-only and timestamped, so a quarter's numbers can always be
 * recomputed from it. contributor.quarterlyStats is only a live cache: the per-event
 * path re-initialises it to zeros the moment a contributor's first PR of the NEW
 * quarter lands, which destroyed the closing quarter's figures before anything had
 * archived them. Anything that decides standings therefore reads history, not the cache.
 *
 * @param {string} quarter - quarter label
 * @returns {Promise<Map<string, {prsThisQuarter:number, reviewsThisQuarter:number, pointsThisQuarter:number}>>}
 */
export async function quarterTotalsFromHistory(quarter) {
    const { start, end } = await getQuarterDateRange(quarter);
    const window = { timestamp: { gte: start, lte: end } };

    const [points, prs, reviews] = await Promise.all([
        prisma.pointHistory.groupBy({ by: ['contributorId'], where: window, _sum: { points: true } }),
        prisma.pointHistory.groupBy({ by: ['contributorId'], where: { ...window, reason: POINT_REASONS.PR_MERGED }, _count: { _all: true } }),
        prisma.pointHistory.groupBy({ by: ['contributorId'], where: { ...window, reason: POINT_REASONS.REVIEW_COMPLETED }, _count: { _all: true } })
    ]);

    const totals = new Map();
    const ensure = (id) => {
        const key = String(id);
        if (!totals.has(key)) totals.set(key, { prsThisQuarter: 0, reviewsThisQuarter: 0, pointsThisQuarter: 0 });
        return totals.get(key);
    };
    for (const row of points) ensure(row.contributorId).pointsThisQuarter = Number(row._sum.points || 0n);
    for (const row of prs) ensure(row.contributorId).prsThisQuarter = Number(row._count._all || 0);
    for (const row of reviews) ensure(row.contributorId).reviewsThisQuarter = Number(row._count._all || 0);
    return totals;
}

export async function archiveQuarterWinners(quarterString = null) {
    try {
        const quarter = quarterString || await getCurrentQuarter();
        const quarterDates = await getQuarterDateRange(quarter);
        // Parse label tolerant of Q or T prefix (e.g. 2025-Q1 / 2025-T3)
        const year = quarter.split('-')[0];
        const quarterNum = quarter.split('-')[1].replace(/\D/g, '');

        console.log(`Archiving winners for ${quarter}`);

        // Fetch ALL contributors (we'll split into DevOps vs non-DevOps in memory)
        // Exclude bot accounts (e.g., github-actions[bot])
        const contributorRows = await prisma.contributor.findMany({
            where: {
                username: {
                    not: {
                        endsWith: '[bot]'
                    }
                }
            },
            select: {
                id: true,
                username: true,
                avatarUrl: true,
                isDevOps: true
            }
        });

        // Standings are rebuilt from point_history rather than read off
        // contributor.quarterlyStats. Previously a contributor whose first PR of the new
        // quarter merged before this ran had already had their stats zeroed, so they
        // failed the `currentQuarter !== quarter` filter below and vanished from the
        // archive of the quarter they had just won.
        const quarterTotals = await quarterTotalsFromHistory(quarter);
        const allContributors = contributorRows.map(c => ({
            ...c,
            quarterlyStats: {
                currentQuarter: quarter,
                ...(quarterTotals.get(String(c.id)) || { prsThisQuarter: 0, reviewsThisQuarter: 0, pointsThisQuarter: 0 })
            }
        }));

        // Helper: filter, rank, and build winner data for a set of contributors
        const buildWinnerRecord = (contributors, category, threshold) => {
            const topContributors = contributors
                .filter(c => {
                    if (c.quarterlyStats?.currentQuarter !== quarter) return false;
                    if ((c.quarterlyStats?.pointsThisQuarter || 0) <= 0) return false;
                    const contributions = (c.quarterlyStats?.prsThisQuarter || 0) + (c.quarterlyStats?.reviewsThisQuarter || 0);
                    return contributions >= threshold;
                })
                .sort((a, b) => b.quarterlyStats.pointsThisQuarter - a.quarterlyStats.pointsThisQuarter)
                .slice(0, 3);

            if (topContributors.length === 0) return null;

            const winner = topContributors[0];
            const top3 = topContributors.map((contributor, index) => ({
                rank: index + 1,
                username: contributor.username,
                avatarUrl: contributor.avatarUrl,
                prsThisQuarter: contributor.quarterlyStats.prsThisQuarter,
                reviewsThisQuarter: contributor.quarterlyStats.reviewsThisQuarter,
                pointsThisQuarter: contributor.quarterlyStats.pointsThisQuarter
            }));

            const totalParticipants = contributors.filter(c =>
                c.quarterlyStats?.currentQuarter === quarter &&
                (c.quarterlyStats?.prsThisQuarter > 0 || c.quarterlyStats?.reviewsThisQuarter > 0)
            ).length;

            return {
                category,
                winner: {
                    username: winner.username,
                    avatarUrl: winner.avatarUrl,
                    prsThisQuarter: winner.quarterlyStats.prsThisQuarter,
                    reviewsThisQuarter: winner.quarterlyStats.reviewsThisQuarter,
                    pointsThisQuarter: winner.quarterlyStats.pointsThisQuarter
                },
                top3,
                totalParticipants
            };
        };

        // Build winner records for both categories
        const nonDevOpsContributors = allContributors.filter(c => !c.isDevOps);
        const devOpsContributors = allContributors.filter(c => c.isDevOps);

        const generalRecord = buildWinnerRecord(nonDevOpsContributors, 'general', NON_DEVOPS_WINNER_THRESHOLD);
        const devOpsRecord = buildWinnerRecord(devOpsContributors, 'devops', NON_DEVOPS_WINNER_THRESHOLD);

        const results = [];

        // Upsert each category record
        for (const record of [generalRecord, devOpsRecord]) {
            if (!record) continue;

            const quarterlyWinner = await prisma.quarterlyWinner.upsert({
                where: {
                    quarter_category: { quarter, category: record.category }
                },
                update: {
                    year: parseInt(year),
                    quarterNumber: parseInt(quarterNum),
                    quarterStart: quarterDates.start,
                    quarterEnd: quarterDates.end,
                    winner: record.winner,
                    top3: record.top3,
                    totalParticipants: record.totalParticipants,
                    archivedDate: new Date()
                },
                create: {
                    quarter,
                    category: record.category,
                    year: parseInt(year),
                    quarterNumber: parseInt(quarterNum),
                    quarterStart: quarterDates.start,
                    quarterEnd: quarterDates.end,
                    winner: record.winner,
                    top3: record.top3,
                    totalParticipants: record.totalParticipants,
                    archivedDate: new Date()
                }
            });

            console.log(`Archived ${quarter} ${record.category} winner: ${record.winner.username} with ${record.winner.pointsThisQuarter} points`);
            results.push(quarterlyWinner);
        }

        if (results.length === 0) {
            console.log(`No contributors with points in ${quarter}, skipping archive`);
            return null;
        }

        // Return the general (non-DevOps) winner for backward compatibility
        return results.find(r => r.category === 'general') || results[0];
    } catch (error) {
        console.error('Error archiving quarter winners:', error);
        throw error;
    }
}

/**
 * Reset all contributors' quarterly stats
 * @param {String} newQuarter - New quarter string (e.g., "2025-Q2")
 */
export async function resetQuarterlyStats(newQuarter = null) {
    try {
        const quarter = newQuarter || await getCurrentQuarter();
        const quarterDates = await getQuarterDateRange(quarter);

        console.log(`Resetting quarterly stats for ${quarter}`);

        // Reset only contributors NOT already on the new quarter, in a single
        // atomic updateMany. The stale predicate lives in the WHERE (not a prior
        // read), so a contributor whose PR/review moves them onto the new quarter
        // between here and the write is excluded by Postgres at execution time —
        // no lost update of points that just started accumulating this quarter.
        // (Previously this read stale ids then updated by id, leaving a TOCTOU gap.)
        // allTimePoints is never reset.
        // Every contributor is rewritten, and the figures come from point_history for
        // the new window rather than being blanket-zeroed.
        //
        // The previous WHERE skipped anyone already carrying the new quarter label. A
        // contributor who merged a PR just after the boundary had self-rolled their own
        // JSON, so they were excluded and their totalPoints kept the OLD quarter's
        // balance forever — 3040 while pointsThisQuarter said 40. Zeroing them
        // unconditionally instead would have discarded the 40 they had legitimately
        // earned, so neither a skip nor a blanket zero is right: derive the truth.
        const newQuarterTotals = await quarterTotalsFromHistory(quarter);
        const contributors = await prisma.contributor.findMany({ select: { id: true } });

        let resetCount = 0;
        for (const c of contributors) {
            const earned = newQuarterTotals.get(String(c.id)) ||
                { prsThisQuarter: 0, reviewsThisQuarter: 0, pointsThisQuarter: 0 };
            await prisma.contributor.update({
                where: { id: c.id },
                data: {
                    totalPoints: BigInt(earned.pointsThisQuarter),
                    quarterlyStats: {
                        currentQuarter: quarter,
                        quarterStartDate: quarterDates.start,
                        quarterEndDate: quarterDates.end,
                        ...earned,
                        lastUpdated: new Date()
                    }
                }
            });
            resetCount++;
        }
        const result = { count: resetCount };

        console.log(`Reset quarterly stats and totalPoints for ${result.count} contributors (allTimePoints preserved)`);

        return {
            quarter,
            contributorsReset: result.count,
            quarterStart: quarterDates.start,
            quarterEnd: quarterDates.end
        };
    } catch (error) {
        console.error('Error resetting quarterly stats:', error);
        throw error;
    }
}

/**
 * Update contributor's quarterly stats
 * @param {String} username - Contributor username
 * @param {Object} updates - Stats to update { prs, reviews, points }
 * @param {Date} activityDate - Optional: date of the activity (PR merge/review). If provided, only counts if within current quarter.
 * 
 * Note: Uses dynamic quarter configuration from database (quarterSettings table).
 * Quarter dates are calculated based on the configured q1StartMonth and systemType,
 * so this works correctly regardless of calendar/fiscal/academic/custom quarter settings.
 */
export async function updateQuarterlyStats(username, updates, activityDate = null) {
    try {
        // Get current quarter and date range from database config (dynamic, not hardcoded)
        const currentQuarter = await getCurrentQuarter();
        const { start, end } = await getQuarterDateRange(currentQuarter);

        // If activityDate is provided, check if it falls within current quarter's configured date range
        if (activityDate) {
            const activityTimestamp = new Date(activityDate).getTime();
            const quarterStart = new Date(start).getTime();
            const quarterEnd = new Date(end).getTime();
            
            // Only update stats if activity is within current quarter (based on configured dates)
            if (activityTimestamp < quarterStart || activityTimestamp > quarterEnd) {
                // Activity is outside current quarter, skip update
                return null;
            }
        }

        // quarterlyStats is a single JSON blob, so this is a read-modify-write with no
        // atomic increment available. Two webhooks for the same contributor — a PR
        // worth 40 and a review worth 15 — both read {points: 100}; one writes 140, the
        // other 115, and whichever lands second silently discards the other's points
        // and its PR increment. point_history keeps both, so the quarter tally drifts
        // below the history it is supposed to summarise, skewing the quarterly
        // leaderboard, winner selection and the bills thresholds.
        //
        // Serialised per contributor. The lock is held only for this blob's update and
        // released with the transaction however it ends.
        return await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`quarterly-stats:${username}`}, 0))`;

            const contributor = await tx.contributor.findUnique({
                where: { username },
                select: { quarterlyStats: true }
            });

            if (!contributor) {
                console.warn(`Contributor ${username} not found for quarterly update`);
                return null;
            }

            let quarterlyStats = contributor.quarterlyStats || {};

            // Initialize quarterly stats if not set or if quarter changed
            if (!quarterlyStats.currentQuarter || quarterlyStats.currentQuarter !== currentQuarter) {
                quarterlyStats = {
                    currentQuarter,
                    quarterStartDate: start,
                    quarterEndDate: end,
                    prsThisQuarter: 0,
                    reviewsThisQuarter: 0,
                    pointsThisQuarter: 0,
                    lastUpdated: new Date()
                };
            }

            // Update stats
            if (updates.prs) {
                quarterlyStats.prsThisQuarter = (quarterlyStats.prsThisQuarter || 0) + updates.prs;
            }
            if (updates.reviews) {
                quarterlyStats.reviewsThisQuarter = (quarterlyStats.reviewsThisQuarter || 0) + updates.reviews;
            }
            if (updates.points) {
                quarterlyStats.pointsThisQuarter = (quarterlyStats.pointsThisQuarter || 0) + updates.points;
            }

            quarterlyStats.lastUpdated = new Date();

            const updated = await tx.contributor.update({
                where: { username },
                data: { quarterlyStats },
                select: { quarterlyStats: true }
            });

            return updated.quarterlyStats;
        });
    } catch (error) {
        console.error(`Error updating quarterly stats for ${username}:`, error);
        throw error;
    }
}

/**
 * Get quarterly leaderboard
 * @param {String} quarterString - Optional quarter (defaults to current)
 * @param {Number} limit - Maximum number of contributors to return
 * @param {Object} options - Optional parameters
 * @param {boolean} options.userShowDevOps - User's preference to show/hide DevOps members
 * @param {boolean} options.userIsDevOps - Whether the requesting user is in DevOps team
 * @returns {Array} Sorted list of contributors
 */
export async function getQuarterlyLeaderboard(quarterString = null, limit = 50, options = {}) {
    try {
        const quarter = quarterString || await getCurrentQuarter();

        // Check if DevOps filter is enabled globally
        const settings = await prisma.quarterSettings.findUnique({
            where: { id: 'quarter-config' }
        });
        const globalExcludeDevOps = settings?.excludeDevOpsFromLeaderboards || false;

        // Apply user preference logic (same as all-time leaderboard)
        let excludeDevOps;
        if (options.userIsDevOps) {
            excludeDevOps = !options.userShowDevOps;
        } else {
            excludeDevOps = globalExcludeDevOps;
        }

        const contributors = await prisma.contributor.findMany({
            where: {
                username: {
                    not: {
                        endsWith: '[bot]'
                    }
                },
                // Exclude DevOps team members if filter is enabled
                ...(excludeDevOps && { isDevOps: false })
            },
            select: {
                username: true,
                avatarUrl: true,
                quarterlyStats: true,
                prCount: true,
                reviewCount: true,
                totalPoints: true,
                currentStreak: true,
                longestStreak: true,
                totalBillsAwarded: true,
                badges: true,
                sevenDayBadge: true,
                thirtyDayBadge: true,
                ninetyDayBadge: true,
                yearLongBadge: true
            }
        });

        // Filter by quarter and sort in memory
        const filtered = contributors
            .filter(c => c.quarterlyStats?.currentQuarter === quarter)
            .sort((a, b) => (b.quarterlyStats?.pointsThisQuarter || 0) - (a.quarterlyStats?.pointsThisQuarter || 0))
            .slice(0, limit)
            .map(c => ({
                ...c,
                prCount: Number(c.prCount),
                reviewCount: Number(c.reviewCount),
                totalPoints: Number(c.totalPoints),
                currentStreak: Number(c.currentStreak),
                longestStreak: Number(c.longestStreak),
                totalBillsAwarded: Number(c.totalBillsAwarded)
            }));

        return filtered;
    } catch (error) {
        console.error('Error getting quarterly leaderboard:', error);
        throw error;
    }
}

/**
 * Get all-time leaderboard (existing functionality)
 * @param {Number} limit - Maximum number of contributors to return
 * @param {Object} options - Optional parameters
 * @param {boolean} options.userShowDevOps - User's preference to show/hide DevOps members (overrides global setting if user is DevOps)
 * @param {boolean} options.userIsDevOps - Whether the requesting user is in DevOps team
 * @returns {Array} Sorted list of contributors
 */
export async function getAllTimeLeaderboard(limit = 50, options = {}) {
    try {
        // Check if DevOps filter is enabled globally
        const settings = await prisma.quarterSettings.findUnique({
            where: { id: 'quarter-config' }
        });
        const globalExcludeDevOps = settings?.excludeDevOpsFromLeaderboards || false;

        // For DevOps members: respect their preference (default: show DevOps)
        // For non-DevOps members: always apply global filter
        let excludeDevOps;
        if (options.userIsDevOps) {
            // DevOps members can toggle: if they want to see DevOps, show them (excludeDevOps = false)
            excludeDevOps = !options.userShowDevOps;
        } else {
            // Non-DevOps members always see the globally filtered view
            excludeDevOps = globalExcludeDevOps;
        }

        console.log('[DEBUG] All-time leaderboard filter:', {
            globalExcludeDevOps,
            userIsDevOps: options.userIsDevOps,
            userShowDevOps: options.userShowDevOps,
            finalExcludeDevOps: excludeDevOps
        });

        const contributors = await prisma.contributor.findMany({
            where: {
                username: {
                    not: {
                        endsWith: '[bot]'
                    }
                },
                // Exclude DevOps team members if filter is enabled
                ...(excludeDevOps && { isDevOps: false })
            },
            orderBy: {
                allTimePoints: 'desc'
            },
            take: limit,
            select: {
                username: true,
                avatarUrl: true,
                prCount: true,
                reviewCount: true,
                totalPoints: true,
                allTimePoints: true,
                quarterlyStats: true,
                currentStreak: true,
                longestStreak: true,
                totalBillsAwarded: true,
                badges: true,
                sevenDayBadge: true,
                thirtyDayBadge: true,
                ninetyDayBadge: true,
                yearLongBadge: true
            }
        });

        return contributors.map(c => ({
            ...c,
            prCount: Number(c.prCount),
            reviewCount: Number(c.reviewCount),
            totalPoints: Number(c.allTimePoints),
            allTimePoints: Number(c.allTimePoints),
            currentStreak: Number(c.currentStreak),
            longestStreak: Number(c.longestStreak),
            totalBillsAwarded: Number(c.totalBillsAwarded)
        }));
    } catch (error) {
        console.error('Error getting all-time leaderboard:', error);
        throw error;
    }
}

/**
 * Get Hall of Fame (past quarterly winners)
 * @param {Number} limit - Maximum number of quarters to return
 * @returns {Array} List of quarterly winners
 */
export async function getHallOfFame(limit = 20, category = null) {
    try {
        const winners = await prisma.quarterlyWinner.findMany({
            where: {
                ...(category && { category })
            },
            orderBy: [
                { year: 'desc' },
                { quarterNumber: 'desc' }
            ],
            take: limit
        });

        return winners;
    } catch (error) {
        console.error('Error getting hall of fame:', error);
        throw error;
    }
}

/**
 * Recompute This Quarter leaderboard stats from point history
 * - Rebuilds prsThisQuarter, reviewsThisQuarter, pointsThisQuarter
 * - Does NOT alter all-time totals
 */
export async function recomputeCurrentQuarterStats() {
    const quarter = await getCurrentQuarter();
    const { start, end } = await getQuarterDateRange(quarter);

    // Sum points per contributor within current quarter
    const totals = await prisma.pointHistory.groupBy({
        by: ['contributorId'],
        where: { timestamp: { gte: start, lte: end } },
        _sum: { points: true }
    });

    // Count PR merged events
    const prCounts = await prisma.pointHistory.groupBy({
        by: ['contributorId'],
        where: { timestamp: { gte: start, lte: end }, reason: POINT_REASONS.PR_MERGED },
        _count: { _all: true }
    });

    // Count review completed events
    const reviewCounts = await prisma.pointHistory.groupBy({
        by: ['contributorId'],
        where: { timestamp: { gte: start, lte: end }, reason: POINT_REASONS.REVIEW_COMPLETED },
        _count: { _all: true }
    });

    const sumMap = new Map(totals.map(t => [String(t.contributorId), Number(t._sum.points || 0n)]));
    const prMap = new Map(prCounts.map(c => [String(c.contributorId), Number(c._count._all || 0)]));
    const reviewMap = new Map(reviewCounts.map(c => [String(c.contributorId), Number(c._count._all || 0)]));

    // Get all contributors (ids and usernames) to iterate
    const contributors = await prisma.contributor.findMany({ select: { id: true, username: true } });

    let updated = 0;
    let skippedNoActivity = 0;
    for (const c of contributors) {
        const idKey = String(c.id);
        const pointsThisQuarter = sumMap.get(idKey) || 0;
        const prsThisQuarter = prMap.get(idKey) || 0;
        const reviewsThisQuarter = reviewMap.get(idKey) || 0;

        // Do not overwrite existing stats with zeros if no activity found in pointHistory
        if (pointsThisQuarter === 0 && prsThisQuarter === 0 && reviewsThisQuarter === 0) {
            skippedNoActivity++;
            continue;
        }

        await prisma.contributor.update({
            where: { id: c.id },
            data: {
                quarterlyStats: {
                    currentQuarter: quarter,
                    quarterStartDate: start,
                    quarterEndDate: end,
                    prsThisQuarter,
                    reviewsThisQuarter,
                    pointsThisQuarter,
                    lastUpdated: new Date()
                }
            }
        });
        updated++;
    }

    return { quarter, updated, skippedNoActivity };
}

/**
 * Recompute This Quarter leaderboard stats from processed tables as a fallback
 * - Uses Contribution and Review (or processedPR/processedReview) within the quarter
 * - Computes points = PRs * POINT_VALUES.default + Reviews * POINT_VALUES.review
 * - Does NOT alter all-time totals
 */
export async function recomputeCurrentQuarterStatsFallback(quarterString = null) {
    const quarter = quarterString || await getCurrentQuarter();
    const { start, end } = await getQuarterDateRange(quarter);

    // Prefer contribution/review aggregates
    const contribPrs = await prisma.contribution.groupBy({
        by: ['contributorId'],
        where: { date: { gte: start, lte: end }, merged: true },
        _sum: { count: true }
    });
    const contribReviews = await prisma.review.groupBy({
        by: ['contributorId'],
        where: { date: { gte: start, lte: end } },
        _sum: { count: true }
    });

    let prMap = new Map(contribPrs.map(p => [String(p.contributorId), Number(p._sum.count || 0)]));
    let reviewMap = new Map(contribReviews.map(r => [String(r.contributorId), Number(r._sum.count || 0)]));

    // If both are empty, fall back to processed tables
    if (prMap.size === 0 && reviewMap.size === 0) {
        const prs = await prisma.processedPR.groupBy({
            by: ['contributorId'],
            where: { processedDate: { gte: start, lte: end }, action: 'authored' },
            _count: { _all: true }
        });
        const reviews = await prisma.processedReview.groupBy({
            by: ['contributorId'],
            where: { processedDate: { gte: start, lte: end } },
            _count: { _all: true }
        });
        prMap = new Map(prs.map(p => [String(p.contributorId), Number(p._count._all || 0)]));
        reviewMap = new Map(reviews.map(r => [String(r.contributorId), Number(r._count._all || 0)]));
    }

    const ids = new Set([...prMap.keys(), ...reviewMap.keys()]);
    if (ids.size === 0) return { quarter, updated: 0 };

    const contributors = await prisma.contributor.findMany({
        where: { id: { in: Array.from(ids) } },
        select: { id: true, username: true }
    });
    const idToUsername = new Map(contributors.map(c => [String(c.id), c.username]));

    let updated = 0;
    for (const id of ids) {
        const username = idToUsername.get(id);
        if (!username) continue;
        const prsThisQuarter = prMap.get(id) || 0;
        const reviewsThisQuarter = reviewMap.get(id) || 0;
        const pointsThisQuarter = prsThisQuarter * (POINT_VALUES.default || 40) + reviewsThisQuarter * (POINT_VALUES.review || 15);

        await prisma.contributor.update({
            where: { id },
            data: {
                quarterlyStats: {
                    currentQuarter: quarter,
                    quarterStartDate: start,
                    quarterEndDate: end,
                    prsThisQuarter,
                    reviewsThisQuarter,
                    pointsThisQuarter,
                    lastUpdated: new Date()
                }
            }
        });
        updated++;
    }

    return { quarter, updated };
}

/**
 * Recompute and upsert Hall of Fame entry for a given quarter from history
 */
export async function recomputeHallOfFame(quarterString) {
    const quarter = quarterString || await getCurrentQuarter();
    const { start, end } = await getQuarterDateRange(quarter);

    // Rank on the SAME basis the live archive and the bills payout use: every point
    // recorded in the window, challenge and achievement bonuses included.
    //
    // Restricting this to PR_MERGED + REVIEW_COMPLETED meant a recompute could crown a
    // different winner than the one who was actually archived and paid — someone who
    // won on 2,450 including bonuses could be replaced by a rival on 2,100 of "pure"
    // points, leaving the Hall of Fame contradicting the payout record with nothing to
    // explain the difference.
    const totals = await prisma.pointHistory.groupBy({
        by: ['contributorId'],
        where: {
            timestamp: { gte: start, lte: end }
        },
        _sum: { points: true }
    });

    // If no point history exists for this quarter, fall back to processed PRs/reviews
    let rankings = totals;
    let fallbackUsed = false;
    if (rankings.length === 0) {
        fallbackUsed = true;
        // Prefer Contribution/Review tables (historical data), else processedPR/processedReview
        let prMap = new Map();
        let reviewMap = new Map();
        const contribPrs = await prisma.contribution.groupBy({
            by: ['contributorId'],
            where: { date: { gte: start, lte: end }, merged: true },
            _sum: { count: true }
        });
        const contribReviews = await prisma.review.groupBy({
            by: ['contributorId'],
            where: { date: { gte: start, lte: end } },
            _sum: { count: true }
        });

        if (contribPrs.length > 0 || contribReviews.length > 0) {
            prMap = new Map(contribPrs.map(p => [String(p.contributorId), Number(p._sum.count || 0) ]));
            reviewMap = new Map(contribReviews.map(r => [String(r.contributorId), Number(r._sum.count || 0) ]));
        } else {
            // Fall back to processed tables if contribution/review empty
            const prs = await prisma.processedPR.groupBy({
                by: ['contributorId'],
                where: {
                    processedDate: { gte: start, lte: end },
                    action: 'authored'
                },
                _count: { _all: true }
            });
            const reviews = await prisma.processedReview.groupBy({
                by: ['contributorId'],
                where: { processedDate: { gte: start, lte: end } },
                _count: { _all: true }
            });
            prMap = new Map(prs.map(p => [String(p.contributorId), Number(p._count._all || 0)]));
            reviewMap = new Map(reviews.map(r => [String(r.contributorId), Number(r._count._all || 0)]));
        }

        // Compute default points = PRs * default PR points + reviews * review points
        const idSet = new Set([...prMap.keys(), ...reviewMap.keys()]);
        rankings = Array.from(idSet).map(id => {
            const prCount = prMap.get(id) || 0;
            const reviewCount = reviewMap.get(id) || 0;
            const points = prCount * (POINT_VALUES.default || 40) + reviewCount * (POINT_VALUES.review || 15);
            return { contributorId: id, _sum: { points: BigInt(points) }, __counts: { prs: prCount, reviews: reviewCount } };
        });
    }

    // Fetch contributor profiles (including isDevOps flag for category split)
    // Exclude bot accounts (e.g., github-actions[bot])
    const ids = rankings.map(t => t.contributorId);
    const profiles = await prisma.contributor.findMany({
        where: {
            id: { in: ids },
            username: {
                not: {
                    endsWith: '[bot]'
                }
            }
        },
        select: { id: true, username: true, avatarUrl: true, isDevOps: true }
    });
    const profileMap = new Map(profiles.map(p => [String(p.id), p]));

    // Build sorted list (only include contributors with profiles — bots are excluded)
    const ranked = rankings
        .map(t => ({ id: String(t.contributorId), points: Number(t._sum.points || 0n) }))
        .filter(t => t.points > 0 && profileMap.has(t.id))
        .sort((a, b) => b.points - a.points);

    if (ranked.length === 0) {
        return { quarter, updated: false, message: 'No points > 0 for quarter' };
    }

    // Compute PR/review counts for top 3
    // If fallback was used we already attached counts; otherwise compute from pointHistory by reason
    let prCountsMap = new Map();
    let reviewCountsMap = new Map();
    if (!fallbackUsed) {
        const prCounts = await prisma.pointHistory.groupBy({
            by: ['contributorId'],
            where: { timestamp: { gte: start, lte: end }, reason: POINT_REASONS.PR_MERGED },
            _count: { _all: true }
        });
        const rvCounts = await prisma.pointHistory.groupBy({
            by: ['contributorId'],
            where: { timestamp: { gte: start, lte: end }, reason: POINT_REASONS.REVIEW_COMPLETED },
            _count: { _all: true }
        });
        prCountsMap = new Map(prCounts.map(c => [String(c.contributorId), Number(c._count._all || 0)]));
        reviewCountsMap = new Map(rvCounts.map(c => [String(c.contributorId), Number(c._count._all || 0)]));
    }

    // Helper to get PR/review counts for a contributor
    const getCounts = (id) => {
        if (fallbackUsed) {
            const rRaw = rankings.find(x => String(x.contributorId) === id);
            return {
                prsThisQuarter: rRaw?.__counts?.prs || 0,
                reviewsThisQuarter: rRaw?.__counts?.reviews || 0
            };
        }
        return {
            prsThisQuarter: prCountsMap.get(id) || 0,
            reviewsThisQuarter: reviewCountsMap.get(id) || 0
        };
    };

    // Parse label tolerant of Q or T prefix (e.g. 2025-Q1 / 2025-T3)
    const year = parseInt(quarter.split('-')[0]);
    const quarterNumber = parseInt(quarter.split('-')[1].replace(/\D/g, ''));

    // Split ranked into DevOps and non-DevOps categories
    const rankedByCategory = {
        general: ranked.filter(r => !profileMap.get(r.id)?.isDevOps),
        devops: ranked.filter(r => profileMap.get(r.id)?.isDevOps)
    };

    let updated = false;

    for (const [category, categoryRanked] of Object.entries(rankedByCategory)) {
        if (categoryRanked.length === 0) continue;

        const top3 = categoryRanked.slice(0, 3).map((r, idx) => {
            const p = profileMap.get(r.id);
            const counts = getCounts(r.id);
            return {
                rank: idx + 1,
                username: p?.username || 'unknown',
                avatarUrl: p?.avatarUrl || null,
                prsThisQuarter: counts.prsThisQuarter,
                reviewsThisQuarter: counts.reviewsThisQuarter,
                pointsThisQuarter: r.points
            };
        });

        const winnerProfile = profileMap.get(categoryRanked[0].id);
        const winnerCounts = getCounts(categoryRanked[0].id);
        const winner = {
            username: winnerProfile?.username || 'unknown',
            avatarUrl: winnerProfile?.avatarUrl || null,
            prsThisQuarter: winnerCounts.prsThisQuarter,
            reviewsThisQuarter: winnerCounts.reviewsThisQuarter,
            pointsThisQuarter: categoryRanked[0].points
        };

        const totalParticipants = categoryRanked.length;

        await prisma.quarterlyWinner.upsert({
            where: {
                quarter_category: { quarter, category }
            },
            update: {
                year,
                quarterNumber,
                quarterStart: start,
                quarterEnd: end,
                winner,
                top3,
                totalParticipants,
                archivedDate: new Date()
            },
            create: {
                quarter,
                category,
                year,
                quarterNumber,
                quarterStart: start,
                quarterEnd: end,
                winner,
                top3,
                totalParticipants,
                archivedDate: new Date()
            }
        });

        updated = true;
    }

    return { quarter, updated };
}

/**
 * Recompute Hall of Fame for all quarters present in point history
 * Scans from earliest to latest pointHistory timestamp and recomputes per quarter
 */
export async function recomputeHallOfFameAll() {
    const config = await getQuarterConfig();
    const q1Start = config.q1StartMonth;
    const pm = periodMonths(config.systemType);
    const prefix = periodPrefix(config.systemType);

    // Aggregate ranges across all relevant tables to ensure full historical coverage
    const phRange = await prisma.pointHistory.aggregate({ _min: { timestamp: true }, _max: { timestamp: true } });
    const cRange = await prisma.contribution.aggregate({ _min: { date: true }, _max: { date: true } });
    const rRange = await prisma.review.aggregate({ _min: { date: true }, _max: { date: true } });
    const prRange = await prisma.processedPR.aggregate({ _min: { processedDate: true }, _max: { processedDate: true } });
    const rvRange = await prisma.processedReview.aggregate({ _min: { processedDate: true }, _max: { processedDate: true } });

    const minCandidates = [phRange._min.timestamp, cRange._min.date, rRange._min.date, prRange._min.processedDate, rvRange._min.processedDate].filter(Boolean);
    const maxCandidates = [phRange._max.timestamp, cRange._max.date, rRange._max.date, prRange._max.processedDate, rvRange._max.processedDate].filter(Boolean);

    const minTs = minCandidates.length ? new Date(Math.min(...minCandidates.map(d => d.getTime()))) : null;
    const maxTs = maxCandidates.length ? new Date(Math.max(...maxCandidates.map(d => d.getTime()))) : null;

    const currentPeriod = await getCurrentQuarter();

    if (!minTs || !maxTs) {
        // No history to rebuild from — only drop obviously-stale rows (a different
        // period system, the in-progress period, or future-dated) and stop.
        await prisma.quarterlyWinner.deleteMany({
            where: {
                OR: [
                    { quarter: { not: { contains: '-' + prefix } } },
                    { quarter: currentPeriod },
                    { quarterEnd: { gt: new Date() } }
                ]
            }
        });
        return { updatedQuarters: [], message: 'No historical activity found' };
    }

    // Kept deliberately, despite wiping rows that awards were paid against: the payout
    // record does not live here. awardQuarterlyBills writes quarterly_awards and
    // bill_gifts, neither of which this touches, so who was paid survives a rebuild
    // independently of the Hall of Fame display.
    //
    // Full rebuild: wipe every existing Hall of Fame row before regenerating.
    // recomputeHallOfFame keys rows by the `quarter` LABEL, and a config change
    // re-slices time and relabels periods (e.g. the tertile end-year offset shifts
    // a period's year). Deleting only wrong-prefix/current/future rows left the
    // old completed-period rows under their previous labels in place, so the
    // rebuild added freshly-labeled rows alongside them — producing duplicate
    // periods under year-off-by-one labels. Every completed period in range is
    // regenerated from authoritative history below, so a full wipe is safe.
    await prisma.quarterlyWinner.deleteMany({});

    // Helper: get the period string for a date (works for quarters or tertiles).
    const quarterFromDate = (date) => {
        const year = date.getUTCFullYear();
        const month = date.getUTCMonth() + 1; // 1-12
        const monthsSinceQ1 = (month - q1Start + 12) % 12;
        const quarterNum = Math.floor(monthsSinceQ1 / pm) + 1;
        const cycleStartYear = month >= q1Start ? year : year - 1;
        const qYear = cycleStartYear + tertileYearOffset(config.systemType, q1Start);
        return `${qYear}-${prefix}${quarterNum}`;
    };

    // Generate all period strings in range
    const quarters = new Set();
    let cursor = new Date(Date.UTC(minTs.getUTCFullYear(), minTs.getUTCMonth(), 1));
    const end = new Date(Date.UTC(maxTs.getUTCFullYear(), maxTs.getUTCMonth(), 1));
    while (cursor <= end) {
        quarters.add(quarterFromDate(cursor));
        // advance one month
        const m = cursor.getUTCMonth();
        cursor = new Date(Date.UTC(cursor.getUTCFullYear(), m + 1, 1));
    }

    // Never rebuild the in-progress period (deleted above; completed periods only).
    quarters.delete(currentPeriod);

    const updatedQuarters = [];
    for (const q of quarters) {
        const res = await recomputeHallOfFame(q);
        if (res.updated) updatedQuarters.push(q);
    }

    return { updatedQuarters };
}

/**
 * Award quarterly bills/vonettes based on leaderboard placement.
 *
 * Non-DevOps contributors (filtered leaderboard):
 *   1st place → 1 Vonette (worth 5 Bills)
 *   2nd place → 1 Bill
 *   3rd place → 1 Bill
 *
 * DevOps contributors (participation-based):
 *   Any DevOps member with >= DEVOPS_PARTICIPATION_THRESHOLD contributions earns 1 Bill
 *
 * @param {String} quarterString - Quarter being closed (e.g., "2025-Q1")
 * @returns {Object} { nonDevOpsAwards, devOpsAwards }
 */
export async function awardQuarterlyBills(quarterString) {
    const results = { nonDevOpsAwards: [], devOpsAwards: [] };

    try {
        const quarter = quarterString || await getCurrentQuarter();

        // Idempotency guard: claim this quarter so bills are awarded at most once.
        // Both checkAndResetIfNewQuarter and updateQuarterConfig can detect the same
        // boundary; the unique `quarter` constraint makes this claim atomic and also
        // serializes concurrent callers.
        try {
            await prisma.quarterlyAward.create({ data: { quarter } });
        } catch (claimError) {
            if (claimError.code === 'P2002') {
                console.log(`Quarterly bills already awarded for ${quarter}, skipping`);
                return { ...results, alreadyAwarded: true };
            }
            throw claimError;
        }

        console.log(`Awarding quarterly bills for ${quarter}`);

        // --- Non-DevOps awards (top 3 from filtered leaderboard) ---
        // Ranked from point_history, exactly as archiveQuarterWinners now is. Reading
        // contributor.quarterlyStats here would have paid a different person than the
        // archive credits: the per-event path zeroes that cache the moment a
        // contributor's first PR of the new quarter lands, and the rollover runs after
        // the boundary — so the outgoing quarter's leader could be filtered out of
        // their own payout by the `currentQuarter !== quarter` test below.
        const billsTotals = await quarterTotalsFromHistory(quarter);
        const contributorRows = await prisma.contributor.findMany({
            where: {
                isDevOps: false,
                username: {
                    not: {
                        endsWith: '[bot]'
                    }
                }
            },
            select: {
                id: true,
                username: true,
                avatarUrl: true,
                totalBillsAwarded: true
            }
        });
        const allContributors = contributorRows.map(c => ({
            ...c,
            quarterlyStats: {
                currentQuarter: quarter,
                ...(billsTotals.get(String(c.id)) || { prsThisQuarter: 0, reviewsThisQuarter: 0, pointsThisQuarter: 0 })
            }
        }));

        // Only contributors meeting minimum participation threshold qualify for awards
        const ranked = allContributors
            .filter(c => {
                if (c.quarterlyStats?.currentQuarter !== quarter) return false;
                if ((c.quarterlyStats?.pointsThisQuarter || 0) <= 0) return false;
                const contributions = (c.quarterlyStats?.prsThisQuarter || 0) + (c.quarterlyStats?.reviewsThisQuarter || 0);
                return contributions >= NON_DEVOPS_WINNER_THRESHOLD;
            })
            .sort((a, b) => b.quarterlyStats.pointsThisQuarter - a.quarterlyStats.pointsThisQuarter);

        const awards = [
            { rank: 1, type: 'Vonette', value: 5, image: '5_vonett_57_25.png' },
            { rank: 2, type: 'Bill',    value: 1, image: '1_bill_57X27.png' },
            { rank: 3, type: 'Bill',    value: 1, image: '1_bill_57X27.png' }
        ];

        // Record the intended winners BEFORE paying any of them. The claim row is
        // created at the top for concurrency, but results were only written at the very
        // end — so a crash midway through the payout left a claimed quarter with null
        // results. The retry short-circuits on P2002 with empty arrays, and
        // sendTertileWinnerBills falls back to the stored results that were never
        // written, so ranks 2 and 3 received neither a counter increment nor a gift and
        // nothing recorded that they should have.
        await prisma.quarterlyAward.update({
            where: { quarter },
            data: {
                results: {
                    intendedNonDevOpsWinners: ranked.slice(0, 3).map((c, i) => ({
                        username: c.username,
                        rank: awards[i].rank,
                        type: awards[i].type,
                        value: awards[i].value,
                        points: c.quarterlyStats.pointsThisQuarter
                    }))
                }
            }
        });

        for (let i = 0; i < Math.min(ranked.length, 3); i++) {
            const contributor = ranked[i];
            const award = awards[i];

            await prisma.contributor.update({
                where: { username: contributor.username },
                data: { totalBillsAwarded: { increment: award.value } }
            });

            emitBillAwarded({
                username: contributor.username,
                billType: award.type,
                billValue: award.value,
                billImage: award.image
            });

            results.nonDevOpsAwards.push({
                username: contributor.username,
                rank: award.rank,
                type: award.type,
                value: award.value,
                points: contributor.quarterlyStats.pointsThisQuarter
            });

            console.log(`Quarterly award: ${contributor.username} (rank #${award.rank}) → ${award.value} ${award.type}`);
        }

        // --- DevOps participation awards ---
        const devOpsContributors = await prisma.contributor.findMany({
            where: {
                isDevOps: true,
                username: {
                    not: {
                        endsWith: '[bot]'
                    }
                }
            },
            select: {
                username: true,
                avatarUrl: true,
                quarterlyStats: true,
                totalBillsAwarded: true
            }
        });

        for (const contributor of devOpsContributors) {
            if (contributor.quarterlyStats?.currentQuarter !== quarter) continue;
            const contributions =
                (contributor.quarterlyStats?.prsThisQuarter || 0) +
                (contributor.quarterlyStats?.reviewsThisQuarter || 0);

            if (contributions >= DEVOPS_PARTICIPATION_THRESHOLD) {
                await prisma.contributor.update({
                    where: { username: contributor.username },
                    data: { totalBillsAwarded: { increment: 1 } }
                });

                emitBillAwarded({
                    username: contributor.username,
                    billType: 'Bill',
                    billValue: 1,
                    billImage: '1_bill_57X27.png'
                });

                results.devOpsAwards.push({
                    username: contributor.username,
                    contributions,
                    value: 1
                });

                console.log(`DevOps participation award: ${contributor.username} (${contributions} contributions) → 1 Bill`);
            }
        }

        console.log(`Quarterly bills awarded: ${results.nonDevOpsAwards.length} non-DevOps, ${results.devOpsAwards.length} DevOps`);

        // Record what was awarded on the idempotency marker for auditing
        await prisma.quarterlyAward.update({
            where: { quarter },
            data: { results }
        });

        return results;
    } catch (error) {
        console.error('Error awarding quarterly bills:', error);
        throw error;
    }
}

/**
 * Check if we're in a new quarter and trigger reset if needed
 * @returns {Object} { quarterChanged, oldQuarter, newQuarter }
 */
/**
 * Record which quarter the system currently considers open.
 *
 * This is the boundary marker. It must only be advanced once the closing quarter has
 * been archived and awarded, because advancing it is what stops checkAndResetIfNewQuarter
 * from running the rollover again.
 */
export async function setActiveQuarter(quarter) {
    await prisma.quarterSettings.upsert({
        where: { id: 'quarter-config' },
        create: { id: 'quarter-config', activeQuarter: quarter },
        update: { activeQuarter: quarter }
    });
}

export async function checkAndResetIfNewQuarter() {
    try {
        const currentQuarter = await getCurrentQuarter();

        // The quarter the system last opened is persisted, not inferred from a sampled
        // contributor. findFirst has no ORDER BY, so it returned an arbitrary row: if
        // that one contributor had already self-rolled their own JSON onto the new
        // quarter, this read equalled currentQuarter and the whole rollover — archive,
        // bills, announcements, reset — silently never ran for anybody.
        const settings = await prisma.quarterSettings.findUnique({
            where: { id: 'quarter-config' },
            select: { activeQuarter: true }
        });
        let activeQuarter = settings?.activeQuarter || null;

        // First run after activeQuarter was introduced: adopt whatever quarter the
        // contributor cache is already on and record it, rather than treating a NULL
        // marker as "never initialised" and recomputing everyone's stats on the next
        // boot. Only a genuinely empty system falls through to initialisation.
        if (!activeQuarter) {
            const seeded = await prisma.contributor.findFirst({
                where: { quarterlyStats: { not: null } },
                select: { quarterlyStats: true }
            });
            if (seeded?.quarterlyStats?.currentQuarter) {
                activeQuarter = seeded.quarterlyStats.currentQuarter;
                await setActiveQuarter(activeQuarter);
            }
        }

        if (!activeQuarter) {
            // No contributors have quarterly stats yet, initialize for current quarter
            console.log(`Initializing quarterly system for ${currentQuarter}`);
            await resetQuarterlyStats(currentQuarter);
            await setActiveQuarter(currentQuarter);
            return {
                quarterChanged: true,
                oldQuarter: null,
                newQuarter: currentQuarter
            };
        }

        const contributorQuarter = activeQuarter;

        if (contributorQuarter !== currentQuarter) {
            console.log(`New quarter detected: ${contributorQuarter} → ${currentQuarter}`);

            // Check if this quarter was already archived (e.g., by updateQuarterConfig)
            // to prevent duplicate notifications
            const existingArchive = await prisma.quarterlyWinner.findFirst({
                where: { quarter: contributorQuarter }
            });

            if (existingArchive) {
                console.log(`Quarter ${contributorQuarter} already archived, skipping notifications — resetting stats only`);
                await resetQuarterlyStats(currentQuarter);
                await setActiveQuarter(currentQuarter);
                return {
                    quarterChanged: true,
                    oldQuarter: contributorQuarter,
                    newQuarter: currentQuarter,
                    alreadyArchived: true
                };
            }

            const quarterlyWinner = await archiveQuarterWinners(contributorQuarter);
            // Award bills/vonettes based on final standings before resetting
            const billResults = await awardQuarterlyBills(contributorQuarter);
            // Deliver the podium winners' bill bucks via the Bills API (no-op unless
            // enabled + BILLS_API_KEY set). Never throws — a Bills outage must not
            // block announcing/resetting the period.
            await sendTertileWinnerBills(contributorQuarter, billResults);
            await postQuarterlyWinnersDiscussion(contributorQuarter, billResults, quarterlyWinner);
            await postQuarterlyWinnersSlack(contributorQuarter, billResults, quarterlyWinner);
            await resetQuarterlyStats(currentQuarter);
            await setActiveQuarter(currentQuarter);
            return {
                quarterChanged: true,
                oldQuarter: contributorQuarter,
                newQuarter: currentQuarter,
                billsAwarded: billResults
            };
        }

        return {
            quarterChanged: false,
            oldQuarter: currentQuarter,
            newQuarter: currentQuarter
        };
    } catch (error) {
        console.error('Error checking for new quarter:', error);
        throw error;
    }
}
