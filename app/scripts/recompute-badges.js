/**
 * Recompute and Award All Badges
 *
 * This script checks all contributors and awards missing badges based on their
 * current stats. It handles:
 * - PR milestone badges (1, 10, 50, 100, 500, 1000)
 * - Review badges (10, 50, 100)
 * - Streak badges (7, 30, 90, 365 days)
 * - Achievement badges (based on points, challenges, etc.)
 *
 * Safe to run multiple times - only awards badges that are missing.
 */

import { prisma } from '../lib/prisma.js';
import { checkAndAwardAchievements } from '../services/achievementService.js';
import { checkStreakBadges } from '../services/streakService.js';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Check and award PR milestone badges
 */
async function awardPRBadges(contributor) {
    const prCount = Number(contributor.prCount);
    const updates = {};
    const newBadges = [];

    const milestones = [
        { threshold: 1, flag: 'firstPrAwarded', name: 'First PR' },
        { threshold: 10, flag: 'first10PrsAwarded', name: '10 PRs' },
        { threshold: 50, flag: 'first50PrsAwarded', name: '50 PRs' },
        { threshold: 100, flag: 'first100PrsAwarded', name: '100 PRs' },
        { threshold: 500, flag: 'first500PrsAwarded', name: '500 PRs' },
        { threshold: 1000, flag: 'first1000PrsAwarded', name: '1000 PRs' }
    ];

    for (const milestone of milestones) {
        if (prCount >= milestone.threshold && !contributor[milestone.flag]) {
            updates[milestone.flag] = true;
            newBadges.push(milestone.name);
        }
    }

    return { updates, newBadges };
}

/**
 * Check and award review milestone badges
 */
async function awardReviewBadges(contributor) {
    const reviewCount = Number(contributor.reviewCount);
    const updates = {};
    const newBadges = [];

    const milestones = [
        { threshold: 1, flag: 'firstReviewAwarded', name: 'First Review' },
        { threshold: 10, flag: 'first10ReviewsAwarded', name: '10 Reviews' },
        { threshold: 50, flag: 'first50ReviewsAwarded', name: '50 Reviews' },
        { threshold: 100, flag: 'first100ReviewsAwarded', name: '100 Reviews' },
        { threshold: 500, flag: 'first500ReviewsAwarded', name: '500 Reviews' },
        { threshold: 1000, flag: 'first1000ReviewsAwarded', name: '1000 Reviews' }
    ];

    for (const milestone of milestones) {
        if (reviewCount >= milestone.threshold && !contributor[milestone.flag]) {
            updates[milestone.flag] = true;
            newBadges.push(milestone.name);
        }
    }

    return { updates, newBadges };
}

/**
 * Check and award Bill awards
 */
async function awardBillVonetteAwards(contributor) {
    const prCount = Number(contributor.prCount);
    const totalBills = Number(contributor.totalBillsAwarded || 0);
    const updates = {};
    let billsToAward = 0;

    // Award Bill for every 50 PRs
    const billsEarned = Math.floor(prCount / 50);
    if (billsEarned > totalBills) {
        billsToAward = billsEarned - totalBills;
        updates.totalBillsAwarded = billsEarned;
    }

    return { updates, billsToAward };
}

/**
 * Recompute badges for all contributors
 */
async function recomputeAllBadges() {
    console.log('🏅 Recomputing and Awarding All Badges\n');
    console.log('=' .repeat(80) + '\n');

    try {
        // Get all contributors with their current badge status
        const contributors = await prisma.contributor.findMany({
            where: {
                username: {
                    not: {
                        endsWith: '[bot]'
                    }
                }
            },
            include: {
                achievements: true,
                completedChallenges: true
            },
            orderBy: {
                prCount: 'desc'
            }
        });

        console.log(`Found ${contributors.length} contributors\n`);

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
            try {
                // Skip contributors with no activity
                if (Number(contributor.prCount) === 0 && Number(contributor.reviewCount) === 0) {
                    stats.skipped++;
                    continue;
                }

                const allUpdates = {};
                const badgesAwarded = [];

                // Check PR badges
                const prBadges = await awardPRBadges(contributor);
                Object.assign(allUpdates, prBadges.updates);
                badgesAwarded.push(...prBadges.newBadges);
                stats.prBadgesAwarded += prBadges.newBadges.length;

                // Check review badges
                const reviewBadges = await awardReviewBadges(contributor);
                Object.assign(allUpdates, reviewBadges.updates);
                badgesAwarded.push(...reviewBadges.newBadges);
                stats.reviewBadgesAwarded += reviewBadges.newBadges.length;

                // Check Bill/Vonette awards
                const billAwards = await awardBillVonetteAwards(contributor);
                Object.assign(allUpdates, billAwards.updates);
                if (billAwards.billsToAward > 0) {
                    badgesAwarded.push(`${billAwards.billsToAward} Bill(s)`);
                    stats.billsAwarded += billAwards.billsToAward;
                }

                // Check streak badges
                const streakBadges = await checkStreakBadges(contributor);
                if (streakBadges.length > 0) {
                    badgesAwarded.push(...streakBadges.map(b => b.name));
                    stats.streakBadgesAwarded += streakBadges.length;
                }

                // Check achievements (points, challenges, etc.)
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

                if (badgesAwarded.length > 0) {
                    console.log(`✅ ${contributor.username}: ${badgesAwarded.join(', ')}`);
                }

                stats.processed++;

                // Progress indicator
                if (stats.processed % 25 === 0) {
                    console.log(`   ... processed ${stats.processed}/${contributors.length}`);
                }

            } catch (error) {
                console.error(`❌ Error processing ${contributor.username}:`, error.message);
            }
        }

        console.log('\n' + '='.repeat(80));
        console.log('\n📊 Badge Recomputation Summary:');
        console.log(`   Total contributors: ${contributors.length}`);
        console.log(`   Processed: ${stats.processed}`);
        console.log(`   Skipped (no activity): ${stats.skipped}`);
        console.log('\n🏅 Badges Awarded:');
        console.log(`   PR Badges: ${stats.prBadgesAwarded}`);
        console.log(`   Review Badges: ${stats.reviewBadgesAwarded}`);
        console.log(`   Streak Badges: ${stats.streakBadgesAwarded}`);
        console.log(`   Achievements: ${stats.achievementsAwarded}`);
        console.log(`   Bills/Vonettes: ${stats.billsAwarded}`);
        console.log(`   Total: ${stats.prBadgesAwarded + stats.reviewBadgesAwarded + stats.streakBadgesAwarded + stats.achievementsAwarded + stats.billsAwarded}`);

        // Show badge distribution
        console.log('\n🎖️  Badge Holders:');

        console.log(`   1000 PRs: ${await prisma.contributor.count({ where: { first1000PrsAwarded: true } })} contributors`);
        console.log(`   500 PRs:  ${await prisma.contributor.count({ where: { first500PrsAwarded: true } })} contributors`);
        console.log(`   100 PRs:  ${await prisma.contributor.count({ where: { first100PrsAwarded: true } })} contributors`);
        console.log(`   50 PRs:   ${await prisma.contributor.count({ where: { first50PrsAwarded: true } })} contributors`);
        console.log(`   10 PRs:   ${await prisma.contributor.count({ where: { first10PrsAwarded: true } })} contributors`);

        console.log('\n✅ Badge recomputation complete!\n');

    } catch (error) {
        console.error('❌ Fatal error during recomputation:', error);
        throw error;
    }
}

// Run the recomputation
recomputeAllBadges()
    .catch(error => {
        console.error('Error:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
