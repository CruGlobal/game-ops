import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { checkAndResetIfNewQuarter } from '../../services/quarterlyService.js';

dotenv.config();

// Prisma 7 requires an explicit driver adapter.
const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
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
