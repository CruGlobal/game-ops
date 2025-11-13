/**
 * Recompute Streaks from Historical Data
 *
 * This script calculates streaks from existing contributions and reviews tables
 * without running a full backfill. It processes historical data to compute:
 * - Current streak (as of the most recent contribution)
 * - Longest streak ever achieved
 * - Last contribution date
 *
 * Uses the workweek-aware streak logic:
 * - Counts both PR merges and code reviews
 * - Business days only (Mon-Fri)
 * - Weekend gaps allowed
 */

import { prisma } from '../lib/prisma.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Calculate business days between two dates (excluding weekends)
 */
function getBusinessDaysBetween(startDate, endDate) {
    let businessDays = 0;
    let currentDate = new Date(startDate);
    currentDate.setDate(currentDate.getDate() + 1);

    while (currentDate <= endDate) {
        const dayOfWeek = currentDate.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
            businessDays++;
        }
        currentDate.setDate(currentDate.getDate() + 1);
    }

    return businessDays;
}

/**
 * Get all contribution dates for a contributor (PRs + reviews combined)
 */
async function getContributionDates(contributorId) {
    // Get PR dates
    const prDates = await prisma.contribution.findMany({
        where: {
            contributorId,
            merged: true
        },
        select: { date: true },
        distinct: ['date'],
        orderBy: { date: 'asc' }
    });

    // Get review dates
    const reviewDates = await prisma.review.findMany({
        where: { contributorId },
        select: { date: true },
        distinct: ['date'],
        orderBy: { date: 'asc' }
    });

    // Combine and deduplicate dates
    const allDates = new Set();
    prDates.forEach(p => allDates.add(p.date.toISOString().split('T')[0]));
    reviewDates.forEach(r => allDates.add(r.date.toISOString().split('T')[0]));

    // Convert back to Date objects and sort
    return Array.from(allDates)
        .map(dateStr => new Date(dateStr + 'T00:00:00Z'))
        .sort((a, b) => a - b);
}

/**
 * Calculate streaks from date array
 */
function calculateStreaks(dates) {
    if (dates.length === 0) {
        return {
            currentStreak: 0,
            longestStreak: 0,
            lastContributionDate: null
        };
    }

    let currentStreak = 1;
    let longestStreak = 1;
    let tempStreak = 1;

    // Calculate streaks by checking business day gaps
    for (let i = 1; i < dates.length; i++) {
        const prevDate = dates[i - 1];
        const currDate = dates[i];
        const businessDaysGap = getBusinessDaysBetween(prevDate, currDate);

        if (businessDaysGap === 0) {
            // Same day or only weekend passed - maintain streak
            continue;
        } else if (businessDaysGap === 1) {
            // Next business day - increment streak
            tempStreak++;
            longestStreak = Math.max(longestStreak, tempStreak);
        } else {
            // Gap too large - reset streak
            tempStreak = 1;
        }
    }

    // Current streak is the streak at the end of the timeline
    currentStreak = tempStreak;

    // Check if current streak is still valid (not too old)
    const lastDate = dates[dates.length - 1];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const businessDaysSinceLastContribution = getBusinessDaysBetween(lastDate, today);

    // If more than 1 business day has passed, current streak is broken
    if (businessDaysSinceLastContribution > 1) {
        currentStreak = 0;
    }

    return {
        currentStreak,
        longestStreak,
        lastContributionDate: lastDate
    };
}

/**
 * Recompute streaks for all contributors
 */
async function recomputeAllStreaks() {
    console.log('🔄 Recomputing Streaks from Historical Data\n');
    console.log('=' .repeat(80) + '\n');

    try {
        // Get all contributors
        const contributors = await prisma.contributor.findMany({
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
                prCount: true,
                reviewCount: true
            },
            orderBy: {
                prCount: 'desc'
            }
        });

        console.log(`Found ${contributors.length} contributors\n`);

        let processed = 0;
        let updated = 0;
        let skipped = 0;

        for (const contributor of contributors) {
            try {
                // Skip contributors with no activity
                if (Number(contributor.prCount) === 0 && Number(contributor.reviewCount) === 0) {
                    skipped++;
                    continue;
                }

                // Get all contribution dates
                const dates = await getContributionDates(contributor.id);

                if (dates.length === 0) {
                    skipped++;
                    continue;
                }

                // Calculate streaks
                const streakData = calculateStreaks(dates);

                // Update contributor
                await prisma.contributor.update({
                    where: { id: contributor.id },
                    data: {
                        currentStreak: streakData.currentStreak,
                        longestStreak: streakData.longestStreak,
                        lastContributionDate: streakData.lastContributionDate
                    }
                });

                updated++;
                processed++;

                if (streakData.currentStreak > 0 || streakData.longestStreak > 7) {
                    console.log(`✅ ${contributor.username}: current=${streakData.currentStreak}, longest=${streakData.longestStreak}, days=${dates.length}`);
                }

                // Progress indicator every 10 contributors
                if (processed % 10 === 0) {
                    console.log(`   ... processed ${processed}/${contributors.length}`);
                }

            } catch (error) {
                console.error(`❌ Error processing ${contributor.username}:`, error.message);
            }
        }

        console.log('\n' + '='.repeat(80));
        console.log('\n📊 Recomputation Summary:');
        console.log(`   Total contributors: ${contributors.length}`);
        console.log(`   Updated: ${updated}`);
        console.log(`   Skipped (no activity): ${skipped}`);
        console.log(`   Errors: ${contributors.length - updated - skipped}`);

        // Show top streaks
        console.log('\n🏆 Top Current Streaks:');
        const topCurrent = await prisma.contributor.findMany({
            where: {
                currentStreak: { gt: 0 }
            },
            orderBy: {
                currentStreak: 'desc'
            },
            take: 5,
            select: {
                username: true,
                currentStreak: true,
                longestStreak: true
            }
        });

        topCurrent.forEach((c, i) => {
            console.log(`   ${i + 1}. ${c.username}: ${Number(c.currentStreak)} days (longest: ${Number(c.longestStreak)})`);
        });

        console.log('\n🎖️  Top All-Time Streaks:');
        const topLongest = await prisma.contributor.findMany({
            where: {
                longestStreak: { gt: 0 }
            },
            orderBy: {
                longestStreak: 'desc'
            },
            take: 5,
            select: {
                username: true,
                currentStreak: true,
                longestStreak: true
            }
        });

        topLongest.forEach((c, i) => {
            console.log(`   ${i + 1}. ${c.username}: ${Number(c.longestStreak)} days (current: ${Number(c.currentStreak)})`);
        });

        console.log('\n✅ Streak recomputation complete!\n');

    } catch (error) {
        console.error('❌ Fatal error during recomputation:', error);
        throw error;
    }
}

// Run the recomputation
recomputeAllStreaks()
    .catch(error => {
        console.error('Error:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
