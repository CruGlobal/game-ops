import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { checkAndResetIfNewQuarter } from './services/quarterlyService.js';

dotenv.config();

async function initQuarterly() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/github-scoreboard';
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB at', mongoUri);

        // Initialize quarterly stats
        const result = await checkAndResetIfNewQuarter();
        console.log('Quarterly initialization result:', JSON.stringify(result, null, 2));

        // Disconnect
        await mongoose.disconnect();
        console.log('Done!');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

initQuarterly();
