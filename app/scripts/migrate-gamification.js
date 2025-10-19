import mongoose from 'mongoose';
import Contributor from '../models/contributor.js';
import logger from '../utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const migrateGamificationFields = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        logger.info('Connected to MongoDB for migration');

        const contributors = await Contributor.find({});
        logger.info(`Found ${contributors.length} contributors to migrate`);

        let updated = 0;
        for (const contributor of contributors) {
            let needsUpdate = false;

            // Add streak fields if missing
            if (contributor.currentStreak === undefined) {
                contributor.currentStreak = 0;
                contributor.longestStreak = 0;
                contributor.lastContributionDate = null;
                needsUpdate = true;
            }

            // Add points fields if missing
            if (contributor.totalPoints === undefined) {
                contributor.totalPoints = 0;
                contributor.pointsHistory = [];
                needsUpdate = true;
            }

            // Add achievements if missing
            if (!contributor.achievements) {
                contributor.achievements = [];
                needsUpdate = true;
            }

            // Add challenge fields if missing
            if (!contributor.activeChallenges) {
                contributor.activeChallenges = [];
                contributor.completedChallenges = [];
                needsUpdate = true;
            }

            // Add streak badges if missing
            if (!contributor.streakBadges) {
                contributor.streakBadges = {
                    sevenDay: false,
                    thirtyDay: false,
                    ninetyDay: false,
                    yearLong: false
                };
                needsUpdate = true;
            }

            if (needsUpdate) {
                await contributor.save();
                updated++;
                logger.info(`Migrated contributor: ${contributor.username}`);
            }
        }

        logger.info(`Migration completed: ${updated} contributors updated`);
        process.exit(0);
    } catch (error) {
        logger.error('Migration failed', { error: error.message });
        process.exit(1);
    }
};

migrateGamificationFields();
