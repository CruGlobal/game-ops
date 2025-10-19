import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Contributor from '../../models/contributor.js';
import QuarterlyWinner from '../../models/quarterlyWinner.js';
import { getQuarterConfig, getQuarterDateRange } from '../../services/quarterlyService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenv.config({ path: join(__dirname, '../../../.env') });

/**
 * Calculate which quarter a date falls into based on quarter configuration
 */
function getQuarterForDate(date, q1StartMonth) {
    const year = date.getFullYear();
    const month = date.getMonth() + 1; // 1-12

    // Calculate which quarter this month falls into
    // q1StartMonth = 1 (Jan) → Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec
    // q1StartMonth = 4 (Apr) → Q1: Apr-Jun, Q2: Jul-Sep, Q3: Oct-Dec, Q4: Jan-Mar
    let quarterNum;
    let quarterYear = year;

    const monthsFromQ1Start = (month - q1StartMonth + 12) % 12;
    quarterNum = Math.floor(monthsFromQ1Start / 3) + 1;

    // If we're in months before Q1 start, we're in Q4 of previous year's cycle
    if (month < q1StartMonth) {
        quarterYear = year - 1;
    }

    return `${quarterYear}-Q${quarterNum}`;
}

/**
 * Get all unique quarters from historical data
 */
async function getAllHistoricalQuarters(q1StartMonth) {
    const contributors = await Contributor.find({}).lean();
    const quarters = new Set();

    for (const contributor of contributors) {
        // Check contributions
        if (contributor.contributions && contributor.contributions.length > 0) {
            contributor.contributions.forEach(contribution => {
                if (contribution.merged) {
                    const quarter = getQuarterForDate(new Date(contribution.date), q1StartMonth);
                    quarters.add(quarter);
                }
            });
        }

        // Check reviews
        if (contributor.reviews && contributor.reviews.length > 0) {
            contributor.reviews.forEach(review => {
                const quarter = getQuarterForDate(new Date(review.date), q1StartMonth);
                quarters.add(quarter);
            });
        }
    }

    // Sort quarters chronologically
    return Array.from(quarters).sort((a, b) => {
        const [yearA, qA] = a.split('-Q').map(Number);
        const [yearB, qB] = b.split('-Q').map(Number);
        return yearA !== yearB ? yearA - yearB : qA - qB;
    });
}

/**
 * Calculate stats for a specific quarter
 */
async function calculateQuarterStats(quarter, quarterDates) {
    const quarterStart = new Date(quarterDates.start);
    const quarterEnd = new Date(quarterDates.end);

    const contributors = await Contributor.find({}).lean();
    const quarterStats = [];

    for (const contributor of contributors) {
        let prsThisQuarter = 0;
        let reviewsThisQuarter = 0;
        let pointsThisQuarter = 0;

        // Count PRs in this quarter
        if (contributor.contributions && contributor.contributions.length > 0) {
            contributor.contributions.forEach(contribution => {
                const contribDate = new Date(contribution.date);
                if (contribDate >= quarterStart && contribDate <= quarterEnd && contribution.merged) {
                    prsThisQuarter++;
                }
            });
        }

        // Count reviews in this quarter
        if (contributor.reviews && contributor.reviews.length > 0) {
            contributor.reviews.forEach(review => {
                const reviewDate = new Date(review.date);
                if (reviewDate >= quarterStart && reviewDate <= quarterEnd) {
                    reviewsThisQuarter++;
                }
            });
        }

        // Calculate points for this quarter (10 per PR, 5 per review - simplified)
        // Note: We can't retroactively calculate label bonuses without PR metadata
        pointsThisQuarter = (prsThisQuarter * 10) + (reviewsThisQuarter * 5);

        // Only include contributors with activity
        if (prsThisQuarter > 0 || reviewsThisQuarter > 0) {
            quarterStats.push({
                username: contributor.username,
                avatarUrl: contributor.avatarUrl,
                prsThisQuarter,
                reviewsThisQuarter,
                pointsThisQuarter
            });
        }
    }

    // Sort by points descending
    quarterStats.sort((a, b) => b.pointsThisQuarter - a.pointsThisQuarter);

    return quarterStats;
}

/**
 * Archive winners for a specific quarter
 */
async function archiveQuarter(quarter, quarterDates, quarterStats) {
    if (quarterStats.length === 0) {
        console.log(`   ⚠️  No activity in ${quarter}, skipping`);
        return null;
    }

    const top3 = quarterStats.slice(0, 3).map((contributor, index) => ({
        rank: index + 1,
        username: contributor.username,
        avatarUrl: contributor.avatarUrl,
        prsThisQuarter: contributor.prsThisQuarter,
        reviewsThisQuarter: contributor.reviewsThisQuarter,
        pointsThisQuarter: contributor.pointsThisQuarter
    }));

    const winner = quarterStats[0];
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
                prsThisQuarter: winner.prsThisQuarter,
                reviewsThisQuarter: winner.reviewsThisQuarter,
                pointsThisQuarter: winner.pointsThisQuarter
            },
            top3,
            totalParticipants: quarterStats.length,
            archivedDate: new Date()
        },
        { upsert: true, new: true }
    );

    console.log(`   ✅ ${quarter}: ${winner.username} - ${winner.pointsThisQuarter} pts (${winner.prsThisQuarter} PRs, ${winner.reviewsThisQuarter} reviews)`);
    return quarterlyWinner;
}

/**
 * Main backfill function
 */
async function backfillHallOfFame() {
    try {
        // Connect to MongoDB (use localhost for scripts running outside Docker)
        const mongoUri = 'mongodb://localhost:27017/github-scoreboard';
        await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB\n');

        // Get quarter configuration
        const config = await getQuarterConfig();
        console.log(`📅 Quarter System: ${config.systemType}`);
        console.log(`📅 Q1 Starts: Month ${config.q1StartMonth}\n`);

        // Get all historical quarters
        console.log('🔍 Scanning historical data for quarters...\n');
        const allQuarters = await getAllHistoricalQuarters(config.q1StartMonth);
        console.log(`📊 Found ${allQuarters.length} quarters with activity:\n`);

        // Check if any winners already exist
        const existingWinners = await QuarterlyWinner.find({}).lean();
        console.log(`📚 Existing Hall of Fame entries: ${existingWinners.length}\n`);

        if (existingWinners.length > 0) {
            console.log('⚠️  Hall of Fame already has entries. This will update/overwrite them.\n');
            console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
            await new Promise(resolve => setTimeout(resolve, 5000));
        }

        console.log('🏆 BACKFILLING HALL OF FAME\n');
        console.log('='.repeat(80));
        console.log('');

        let archived = 0;
        let skipped = 0;

        // Process each quarter
        for (const quarter of allQuarters) {
            try {
                const quarterDates = await getQuarterDateRange(quarter);
                const quarterStats = await calculateQuarterStats(quarter, quarterDates);

                if (quarterStats.length > 0) {
                    await archiveQuarter(quarter, quarterDates, quarterStats);
                    archived++;
                } else {
                    skipped++;
                }
            } catch (error) {
                console.log(`   ❌ Error processing ${quarter}: ${error.message}`);
            }
        }

        console.log('\n' + '='.repeat(80));
        console.log('\n✅ HALL OF FAME BACKFILL COMPLETE!\n');
        console.log(`   Quarters archived: ${archived}`);
        console.log(`   Quarters skipped (no activity): ${skipped}`);
        console.log(`   Total quarters processed: ${allQuarters.length}\n`);

        // Show sample of winners
        const recentWinners = await QuarterlyWinner.find({})
            .sort({ year: -1, quarterNumber: -1 })
            .limit(5)
            .lean();

        console.log('🏅 RECENT CHAMPIONS:\n');
        for (const winner of recentWinners) {
            console.log(`   ${winner.quarter}: ${winner.winner.username} - ${winner.winner.pointsThisQuarter} points`);
        }

        console.log('\n📋 NEXT STEPS:\n');
        console.log('   1. Visit the Leaderboard page');
        console.log('   2. Click the "Hall of Fame" tab');
        console.log('   3. View all historical quarterly winners!');
        console.log('');

        // Disconnect
        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB\n');

    } catch (error) {
        console.error('❌ Error:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

backfillHallOfFame();
