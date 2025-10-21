#!/usr/bin/env node
/**
 * Script to run PR backfill process
 * This fetches all historical PRs from GitHub and populates the database
 * 
 * Usage:
 *   node scripts/run-backfill.js [startDate] [endDate]
 * 
 * Example:
 *   node scripts/run-backfill.js 2019-01-01 2025-10-21
 *   node scripts/run-backfill.js  # Uses default dates
 */

import { startBackfill } from '../services/backfillService.js';
import logger from '../utils/logger.js';
import { prisma } from '../lib/prisma.js';

// Parse command line arguments
const args = process.argv.slice(2);
const startDate = args[0] ? new Date(args[0]) : new Date('2019-01-01');
const endDate = args[1] ? new Date(args[1]) : new Date();

console.log('\n🚀 GitHub PR Backfill Process');
console.log('================================');
console.log(`Repository: ${process.env.REPO_OWNER}/${process.env.REPO_NAME}`);
console.log(`Date Range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);
console.log('================================\n');

async function runBackfill() {
    try {
        // Check database connection
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ Database connection successful\n');

        // Start backfill
        console.log('Starting backfill process...');
        console.log('This may take a while depending on the number of PRs.\n');
        
        const result = await startBackfill(startDate, endDate);
        
        if (result.success) {
            console.log('\n✅ Backfill completed successfully!');
            console.log(`Total PRs processed: ${result.processedPRs || 0}`);
            console.log(`Total reviews processed: ${result.processedReviews || 0}`);
        } else {
            console.error('\n❌ Backfill failed:', result.message);
            process.exit(1);
        }

    } catch (error) {
        console.error('\n❌ Error running backfill:', error.message);
        logger.error('Backfill error', {
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    } finally {
        // Disconnect from database
        await prisma.$disconnect();
        console.log('\n👋 Database connection closed');
        process.exit(0);
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n\n⚠️  Received interrupt signal. Stopping backfill...');
    await prisma.$disconnect();
    process.exit(0);
});

// Run the backfill
runBackfill();
