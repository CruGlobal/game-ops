import { prisma } from '../lib/prisma.js';
import logger from '../utils/logger.js';

/**
 * Get contribution trends over time for a specific contributor
 * @param {String} username - GitHub username
 * @param {Number} days - Number of days to look back (default: 30)
 * @returns {Object} Time-series data for contributions
 */
export const getContributorTrends = async (username, days = 30) => {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const contributor = await prisma.contributor.findUnique({
            where: { username },
            select: {
                username: true,
                contributions: true,
                reviews: true,
                pointsHistory: {
                    where: {
                        timestamp: {
                            gte: cutoffDate
                        }
                    },
                    orderBy: {
                        timestamp: 'asc'
                    }
                }
            }
        });

        if (!contributor) {
            throw new Error('Contributor not found');
        }

        // Filter contribution arrays for the time period
        const recentContributions = contributor.contributions
            ? contributor.contributions.filter(c => new Date(c.date) >= cutoffDate)
            : [];

        const recentReviews = contributor.reviews
            ? contributor.reviews.filter(r => new Date(r.date) >= cutoffDate)
            : [];

        const recentPoints = contributor.pointsHistory.map(p => ({
            ...p,
            points: Number(p.points),
            prNumber: p.prNumber ? Number(p.prNumber) : null
        }));

        return {
            username,
            period: `${days} days`,
            contributions: recentContributions,
            reviews: recentReviews,
            pointsHistory: recentPoints,
            summary: {
                totalPRs: recentContributions.length,
                totalReviews: recentReviews.length,
                totalPoints: recentPoints.reduce((sum, p) => sum + p.points, 0),
                avgPointsPerDay: days > 0 ? recentPoints.reduce((sum, p) => sum + p.points, 0) / days : 0
            }
        };
    } catch (error) {
        logger.error('Error getting contributor trends', {
            username,
            error: error.message
        });
        throw error;
    }
};

/**
 * Get team-wide analytics
 * @param {Number} days - Number of days to look back (default: 30)
 * @returns {Object} Aggregated team analytics
 */
export const getTeamAnalytics = async (days = 30) => {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const contributors = await prisma.contributor.findMany({
            select: {
                contributions: true,
                reviews: true,
                pointsHistory: {
                    where: {
                        timestamp: {
                            gte: cutoffDate
                        }
                    }
                }
            }
        });

        // Aggregate contributions by date
        const contributionsByDate = {};
        const reviewsByDate = {};
        const pointsByDate = {};

        contributors.forEach(contributor => {
            // Process contributions
            if (contributor.contributions) {
                contributor.contributions
                    .filter(c => new Date(c.date) >= cutoffDate)
                    .forEach(c => {
                        const dateKey = new Date(c.date).toISOString().split('T')[0];
                        contributionsByDate[dateKey] = (contributionsByDate[dateKey] || 0) + 1;
                    });
            }

            // Process reviews
            if (contributor.reviews) {
                contributor.reviews
                    .filter(r => new Date(r.date) >= cutoffDate)
                    .forEach(r => {
                        const dateKey = new Date(r.date).toISOString().split('T')[0];
                        reviewsByDate[dateKey] = (reviewsByDate[dateKey] || 0) + 1;
                    });
            }

            // Process points
            if (contributor.pointsHistory) {
                contributor.pointsHistory.forEach(p => {
                    const dateKey = new Date(p.timestamp).toISOString().split('T')[0];
                    pointsByDate[dateKey] = (pointsByDate[dateKey] || 0) + Number(p.points);
                });
            }
        });

        // Convert to time-series arrays
        const dates = Object.keys(contributionsByDate).sort();
        const timeSeries = dates.map(date => ({
            date,
            contributions: contributionsByDate[date] || 0,
            reviews: reviewsByDate[date] || 0,
            points: pointsByDate[date] || 0
        }));

        return {
            period: `${days} days`,
            totalContributors: contributors.length,
            activeContributors: contributors.filter(c =>
                (c.contributions && c.contributions.some(contrib => new Date(contrib.date) >= cutoffDate)) ||
                (c.reviews && c.reviews.some(r => new Date(r.date) >= cutoffDate))
            ).length,
            timeSeries,
            summary: {
                totalPRs: Object.values(contributionsByDate).reduce((sum, val) => sum + val, 0),
                totalReviews: Object.values(reviewsByDate).reduce((sum, val) => sum + val, 0),
                totalPoints: Object.values(pointsByDate).reduce((sum, val) => sum + val, 0)
            }
        };
    } catch (error) {
        logger.error('Error getting team analytics', {
            error: error.message
        });
        throw error;
    }
};

/**
 * Get activity heatmap data (day of week × hour)
 * @param {Number} days - Number of days to look back (default: 90)
 * @returns {Object} Heatmap data
 */
export const getActivityHeatmap = async (days = 90) => {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        const contributors = await prisma.contributor.findMany({
            select: {
                contributions: true,
                reviews: true
            }
        });

        // Initialize heatmap (7 days × 24 hours)
        const heatmap = Array(7).fill(null).map(() => Array(24).fill(0));

        contributors.forEach(contributor => {
            // Process contributions
            if (contributor.contributions) {
                contributor.contributions
                    .filter(c => new Date(c.date) >= cutoffDate)
                    .forEach(c => {
                        const date = new Date(c.date);
                        const dayOfWeek = date.getDay(); // 0 = Sunday
                        const hour = date.getHours();
                        heatmap[dayOfWeek][hour]++;
                    });
            }

            // Process reviews
            if (contributor.reviews) {
                contributor.reviews
                    .filter(r => new Date(r.date) >= cutoffDate)
                    .forEach(r => {
                        const date = new Date(r.date);
                        const dayOfWeek = date.getDay();
                        const hour = date.getHours();
                        heatmap[dayOfWeek][hour]++;
                    });
            }
        });

        return {
            period: `${days} days`,
            heatmap,
            dayLabels: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
            hourLabels: Array.from({ length: 24 }, (_, i) => `${i}:00`)
        };
    } catch (error) {
        logger.error('Error generating activity heatmap', {
            error: error.message
        });
        throw error;
    }
};

/**
 * Get top contributors comparison
 * @param {Number} limit - Number of top contributors (default: 10)
 * @returns {Object} Comparison data
 */
export const getTopContributorsComparison = async (limit = 10) => {
    try {
        const contributors = await prisma.contributor.findMany({
            orderBy: {
                prCount: 'desc'
            },
            take: limit,
            select: {
                username: true,
                prCount: true,
                reviewCount: true,
                totalPoints: true,
                currentStreak: true,
                avatarUrl: true
            }
        });

        return {
            contributors: contributors.map(c => ({
                username: c.username,
                avatarUrl: c.avatarUrl,
                prCount: Number(c.prCount),
                reviewCount: Number(c.reviewCount),
                totalPoints: Number(c.totalPoints),
                currentStreak: Number(c.currentStreak),
                totalContributions: Number(c.prCount) + Number(c.reviewCount)
            }))
        };
    } catch (error) {
        logger.error('Error getting top contributors comparison', {
            error: error.message
        });
        throw error;
    }
};

/**
 * Get challenge participation statistics
 * @returns {Object} Challenge stats
 */
export const getChallengeStats = async () => {
    try {
        const challenges = await prisma.challenge.findMany({
            include: {
                participants: true
            }
        });
        
        const contributors = await prisma.contributor.findMany({
            select: {
                activeChallenges: true,
                completedChallenges: true
            }
        });

        const totalChallenges = challenges.length;
        const activeChallenges = challenges.filter(c => c.status === 'active').length;
        const completedChallenges = challenges.filter(c => c.status === 'completed' || c.status === 'expired').length;

        // Calculate participation rate
        let totalParticipants = 0;
        let totalCompletions = 0;

        challenges.forEach(challenge => {
            totalParticipants += challenge.participants.length;
            totalCompletions += challenge.participants.filter(p => p.completed).length;
        });

        const avgParticipantsPerChallenge = totalChallenges > 0
            ? totalParticipants / totalChallenges
            : 0;

        const completionRate = totalParticipants > 0
            ? (totalCompletions / totalParticipants) * 100
            : 0;

        // Get most popular challenge types
        const challengesByType = {};
        challenges.forEach(challenge => {
            challengesByType[challenge.type] = (challengesByType[challenge.type] || 0) + 1;
        });

        return {
            totalChallenges,
            activeChallenges,
            completedChallenges,
            totalParticipants,
            totalCompletions,
            avgParticipantsPerChallenge: Math.round(avgParticipantsPerChallenge * 10) / 10,
            completionRate: Math.round(completionRate * 10) / 10,
            challengesByType,
            uniqueParticipants: contributors.filter(c =>
                c.activeChallenges.length > 0 || c.completedChallenges.length > 0
            ).length
        };
    } catch (error) {
        logger.error('Error getting challenge stats', {
            error: error.message
        });
        throw error;
    }
};

/**
 * Get growth trends (week-over-week, month-over-month)
 * @returns {Object} Growth metrics
 */
export const getGrowthTrends = async () => {
    try {
        const now = new Date();

        // Calculate date ranges
        const thisWeekStart = new Date(now);
        thisWeekStart.setDate(now.getDate() - now.getDay()); // Start of this week
        thisWeekStart.setHours(0, 0, 0, 0);

        const lastWeekStart = new Date(thisWeekStart);
        lastWeekStart.setDate(thisWeekStart.getDate() - 7);

        const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

        const contributors = await prisma.contributor.findMany({
            select: {
                contributions: true,
                reviews: true
            }
        });

        // Count contributions for each period
        const countForPeriod = (startDate, endDate) => {
            let prs = 0;
            let reviews = 0;

            contributors.forEach(c => {
                if (c.contributions) {
                    prs += c.contributions.filter(contrib => {
                        const date = new Date(contrib.date);
                        return date >= startDate && date < endDate;
                    }).length;
                }

                if (c.reviews) {
                    reviews += c.reviews.filter(r => {
                        const date = new Date(r.date);
                        return date >= startDate && date < endDate;
                    }).length;
                }
            });

            return { prs, reviews };
        };

        const thisWeek = countForPeriod(thisWeekStart, now);
        const lastWeek = countForPeriod(lastWeekStart, thisWeekStart);
        const thisMonth = countForPeriod(thisMonthStart, now);
        const lastMonth = countForPeriod(lastMonthStart, thisMonthStart);

        // Calculate growth percentages
        const weeklyGrowth = lastWeek.prs + lastWeek.reviews > 0
            ? ((thisWeek.prs + thisWeek.reviews - lastWeek.prs - lastWeek.reviews) / (lastWeek.prs + lastWeek.reviews)) * 100
            : 0;

        const monthlyGrowth = lastMonth.prs + lastMonth.reviews > 0
            ? ((thisMonth.prs + thisMonth.reviews - lastMonth.prs - lastMonth.reviews) / (lastMonth.prs + lastMonth.reviews)) * 100
            : 0;

        return {
            weekly: {
                thisWeek: thisWeek.prs + thisWeek.reviews,
                lastWeek: lastWeek.prs + lastWeek.reviews,
                growth: Math.round(weeklyGrowth * 10) / 10,
                breakdown: {
                    thisWeek,
                    lastWeek
                }
            },
            monthly: {
                thisMonth: thisMonth.prs + thisMonth.reviews,
                lastMonth: lastMonth.prs + lastMonth.reviews,
                growth: Math.round(monthlyGrowth * 10) / 10,
                breakdown: {
                    thisMonth,
                    lastMonth
                }
            }
        };
    } catch (error) {
        logger.error('Error calculating growth trends', {
            error: error.message
        });
        throw error;
    }
};

/**
 * Export analytics data to CSV format
 * @param {String} type - Type of export: 'contributors', 'challenges', 'activity'
 * @param {Object} options - Export options (dateRange, filters, etc.)
 * @returns {String} CSV string
 */
export const exportToCSV = async (type, options = {}) => {
    try {
        let csvData = '';

        if (type === 'contributors') {
            const contributors = await prisma.contributor.findMany({
                orderBy: {
                    prCount: 'desc'
                },
                select: {
                    username: true,
                    prCount: true,
                    reviewCount: true,
                    totalPoints: true,
                    currentStreak: true,
                    longestStreak: true,
                    totalBillsAwarded: true,
                    badges: true
                }
            });

            // CSV Header
            csvData = 'Username,PR Count,Review Count,Total Points,Current Streak,Longest Streak,Total Bills,Badges\n';

            // CSV Rows
            contributors.forEach(c => {
                const badgeCount = c.badges ? c.badges.length : 0;
                csvData += `"${c.username}",${Number(c.prCount)},${Number(c.reviewCount)},${Number(c.totalPoints)},${Number(c.currentStreak)},${Number(c.longestStreak)},${Number(c.totalBillsAwarded)},${badgeCount}\n`;
            });

        } else if (type === 'challenges') {
            const challenges = await prisma.challenge.findMany({
                orderBy: {
                    startDate: 'desc'
                },
                include: {
                    participants: true
                }
            });

            csvData = 'Title,Type,Target,Reward,Status,Participants,Completions,Start Date,End Date\n';

            challenges.forEach(c => {
                const completions = c.participants.filter(p => p.completed).length;
                csvData += `"${c.title}","${c.type}",${c.target},${c.reward},"${c.status}",${c.participants.length},${completions},"${c.startDate.toISOString()}","${c.endDate.toISOString()}"\n`;
            });

        } else if (type === 'activity') {
            const days = options.days || 30;
            const teamData = await getTeamAnalytics(days);

            csvData = 'Date,Contributions,Reviews,Points\n';

            teamData.timeSeries.forEach(day => {
                csvData += `"${day.date}",${day.contributions},${day.reviews},${day.points}\n`;
            });
        }

        return csvData;
    } catch (error) {
        logger.error('Error exporting to CSV', {
            type,
            error: error.message
        });
        throw error;
    }
};
