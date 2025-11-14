#!/usr/bin/env node
/**
 * Recalculate Points and Initialize Quarterly Stats
 * 
 * This script:
 * 1. Recalculates total points for all contributors based on their PRs and reviews
 * 2. Initializes quarterly stats for the current quarter
 * 3. Updates contributor statistics
 * 
 * Usage: node scripts/recalculate-points.js
 */

import { PrismaClient } from '@prisma/client';
import { getCurrentQuarter, getQuarterDateRange } from '../services/quarterlyService.js';
import { POINT_VALUES } from '../config/points-config.js';

const prisma = new PrismaClient();

console.log('\n🔄 Recalculating Points and Quarterly Stats');
console.log('='.repeat(60));

async function recalculatePoints() {
    try {
        const contributors = await prisma.contributor.findMany({
            include: {
                processedPRs: true,
                processedReviews: true
            }
        });

        console.log(`\nFound ${contributors.length} contributors to process\n`);

        let totalUpdated = 0;
        const currentQuarter = await getCurrentQuarter();
        const { start: quarterStart, end: quarterEnd } = await getQuarterDateRange(currentQuarter);

        for (const contributor of contributors) {
            // Skip bots
            if (contributor.username.endsWith('[bot]')) {
                console.log(`⏭️  Skipping bot: ${contributor.username}`);
                continue;
            }

            let totalPoints = 0;
            let prsThisQuarter = 0;
            let reviewsThisQuarter = 0;
            let pointsThisQuarter = 0;

            // Calculate points from PRs (using default PR points)
            const prPoints = Number(contributor.prCount) * POINT_VALUES.default;
            totalPoints += prPoints;

            // Count PRs in current quarter
            for (const pr of contributor.processedPRs) {
                if (pr.processedDate >= quarterStart && pr.processedDate <= quarterEnd) {
                    prsThisQuarter++;
                    pointsThisQuarter += POINT_VALUES.default;
                }
            }

            // Calculate points from reviews
            const reviewPoints = Number(contributor.reviewCount) * POINT_VALUES.review;
            totalPoints += reviewPoints;

            // Count reviews in current quarter
            for (const review of contributor.processedReviews) {
                if (review.processedDate >= quarterStart && review.processedDate <= quarterEnd) {
                    reviewsThisQuarter++;
                    pointsThisQuarter += POINT_VALUES.review;
                }
            }

            // Update contributor
            await prisma.contributor.update({
                where: { id: contributor.id },
                data: {
                    totalPoints: BigInt(totalPoints),
                    quarterlyStats: {
                        currentQuarter,
                        quarterStartDate: quarterStart,
                        quarterEndDate: quarterEnd,
                        prsThisQuarter,
                        reviewsThisQuarter,
                        pointsThisQuarter,
                        lastUpdated: new Date()
                    }
                }
            });

            totalUpdated++;
            console.log(`✅ ${contributor.username}`);
            console.log(`   Total: ${totalPoints} pts (${contributor.prCount} PRs, ${contributor.reviewCount} reviews)`);
            console.log(`   Q${currentQuarter}: ${pointsThisQuarter} pts (${prsThisQuarter} PRs, ${reviewsThisQuarter} reviews)`);
        }

        console.log('\n' + '='.repeat(60));
        console.log(`✅ Updated ${totalUpdated} contributors`);
        console.log(`📅 Initialized quarterly stats for ${currentQuarter}`);
        console.log('='.repeat(60));

        // Show top 5
        const top5 = await prisma.contributor.findMany({
            where: {
                username: {
                    not: { endsWith: '[bot]' }
                }
            },
            orderBy: { totalPoints: 'desc' },
            take: 5,
            select: {
                username: true,
                prCount: true,
                reviewCount: true,
                totalPoints: true,
                quarterlyStats: true
            }
        });

        console.log('\n🏆 Top 5 All-Time:');
        top5.forEach((c, i) => {
            console.log(`${i + 1}. ${c.username} - ${c.totalPoints} pts (${c.prCount} PRs, ${c.reviewCount} reviews)`);
        });

        // Show top 5 for current quarter
        const allContributors = await prisma.contributor.findMany({
            where: {
                username: {
                    not: { endsWith: '[bot]' }
                },
                quarterlyStats: {
                    not: null
                }
            },
            select: {
                username: true,
                quarterlyStats: true
            }
        });

        const top5Quarter = allContributors
            .filter(c => c.quarterlyStats?.currentQuarter === currentQuarter && c.quarterlyStats?.pointsThisQuarter > 0)
            .sort((a, b) => b.quarterlyStats.pointsThisQuarter - a.quarterlyStats.pointsThisQuarter)
            .slice(0, 5);

        console.log(`\n📊 Top 5 for ${currentQuarter}:`);
        if (top5Quarter.length === 0) {
            console.log('   No activity in current quarter yet');
        } else {
            top5Quarter.forEach((c, i) => {
                console.log(`${i + 1}. ${c.username} - ${c.quarterlyStats.pointsThisQuarter} pts`);
            });
        }

        console.log('\n✨ Recalculation complete!\n');

    } catch (error) {
        console.error('\n❌ Error:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

recalculatePoints().catch(console.error);
