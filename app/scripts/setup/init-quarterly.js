import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { checkAndResetIfNewQuarter } from '../../services/quarterlyService.js';

dotenv.config();

// Prisma 7 requires an explicit driver adapter. Guard the URL first: pg falls
// back to localhost and the OS user when the connection string is missing, and
// this script rewrites quarterly state — it must not run against whatever
// local database happens to answer.
if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — refusing to touch quarterly state.');
}

const prisma = new PrismaClient({
    adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 10000,
    }),
});

async function initQuarterly() {
    try {
        // Connect to PostgreSQL
        await prisma.$connect();
        console.log('Connected to PostgreSQL database');

        // Initialize quarterly stats
        const result = await checkAndResetIfNewQuarter();
        console.log('Quarterly initialization result:', JSON.stringify(result, null, 2));

        // Disconnect
        await prisma.$disconnect();
        console.log('Done!');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        await prisma.$disconnect();
        process.exit(1);
    }
}

initQuarterly();
