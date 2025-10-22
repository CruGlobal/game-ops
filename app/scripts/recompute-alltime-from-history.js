#!/usr/bin/env node
/**
 * Recompute contributors' all-time totalPoints from pointHistory
 * - Sums all pointHistory.points per contributor and updates contributor.totalPoints
 * - Does not touch quarterlyStats (use recompute-quarter-history for that)
 *
 * Usage:
 *   npm run recompute:alltime:history
 */
import { prisma } from '../lib/prisma.js';

async function main() {
  try {
    console.log('\nRecomputing all-time totals from pointHistory...');
    // Group sums by contributorId
    const sums = await prisma.pointHistory.groupBy({
      by: ['contributorId'],
      _sum: { points: true }
    });

    // Map contributorId -> sum
    const toUpdate = sums
      .filter(s => s.contributorId && s._sum && s._sum.points !== null)
      .map(s => ({ id: String(s.contributorId), total: BigInt(s._sum.points || 0n) }));

    console.log(`Found ${toUpdate.length} contributors with point history`);

    let updated = 0;
    for (const row of toUpdate) {
      await prisma.contributor.update({
        where: { id: row.id },
        data: { totalPoints: row.total }
      });
      updated++;
    }

    console.log(`✅ All-time totals updated for ${updated} contributors`);
  } catch (err) {
    console.error('❌ Recompute all-time failed:', err.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
