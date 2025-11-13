/**
 * Cleanup Duplicate Achievement Points
 *
 * This script removes duplicate "Achievement Unlocked" point_history records
 * that were created during the October 22, 2025 backfill due to a bug where
 * the contributor's achievements relation was not included in the query.
 *
 * The bug caused checkAndAwardAchievements to think no achievements were earned,
 * resulting in the same achievements being awarded multiple times per PR/review.
 *
 * This script:
 * 1. Identifies all duplicate Achievement Unlocked records
 * 2. Groups them by contributor and achievement type (points value)
 * 3. Keeps only ONE record per achievement per contributor
 * 4. Deletes all duplicates
 * 5. Recalculates contributor totalPoints
 * 6. Recomputes Hall of Fame
 */

import { prisma } from '../lib/prisma.js';
import { recomputeHallOfFameAll } from '../services/quarterlyService.js';
import dotenv from 'dotenv';

dotenv.config();

async function cleanupDuplicateAchievements() {
    console.log('🧹 Starting cleanup of duplicate achievement points...\n');

    try {
        // 1. Get all Achievement Unlocked records
        const achievementRecords = await prisma.pointHistory.findMany({
            where: {
                reason: 'Achievement Unlocked'
            },
            orderBy: [
                { contributorId: 'asc' },
                { points: 'asc' },
                { timestamp: 'asc' }
            ]
        });

        console.log(`Found ${achievementRecords.length} total Achievement Unlocked records\n`);

        // 2. Group by contributor and points (each point value represents a unique achievement)
        const grouped = new Map();
        for (const record of achievementRecords) {
            const key = `${record.contributorId}-${record.points}`;
            if (!grouped.has(key)) {
                grouped.set(key, []);
            }
            grouped.get(key).push(record);
        }

        console.log(`Grouped into ${grouped.size} unique achievement types\n`);

        // 3. Identify duplicates (keep first, delete rest)
        let totalDuplicates = 0;
        let totalPointsToRemove = 0;
        const idsToDelete = [];

        for (const [key, records] of grouped) {
            if (records.length > 1) {
                // Keep the first (earliest) record, delete the rest
                const duplicates = records.slice(1);
                totalDuplicates += duplicates.length;
                totalPointsToRemove += duplicates.reduce((sum, r) => sum + Number(r.points), 0);
                idsToDelete.push(...duplicates.map(r => r.id));

                const [contributorId, points] = key.split('-');
                console.log(`  Contributor ${contributorId.substring(0, 8)}...: ${records.length} copies of ${points}-point achievement (removing ${duplicates.length})`);
            }
        }

        console.log(`\n📊 Summary:`);
        console.log(`  - Total duplicates to remove: ${totalDuplicates}`);
        console.log(`  - Total points to remove: ${totalPointsToRemove}`);
        console.log(`  - Unique achievements to keep: ${grouped.size}\n`);

        // 4. Delete duplicates in batches
        console.log('🗑️  Deleting duplicate records...');
        const batchSize = 1000;
        let deleted = 0;

        for (let i = 0; i < idsToDelete.length; i += batchSize) {
            const batch = idsToDelete.slice(i, i + batchSize);
            await prisma.pointHistory.deleteMany({
                where: {
                    id: { in: batch }
                }
            });
            deleted += batch.length;
            console.log(`  Deleted ${deleted}/${idsToDelete.length} records...`);
        }

        console.log(`✅ Deleted ${deleted} duplicate achievement records\n`);

        // 5. Recalculate totalPoints for all contributors
        console.log('🔢 Recalculating totalPoints for all contributors...');

        const contributors = await prisma.contributor.findMany({
            select: { id: true, username: true }
        });

        for (const contributor of contributors) {
            // Sum all point_history for this contributor
            const result = await prisma.pointHistory.aggregate({
                where: { contributorId: contributor.id },
                _sum: { points: true }
            });

            const correctTotal = result._sum.points || 0n;

            // Update contributor's totalPoints
            await prisma.contributor.update({
                where: { id: contributor.id },
                data: { totalPoints: correctTotal }
            });

            console.log(`  Updated ${contributor.username}: ${correctTotal} points`);
        }

        console.log(`✅ Recalculated totalPoints for ${contributors.length} contributors\n`);

        // 6. Recompute Hall of Fame
        console.log('🏆 Recomputing Hall of Fame with corrected points...');
        await recomputeHallOfFameAll();
        console.log('✅ Hall of Fame recomputed\n');

        console.log('🎉 Cleanup complete!\n');
        console.log('Summary:');
        console.log(`  - Removed ${deleted} duplicate achievement records`);
        console.log(`  - Removed ${totalPointsToRemove} inflated points`);
        console.log(`  - Updated ${contributors.length} contributor totalPoints`);
        console.log(`  - Recomputed Hall of Fame for all quarters`);

    } catch (error) {
        console.error('❌ Error during cleanup:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

// Run the cleanup
cleanupDuplicateAchievements()
    .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
