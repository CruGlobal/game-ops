import { prisma } from '../lib/prisma.js';

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
            // Create default config (calendar quarters)
            config = await prisma.quarterSettings.create({
                data: {
                    id: 'quarter-config',
                    systemType: 'calendar',
                    q1StartMonth: 1
                }
            });
            console.log('Created default quarter configuration (calendar)');
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

    // Calculate which quarter we're in
    // If current month is before Q1 start, we're in Q4 of previous year
    let quarterNum;
    let year = currentYear;

    if (currentMonth < q1Start) {
        // We're in Q4 of previous year
        quarterNum = 4;
        year = currentYear - 1;
    } else {
        // Calculate quarter number based on months since Q1 start
        const monthsSinceQ1 = currentMonth - q1Start;
        quarterNum = Math.floor(monthsSinceQ1 / 3) + 1;
    }

    return `${year}-Q${quarterNum}`;
}

/**
 * Get quarter date range based on configuration
 * @param {String} quarterString - e.g., "2025-Q1"
 * @returns {Object} { start: Date, end: Date }
 */
export async function getQuarterDateRange(quarterString) {
    const config = await getQuarterConfig();
    const [yearStr, quarterStr] = quarterString.split('-');
    const year = parseInt(yearStr);
    const quarterNum = parseInt(quarterStr.replace('Q', ''));

    const q1Start = config.q1StartMonth;

    // Calculate start month for this quarter
    const startMonth = ((q1Start + (quarterNum - 1) * 3 - 1) % 12) + 1;

    // Calculate year adjustment if quarter spans year boundary
    let startYear = year;
    let endYear = year;

    // If startMonth > 10 and quarterNum is 1, we're spanning from previous year
    if (startMonth > 10 && quarterNum === 1) {
        startYear = year - 1;
        endYear = year;
    }

    // Calculate end month (2 months after start)
    let endMonth = startMonth + 2;
    if (endMonth > 12) {
        endMonth = endMonth - 12;
        endYear = startYear + 1;
    }

    // Use UTC dates to avoid timezone issues
    const startDate = new Date(Date.UTC(startYear, startMonth - 1, 1, 0, 0, 0));

    // Get last day of endMonth
    const lastDay = new Date(Date.UTC(endYear, endMonth, 0)).getUTCDate();
    const endDate = new Date(Date.UTC(endYear, endMonth - 1, lastDay, 23, 59, 59));

    return { start: startDate, end: endDate };
}

/**
 * Update quarter configuration
 * @param {String} systemType - 'calendar', 'fiscal-us', 'academic', 'custom'
 * @param {Number} q1StartMonth - 1-12
 * @param {String} modifiedBy - Username
 * @returns {Object} { config, quarterChanged, oldQuarter, newQuarter }
 */
export async function updateQuarterConfig(systemType, q1StartMonth, modifiedBy) {
    // Get old config and quarter
    const oldConfig = await getQuarterConfig();
    const oldQuarter = await getCurrentQuarter();

    // Map system types to start months
    const systemMonths = {
        'calendar': 1,    // January
        'fiscal-us': 10,  // October
        'academic': 9,    // September
        'custom': q1StartMonth
    };

    const actualStartMonth = systemMonths[systemType] || q1StartMonth;

    // Update config
    const config = await prisma.quarterSettings.upsert({
        where: { id: 'quarter-config' },
        update: {
            systemType,
            q1StartMonth: actualStartMonth,
            lastModified: new Date(),
            modifiedBy
        },
        create: {
            id: 'quarter-config',
            systemType,
            q1StartMonth: actualStartMonth,
            lastModified: new Date(),
            modifiedBy
        }
    });

    // Check if quarter changed
    const newQuarter = await getCurrentQuarter();
    const quarterChanged = oldQuarter !== newQuarter;

    if (quarterChanged) {
        console.log(`Quarter changed from ${oldQuarter} to ${newQuarter} due to config update`);
        // Archive old quarter and reset
        await archiveQuarterWinners(oldQuarter);
        await resetQuarterlyStats(newQuarter);
    }

    return {
        config,
        quarterChanged,
        oldQuarter,
        newQuarter
    };
}

/**
 * Archive quarter winners before reset
 * @param {String} quarterString - Optional quarter to archive (defaults to current)
 */
export async function archiveQuarterWinners(quarterString = null) {
    try {
        const quarter = quarterString || await getCurrentQuarter();
        const quarterDates = await getQuarterDateRange(quarter);

        console.log(`Archiving winners for ${quarter}`);

        // Get top 3 contributors by points this quarter
        // Note: Prisma doesn't support ordering by JSON field directly, so we fetch all and sort in memory
        const allContributors = await prisma.contributor.findMany({
            select: {
                username: true,
                avatarUrl: true,
                quarterlyStats: true
            }
        });

        // Filter and sort in memory
        const topContributors = allContributors
            .filter(c => 
                c.quarterlyStats?.currentQuarter === quarter &&
                c.quarterlyStats?.pointsThisQuarter > 0
            )
            .sort((a, b) => b.quarterlyStats.pointsThisQuarter - a.quarterlyStats.pointsThisQuarter)
            .slice(0, 3);

        if (topContributors.length === 0) {
            console.log(`No contributors with points in ${quarter}, skipping archive`);
            return null;
        }

        const winner = topContributors[0];
        const top3 = topContributors.map((contributor, index) => ({
            rank: index + 1,
            username: contributor.username,
            avatarUrl: contributor.avatarUrl,
            prsThisQuarter: contributor.quarterlyStats.prsThisQuarter,
            reviewsThisQuarter: contributor.quarterlyStats.reviewsThisQuarter,
            pointsThisQuarter: contributor.quarterlyStats.pointsThisQuarter
        }));

        // Count total participants (contributors with any activity)
        const totalParticipants = allContributors.filter(c =>
            c.quarterlyStats?.currentQuarter === quarter &&
            (c.quarterlyStats?.prsThisQuarter > 0 || c.quarterlyStats?.reviewsThisQuarter > 0)
        ).length;

        const [year, quarterNum] = quarter.split('-Q');

        // Create or update quarterly winner record
        const quarterlyWinner = await prisma.quarterlyWinner.upsert({
            where: { quarter },
            update: {
                year: parseInt(year),
                quarterNumber: parseInt(quarterNum),
                quarterStart: quarterDates.start,
                quarterEnd: quarterDates.end,
                winner: {
                    username: winner.username,
                    avatarUrl: winner.avatarUrl,
                    prsThisQuarter: winner.quarterlyStats.prsThisQuarter,
                    reviewsThisQuarter: winner.quarterlyStats.reviewsThisQuarter,
                    pointsThisQuarter: winner.quarterlyStats.pointsThisQuarter
                },
                top3,
                totalParticipants,
                archivedDate: new Date()
            },
            create: {
                quarter,
                year: parseInt(year),
                quarterNumber: parseInt(quarterNum),
                quarterStart: quarterDates.start,
                quarterEnd: quarterDates.end,
                winner: {
                    username: winner.username,
                    avatarUrl: winner.avatarUrl,
                    prsThisQuarter: winner.quarterlyStats.prsThisQuarter,
                    reviewsThisQuarter: winner.quarterlyStats.reviewsThisQuarter,
                    pointsThisQuarter: winner.quarterlyStats.pointsThisQuarter
                },
                top3,
                totalParticipants,
                archivedDate: new Date()
            }
        });

        console.log(`Archived ${quarter} winner: ${winner.username} with ${winner.quarterlyStats.pointsThisQuarter} points`);

        return quarterlyWinner;
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

        // Reset all contributors' quarterly stats
        const result = await prisma.contributor.updateMany({
            data: {
                quarterlyStats: {
                    currentQuarter: quarter,
                    quarterStartDate: quarterDates.start,
                    quarterEndDate: quarterDates.end,
                    prsThisQuarter: 0,
                    reviewsThisQuarter: 0,
                    pointsThisQuarter: 0,
                    lastUpdated: new Date()
                }
            }
        });

        console.log(`Reset quarterly stats for ${result.count} contributors`);

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
 */
export async function updateQuarterlyStats(username, updates) {
    try {
        const currentQuarter = await getCurrentQuarter();
        const contributor = await prisma.contributor.findUnique({
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
            const quarterDates = await getQuarterDateRange(currentQuarter);
            quarterlyStats = {
                currentQuarter,
                quarterStartDate: quarterDates.start,
                quarterEndDate: quarterDates.end,
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

        const updated = await prisma.contributor.update({
            where: { username },
            data: { quarterlyStats },
            select: { quarterlyStats: true }
        });

        return updated.quarterlyStats;
    } catch (error) {
        console.error(`Error updating quarterly stats for ${username}:`, error);
        throw error;
    }
}

/**
 * Get quarterly leaderboard
 * @param {String} quarterString - Optional quarter (defaults to current)
 * @param {Number} limit - Maximum number of contributors to return
 * @returns {Array} Sorted list of contributors
 */
export async function getQuarterlyLeaderboard(quarterString = null, limit = 50) {
    try {
        const quarter = quarterString || await getCurrentQuarter();

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
 * @returns {Array} Sorted list of contributors
 */
export async function getAllTimeLeaderboard(limit = 50) {
    try {
        const contributors = await prisma.contributor.findMany({
            where: {
                username: {
                    not: {
                        endsWith: '[bot]'
                    }
                }
            },
            orderBy: {
                totalPoints: 'desc'
            },
            take: limit,
            select: {
                username: true,
                avatarUrl: true,
                prCount: true,
                reviewCount: true,
                totalPoints: true,
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
            totalPoints: Number(c.totalPoints),
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
export async function getHallOfFame(limit = 20) {
    try {
        const winners = await prisma.quarterlyWinner.findMany({
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
 * Check if we're in a new quarter and trigger reset if needed
 * @returns {Object} { quarterChanged, oldQuarter, newQuarter }
 */
export async function checkAndResetIfNewQuarter() {
    try {
        const currentQuarter = await getCurrentQuarter();

        // Get a sample contributor to check their current quarter
        const sampleContributor = await prisma.contributor.findFirst({
            where: {
                quarterlyStats: {
                    not: null
                }
            },
            select: {
                quarterlyStats: true
            }
        });

        if (!sampleContributor || !sampleContributor.quarterlyStats?.currentQuarter) {
            // No contributors have quarterly stats yet, initialize for current quarter
            console.log(`Initializing quarterly system for ${currentQuarter}`);
            await resetQuarterlyStats(currentQuarter);
            return {
                quarterChanged: true,
                oldQuarter: null,
                newQuarter: currentQuarter
            };
        }

        const contributorQuarter = sampleContributor.quarterlyStats.currentQuarter;

        if (contributorQuarter !== currentQuarter) {
            console.log(`New quarter detected: ${contributorQuarter} → ${currentQuarter}`);
            await archiveQuarterWinners(contributorQuarter);
            await resetQuarterlyStats(currentQuarter);
            return {
                quarterChanged: true,
                oldQuarter: contributorQuarter,
                newQuarter: currentQuarter
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
