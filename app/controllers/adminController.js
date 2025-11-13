// adminController.js
import { prisma } from '../lib/prisma.js';
import { body, validationResult } from 'express-validator';
import { getPRRangeInfo, checkForDuplicates, fixDuplicates } from '../services/contributorService.js';
import { startBackfill, stopBackfill, getBackfillStatus } from '../services/backfillService.js';
import {
    getQuarterConfig,
    getCurrentQuarter,
    getQuarterDateRange,
    updateQuarterConfig,
    getAllTimeLeaderboard,
    getQuarterlyLeaderboard,
    getHallOfFame,
    recomputeCurrentQuarterStats,
    recomputeCurrentQuarterStatsFallback,
    recomputeHallOfFame,
    recomputeHallOfFameAll
} from '../services/quarterlyService.js';
import { ensureAppSettingsTable, getCronEnabled, setCronEnabled } from '../lib/appSettings.js';

// Function to get all contributors
export const getContributors = async (req, res) => {
    try {
        const contributors = await prisma.contributor.findMany();
        // Convert BigInt values to strings for JSON serialization
        const serializedContributors = contributors.map(c => ({
            ...c,
            prCount: c.prCount.toString(),
            reviewCount: c.reviewCount.toString(),
            totalPoints: c.totalPoints.toString(),
            currentStreak: c.currentStreak.toString(),
            longestStreak: c.longestStreak.toString(),
            totalBillsAwarded: c.totalBillsAwarded.toString()
        }));
        res.status(200).json(serializedContributors);
    } catch (err) {
        console.error('Error in getContributors:', err);
        res.status(500).send('Error fetching contributors');
    }
};

// Function to reset a specific contributor's awards and badges
export const resetContributor = [
    body('username').isString().trim().notEmpty(),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { username } = req.body;
        try {
            const contributor = await prisma.contributor.findUnique({
                where: { username }
            });
            if (!contributor) {
                return res.status(404).send('Contributor not found');
            }
            await prisma.contributor.update({
                where: { username },
                data: {
                    firstPrAwarded: false,
                    firstReviewAwarded: false,
                    first10PrsAwarded: false,
                    first10ReviewsAwarded: false,
                    first50PrsAwarded: false,
                    first50ReviewsAwarded: false,
                    first100PrsAwarded: false,
                    first100ReviewsAwarded: false,
                    first500PrsAwarded: false,
                    first500ReviewsAwarded: false,
                    first1000PrsAwarded: false,
                    first1000ReviewsAwarded: false,
                    badges: []
                }
            });
            res.status(200).send('Contributor reset successfully');
        } catch (err) {
            res.status(500).send('Error resetting contributor');
        }
    }
];

// Function to reset all contributors' awards and badges
export const resetAllContributors = async (req, res) => {
    try {
        await prisma.contributor.updateMany({
            data: {
                firstPrAwarded: false,
                firstReviewAwarded: false,
                first10PrsAwarded: false,
                first10ReviewsAwarded: false,
                first50PrsAwarded: false,
                first50ReviewsAwarded: false,
                first100PrsAwarded: false,
                first100ReviewsAwarded: false,
                first500PrsAwarded: false,
                first500ReviewsAwarded: false,
                first1000PrsAwarded: false,
                first1000ReviewsAwarded: false,
                badges: []
            }
        });
        res.status(200).send('All contributors reset successfully');
    } catch (err) {
        res.status(500).send('Error resetting all contributors');
    }
};

/**
 * Get PR fetch range and database statistics
 * GET /api/admin/pr-range-info
 */
export async function getPRRangeInfoController(req, res) {
    try {
        const info = await getPRRangeInfo();
        res.json({
            success: true,
            data: info
        });
    } catch (error) {
        console.error('Error in getPRRangeInfoController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve PR range information',
            error: error.message
        });
    }
}

/**
 * Check for duplicate PRs in database
 * GET /api/admin/duplicate-check
 */
export async function checkDuplicatesController(req, res) {
    try {
        const results = await checkForDuplicates();
        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        console.error('Error in checkDuplicatesController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to check for duplicates',
            error: error.message
        });
    }
}

/**
 * Fix duplicate PRs in database
 * POST /api/admin/fix-duplicates
 */
export async function fixDuplicatesController(req, res) {
    try {
        const results = await fixDuplicates();
        res.json({
            success: true,
            data: results
        });
    } catch (error) {
        console.error('Error in fixDuplicatesController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fix duplicates',
            error: error.message
        });
    }
}

/**
 * Get current quarter info (PUBLIC - no auth required)
 * GET /api/quarter-info
 */
export async function getQuarterInfoController(req, res) {
    try {
        const currentQuarter = await getCurrentQuarter();
        const { start, end } = await getQuarterDateRange(currentQuarter);

        res.json({
            success: true,
            currentQuarter,
            quarterStart: start,
            quarterEnd: end
        });
    } catch (error) {
        console.error('Error in getQuarterInfoController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve quarter information',
            error: error.message
        });
    }
}

/**
 * Get quarter configuration (ADMIN - auth required)
 * GET /api/admin/quarter-config
 */
export async function getQuarterConfigController(req, res) {
    try {
        const config = await getQuarterConfig();
        const currentQuarter = await getCurrentQuarter();
        const { start, end } = await getQuarterDateRange(currentQuarter);

        res.json({
            success: true,
            config,
            currentQuarter,
            quarterDates: {
                start,
                end
            }
        });
    } catch (error) {
        console.error('Error in getQuarterConfigController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve quarter configuration',
            error: error.message
        });
    }
}

/**
 * Update quarter configuration
 * POST /api/admin/quarter-config
 */
export async function updateQuarterConfigController(req, res) {
    try {
        const { systemType, q1StartMonth, enableAchievementComments, enableBillsComments } = req.body;
        const modifiedBy = req.user?.username || 'admin';

        // Validation expected by tests
        const allowedSystems = ['calendar', 'fiscal-us', 'academic', 'custom'];
        if (!allowedSystems.includes(systemType)) {
            return res.status(400).json({ success: false, message: 'Invalid system type' });
        }
        if (q1StartMonth < 1 || q1StartMonth > 12) {
            return res.status(400).json({ success: false, message: 'q1StartMonth must be between 1 and 12' });
        }

        const result = await updateQuarterConfig(
            systemType,
            q1StartMonth,
            modifiedBy,
            enableAchievementComments,
            enableBillsComments
        );

        res.json({
            success: true,
            config: result.config,
            quarterChanged: result.quarterChanged,
            oldQuarter: result.oldQuarter,
            newQuarter: result.newQuarter
        });
    } catch (error) {
        console.error('Error in updateQuarterConfigController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update quarter configuration',
            error: error.message
        });
    }
}

/**
 * Get all-time leaderboard
 * GET /api/leaderboard/all-time
 */
export async function getAllTimeLeaderboardController(req, res) {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const leaderboard = await getAllTimeLeaderboard(limit);
        const withRank = leaderboard.map((row, idx) => ({ ...row, rank: idx + 1 }));
        res.json({ success: true, data: withRank });
    } catch (error) {
        console.error('Error in getAllTimeLeaderboardController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve all-time leaderboard',
            error: error.message
        });
    }
}

/**
 * Get quarterly leaderboard (current or specific quarter)
 * GET /api/leaderboard/quarterly
 * GET /api/leaderboard/quarterly/:quarter
 */
export async function getQuarterlyLeaderboardController(req, res) {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const quarterString = req.params.quarter || await getCurrentQuarter();
        const { start, end } = await getQuarterDateRange(quarterString);
        const raw = await getQuarterlyLeaderboard(quarterString, limit);
        // Only include contributors with points > 0 and flatten quarterly stats to top level
        const data = raw
            .filter(c => (c.quarterlyStats?.pointsThisQuarter || 0) > 0)
            .map(c => ({
                ...c,
                pointsThisQuarter: c.quarterlyStats?.pointsThisQuarter || 0,
                prsThisQuarter: c.quarterlyStats?.prsThisQuarter || 0,
                reviewsThisQuarter: c.quarterlyStats?.reviewsThisQuarter || 0
            }));
        res.json({ success: true, quarter: quarterString, quarterStart: start, quarterEnd: end, data });
    } catch (error) {
        console.error('Error in getQuarterlyLeaderboardController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve quarterly leaderboard',
            error: error.message
        });
    }
}

// Archived quarterly leaderboard by quarter from Hall of Fame
export async function getQuarterlyLeaderboardByQuarterController(req, res) {
    try {
        const { quarter } = req.params;
        if (!/^\d{4}-Q[1-4]$/.test(quarter)) {
            return res.status(400).json({ success: false, message: 'Invalid quarter format' });
        }
        const winner = await prisma.quarterlyWinner.findUnique({ where: { quarter } });
        if (!winner) {
            return res.status(404).json({ success: false, message: `Quarter ${quarter} not found` });
        }
        res.json({ success: true, quarter: winner.quarter, data: winner.top3 || [], totalParticipants: winner.totalParticipants });
    } catch (error) {
        console.error('Error in getQuarterlyLeaderboardByQuarterController:', error);
        res.status(500).json({ success: false, message: 'Failed to retrieve archived quarter', error: error.message });
    }
}

/**
 * Get Hall of Fame (past quarterly winners)
 * GET /api/leaderboard/hall-of-fame
 */
export async function getHallOfFameController(req, res) {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const hallOfFame = await getHallOfFame(limit);

        res.json({
            success: true,
            data: hallOfFame
        });
    } catch (error) {
        console.error('Error in getHallOfFameController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to retrieve Hall of Fame',
            error: error.message
        });
    }
}

/**
 * Recompute This Quarter leaderboard from point history
 * POST /api/admin/leaderboard/recompute/current-quarter
 */
export async function recomputeCurrentQuarterController(req, res) {
    try {
        console.log('Admin requested recompute current quarter');
        const useFallback = req.query.fallback === 'true';
        const result = useFallback ? await recomputeCurrentQuarterStatsFallback() : await recomputeCurrentQuarterStats();
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error in recomputeCurrentQuarterController:', error);
        res.status(500).json({ success: false, message: 'Failed to recompute current quarter', error: error.message });
    }
}

/**
 * Recompute Hall of Fame for a given quarter
 * POST /api/admin/leaderboard/recompute/hall-of-fame { quarter: 'YYYY-QN' }
 */
export async function recomputeHallOfFameController(req, res) {
    try {
        const { quarter } = req.body;
        if (quarter && !/^\d{4}-Q[1-4]$/.test(quarter)) {
            return res.status(400).json({ success: false, message: 'Invalid quarter format' });
        }
        console.log('Admin requested recompute Hall of Fame for quarter:', quarter || '(current)');
        const result = await recomputeHallOfFame(quarter);
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error in recomputeHallOfFameController:', error);
        res.status(500).json({ success: false, message: 'Failed to recompute Hall of Fame', error: error.message });
    }
}

/**
 * Recompute Hall of Fame for all quarters present in history
 * POST /api/admin/leaderboard/recompute/hall-of-fame/all
 */
export async function recomputeHallOfFameAllController(req, res) {
    try {
        console.log('Admin requested recompute Hall of Fame for ALL quarters');
        const result = await recomputeHallOfFameAll();
        res.json({ success: true, ...result });
    } catch (error) {
        console.error('Error in recomputeHallOfFameAllController:', error);
        res.status(500).json({ success: false, message: 'Failed to recompute Hall of Fame (all)', error: error.message });
    }
}

/**
 * Recompute all streaks from contribution and review history
 * POST /api/admin/recompute/streaks
 */
export async function recomputeStreaksController(req, res) {
    try {
        console.log('Admin requested recompute streaks');

        // Import the recompute-streaks script logic
        const { prisma } = await import('../lib/prisma.js');
        const { updateStreak, checkStreakBadges } = await import('../services/streakService.js');

        const contributors = await prisma.contributor.findMany({
            include: {
                contributions: {
                    where: { merged: true },
                    select: { date: true },
                    distinct: ['date']
                },
                reviews: {
                    select: { date: true },
                    distinct: ['date']
                }
            }
        });

        let updated = 0;
        let topCurrentStreak = { username: '', streak: 0 };
        let topLongestStreak = { username: '', streak: 0 };

        for (const contributor of contributors) {
            // Combine and deduplicate dates
            const allDates = new Set();
            contributor.contributions.forEach(c => allDates.add(c.date.toISOString().split('T')[0]));
            contributor.reviews.forEach(r => allDates.add(r.date.toISOString().split('T')[0]));

            if (allDates.size === 0) continue;

            // Process each date chronologically to rebuild streaks
            const sortedDates = Array.from(allDates).map(d => new Date(d + 'T00:00:00Z')).sort((a, b) => a - b);

            for (const date of sortedDates) {
                await updateStreak(contributor, date);
            }

            await checkStreakBadges(contributor);

            // Get updated contributor
            const updatedContributor = await prisma.contributor.findUnique({
                where: { id: contributor.id },
                select: { username: true, currentStreak: true, longestStreak: true }
            });

            if (updatedContributor) {
                updated++;
                const currentStreak = Number(updatedContributor.currentStreak);
                const longestStreak = Number(updatedContributor.longestStreak);

                if (currentStreak > topCurrentStreak.streak) {
                    topCurrentStreak = { username: updatedContributor.username, streak: currentStreak };
                }
                if (longestStreak > topLongestStreak.streak) {
                    topLongestStreak = { username: updatedContributor.username, streak: longestStreak };
                }
            }
        }

        await prisma.$disconnect();

        res.json({
            success: true,
            message: `Recomputed streaks for ${updated} contributors`,
            updated,
            topCurrentStreak: `${topCurrentStreak.username} (${topCurrentStreak.streak} days)`,
            topLongestStreak: `${topLongestStreak.username} (${topLongestStreak.streak} days)`
        });
    } catch (error) {
        console.error('Error in recomputeStreaksController:', error);
        res.status(500).json({ success: false, message: 'Failed to recompute streaks', error: error.message });
    }
}

/**
 * Recompute all badges from contributor stats
 * POST /api/admin/recompute/badges
 */
export async function recomputeBadgesController(req, res) {
    try {
        console.log('Admin requested recompute badges');

        // Import the recompute-badges script logic
        const { prisma } = await import('../lib/prisma.js');
        const { checkStreakBadges } = await import('../services/streakService.js');
        const { checkAndAwardAchievements } = await import('../services/achievementService.js');

        const contributors = await prisma.contributor.findMany();

        let stats = {
            processed: 0,
            prBadgesAwarded: 0,
            reviewBadgesAwarded: 0,
            streakBadgesAwarded: 0,
            achievementsAwarded: 0,
            billsAwarded: 0,
            skipped: 0
        };

        for (const contributor of contributors) {
            // Skip contributors with no activity
            if (Number(contributor.prCount) === 0 && Number(contributor.reviewCount) === 0) {
                stats.skipped++;
                continue;
            }

            const allUpdates = {};
            const badgesAwarded = [];

            // Check PR badges
            const prCount = Number(contributor.prCount);
            const prMilestones = [
                { threshold: 1, flag: 'firstPrAwarded', name: 'First PR' },
                { threshold: 10, flag: 'first10PrsAwarded', name: '10 PRs' },
                { threshold: 50, flag: 'first50PrsAwarded', name: '50 PRs' },
                { threshold: 100, flag: 'first100PrsAwarded', name: '100 PRs' },
                { threshold: 500, flag: 'first500PrsAwarded', name: '500 PRs' },
                { threshold: 1000, flag: 'first1000PrsAwarded', name: '1000 PRs' }
            ];

            for (const milestone of prMilestones) {
                if (prCount >= milestone.threshold && !contributor[milestone.flag]) {
                    allUpdates[milestone.flag] = true;
                    badgesAwarded.push(milestone.name);
                    stats.prBadgesAwarded++;
                }
            }

            // Check review badges
            const reviewCount = Number(contributor.reviewCount);
            const reviewMilestones = [
                { threshold: 1, flag: 'firstReviewAwarded', name: 'First Review' },
                { threshold: 10, flag: 'first10ReviewsAwarded', name: '10 Reviews' },
                { threshold: 50, flag: 'first50ReviewsAwarded', name: '50 Reviews' },
                { threshold: 100, flag: 'first100ReviewsAwarded', name: '100 Reviews' },
                { threshold: 500, flag: 'first500ReviewsAwarded', name: '500 Reviews' },
                { threshold: 1000, flag: 'first1000ReviewsAwarded', name: '1000 Reviews' }
            ];

            for (const milestone of reviewMilestones) {
                if (reviewCount >= milestone.threshold && !contributor[milestone.flag]) {
                    allUpdates[milestone.flag] = true;
                    badgesAwarded.push(milestone.name);
                    stats.reviewBadgesAwarded++;
                }
            }

            // Check Bill awards
            const totalBills = Number(contributor.totalBillsAwarded);
            const billsEarned = Math.floor(prCount / 50);
            if (billsEarned > totalBills) {
                const billsToAward = billsEarned - totalBills;
                allUpdates.totalBillsAwarded = billsEarned;
                badgesAwarded.push(`${billsToAward} Bill(s)`);
                stats.billsAwarded += billsToAward;
            }

            // Check streak badges
            const streakBadges = await checkStreakBadges(contributor);
            if (streakBadges.length > 0) {
                badgesAwarded.push(...streakBadges.map(b => b.name));
                stats.streakBadgesAwarded += streakBadges.length;
            }

            // Check achievements
            const achievements = await checkAndAwardAchievements(contributor);
            if (achievements.length > 0) {
                badgesAwarded.push(...achievements.map(a => a.name));
                stats.achievementsAwarded += achievements.length;
            }

            // Update contributor if there are badge changes
            if (Object.keys(allUpdates).length > 0) {
                await prisma.contributor.update({
                    where: { id: contributor.id },
                    data: allUpdates
                });
            }

            stats.processed++;
        }

        await prisma.$disconnect();

        const totalBadges = stats.prBadgesAwarded + stats.reviewBadgesAwarded + stats.streakBadgesAwarded + stats.achievementsAwarded + stats.billsAwarded;

        res.json({
            success: true,
            message: `Recomputed badges for ${stats.processed} contributors. Awarded ${totalBadges} total badges/awards.`,
            ...stats,
            totalBadges
        });
    } catch (error) {
        console.error('Error in recomputeBadgesController:', error);
        res.status(500).json({ success: false, message: 'Failed to recompute badges', error: error.message });
    }
}

/**
 * Start historical data backfill
 * POST /api/admin/backfill/start
 */
export async function startBackfillController(req, res) {
    try {
        const { startDate, endDate, checkRateLimits, verboseLogging } = req.body;

        if (!startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'Start date and end date are required'
            });
        }

        const result = await startBackfill(startDate, endDate, checkRateLimits !== false, verboseLogging === true);

        res.json(result);
    } catch (error) {
        console.error('Error in startBackfillController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start backfill',
            error: error.message
        });
    }
}

/**
 * Stop historical data backfill
 * POST /api/admin/backfill/stop
 */
export async function stopBackfillController(req, res) {
    try {
        const result = stopBackfill();
        res.json(result);
    } catch (error) {
        console.error('Error in stopBackfillController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to stop backfill',
            error: error.message
        });
    }
}

/**
 * Get backfill status
 * GET /api/admin/backfill/status
 */
export async function getBackfillStatusController(req, res) {
    try {
        const status = getBackfillStatus();
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('Error in getBackfillStatusController:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get backfill status',
            error: error.message
        });
    }
}

/**
 * Get cron status (enabled/disabled)
 * GET /api/admin/cron-status
 */
export async function getCronStatusController(req, res) {
    try {
        await ensureAppSettingsTable();
        const enabled = await getCronEnabled();
        res.json({ success: true, enabled });
    } catch (error) {
        console.error('Error in getCronStatusController:', error);
        res.status(500).json({ success: false, message: 'Failed to get cron status', error: error.message });
    }
}

/**
 * Set cron status
 * POST /api/admin/cron-status { enabled: boolean }
 */
export async function setCronStatusController(req, res) {
    try {
        const { enabled } = req.body || {};
        await ensureAppSettingsTable();
        const newVal = await setCronEnabled(Boolean(enabled));
        res.json({ success: true, enabled: newVal });
    } catch (error) {
        console.error('Error in setCronStatusController:', error);
        res.status(500).json({ success: false, message: 'Failed to set cron status', error: error.message });
    }
}