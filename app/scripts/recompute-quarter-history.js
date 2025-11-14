#!/usr/bin/env node
/**
 * Recompute This Quarter stats from pointHistory timestamps.
 * - Relies on accurate timestamps (use backdate-point-history first if needed)
 */
import { prisma } from '../lib/prisma.js';
import { recomputeCurrentQuarterStats, getCurrentQuarter } from '../services/quarterlyService.js';

async function main() {
  try {
    const quarter = await getCurrentQuarter();
    console.log(`\nRecomputing This Quarter from pointHistory for ${quarter}...`);
    const res = await recomputeCurrentQuarterStats();
    console.log(`✅ Updated ${res.updated} contributors (skipped: ${res.skippedNoActivity || 0})`);
  } catch (err) {
    console.error('❌ Recompute failed:', err.message);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
