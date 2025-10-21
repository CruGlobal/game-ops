import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { checkAndResetIfNewQuarter } from '../../services/quarterlyService.js';

dotenv.config();

const prisma = new PrismaClient();

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
