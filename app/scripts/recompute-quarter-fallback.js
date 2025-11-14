#!/usr/bin/env node
/**
 * Recompute This Quarter leaderboard from processed tables (fallback)
 * - Calls recomputeCurrentQuarterStatsFallback() which derives quarter stats from
 *   Contribution/Review aggregates or processedPR/processedReview if needed.
 * - Does NOT alter all-time totals; only updates contributor.quarterlyStats.
 *
 * Usage: npm run recompute:quarter:fallback
 */

import dotenv from 'dotenv';
import { prisma } from '../lib/prisma.js';
import { getCurrentQuarter, getQuarterDateRange, recomputeCurrentQuarterStatsFallback } from '../services/quarterlyService.js';

dotenv.config();

async function main() {
  try {
    const quarter = await getCurrentQuarter();
    const { start, end } = await getQuarterDateRange(quarter);
    console.log(`\n🔄 Recomputing This Quarter from processed tables (fallback)`);
    console.log(`Quarter: ${quarter}`);
    console.log(`Range: ${start.toISOString()} → ${end.toISOString()}`);

    const res = await recomputeCurrentQuarterStatsFallback(quarter);

    console.log(`\n✅ Updated ${res.updated} contributors for ${quarter}`);
    console.log('Done.');
  } catch (err) {
    console.error('❌ Error during fallback recompute:', err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
