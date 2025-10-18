import Contributor from '../models/contributor.js';
import QuarterSettings from '../models/quarterSettings.js';
import QuarterlyWinner from '../models/quarterlyWinner.js';

/**
 * Get quarter configuration from database
 * @returns {Object} Quarter settings
 */
export async function getQuarterConfig() {
    let config = await QuarterSettings.findById('quarter-config');

    if (!config) {
        // Create default config (calendar quarters)
        config = new QuarterSettings({
            _id: 'quarter-config',
            systemType: 'calendar',
            q1StartMonth: 1
        });
        await config.save();
        console.log('Created default quarter configuration (calendar)');
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
    const q1Start = config.getQuarterMonths();

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

    const q1Start = config.getQuarterMonths();

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
    const config = await QuarterSettings.findByIdAndUpdate(
        'quarter-config',
        {
            systemType,
            q1StartMonth: actualStartMonth,
            lastModified: new Date(),
            modifiedBy
        },
        { upsert: true, new: true }
    );

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
        const topContributors = await Contributor.find({
            'quarterlyStats.currentQuarter': quarter,
            'quarterlyStats.pointsThisQuarter': { $gt: 0 }
        })
            .sort({ 'quarterlyStats.pointsThisQuarter': -1 })
            .limit(3)
            .select('username avatarUrl quarterlyStats')
            .lean();

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
        const totalParticipants = await Contributor.countDocuments({
            'quarterlyStats.currentQuarter': quarter,
            $or: [
                { 'quarterlyStats.prsThisQuarter': { $gt: 0 } },
                { 'quarterlyStats.reviewsThisQuarter': { $gt: 0 } }
            ]
        });

        const [year, quarterNum] = quarter.split('-Q');

        // Create or update quarterly winner record
        const quarterlyWinner = await QuarterlyWinner.findOneAndUpdate(
            { quarter },
            {
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
            },
            { upsert: true, new: true }
        );

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
        const result = await Contributor.updateMany(
            {},
            {
                $set: {
                    'quarterlyStats.currentQuarter': quarter,
                    'quarterlyStats.quarterStartDate': quarterDates.start,
                    'quarterlyStats.quarterEndDate': quarterDates.end,
                    'quarterlyStats.prsThisQuarter': 0,
                    'quarterlyStats.reviewsThisQuarter': 0,
                    'quarterlyStats.pointsThisQuarter': 0,
                    'quarterlyStats.lastUpdated': new Date()
                }
            }
        );

        console.log(`Reset quarterly stats for ${result.modifiedCount} contributors`);

        return {
            quarter,
            contributorsReset: result.modifiedCount,
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
        const contributor = await Contributor.findOne({ username });

        if (!contributor) {
            console.warn(`Contributor ${username} not found for quarterly update`);
            return null;
        }

        // Initialize quarterly stats if not set or if quarter changed
        if (!contributor.quarterlyStats.currentQuarter ||
            contributor.quarterlyStats.currentQuarter !== currentQuarter) {
            const quarterDates = await getQuarterDateRange(currentQuarter);
            contributor.quarterlyStats = {
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
            contributor.quarterlyStats.prsThisQuarter += updates.prs;
        }
        if (updates.reviews) {
            contributor.quarterlyStats.reviewsThisQuarter += updates.reviews;
        }
        if (updates.points) {
            contributor.quarterlyStats.pointsThisQuarter += updates.points;
        }

        contributor.quarterlyStats.lastUpdated = new Date();

        await contributor.save();

        return contributor.quarterlyStats;
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

        const contributors = await Contributor.find({
            'quarterlyStats.currentQuarter': quarter,
            username: { $not: /\[bot\]$/ }
        })
            .sort({ 'quarterlyStats.pointsThisQuarter': -1 })
            .limit(limit)
            .select('username avatarUrl quarterlyStats prCount reviewCount totalPoints currentStreak longestStreak totalBillsAwarded badges streakBadges')
            .lean();

        return contributors;
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
        const contributors = await Contributor.find({
            username: { $not: /\[bot\]$/ }
        })
            .sort({ totalPoints: -1 })
            .limit(limit)
            .select('username avatarUrl prCount reviewCount totalPoints quarterlyStats currentStreak longestStreak totalBillsAwarded badges streakBadges')
            .lean();

        return contributors;
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
        const winners = await QuarterlyWinner.find({})
            .sort({ year: -1, quarterNumber: -1 })
            .limit(limit)
            .lean();

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
        const sampleContributor = await Contributor.findOne({
            'quarterlyStats.currentQuarter': { $exists: true, $ne: null }
        }).select('quarterlyStats.currentQuarter');

        if (!sampleContributor || !sampleContributor.quarterlyStats.currentQuarter) {
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
