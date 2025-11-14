import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Contributor from './models/contributor.js';
import { getCurrentQuarter, getQuarterDateRange } from './services/quarterlyService.js';

dotenv.config();

async function backfillQuarterlyStats() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/github-scoreboard';
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB at', mongoUri);

        // Get current quarter info
        const currentQuarter = await getCurrentQuarter();
        const quarterDates = await getQuarterDateRange(currentQuarter);

        console.log(`\nBackfilling stats for ${currentQuarter}`);
        console.log(`Quarter range: ${new Date(quarterDates.start).toLocaleDateString()} - ${new Date(quarterDates.end).toLocaleDateString()}\n`);

        const quarterStart = new Date(quarterDates.start);
        const quarterEnd = new Date(quarterDates.end);

        // Get all contributors
        const contributors = await Contributor.find({});
        console.log(`Found ${contributors.length} contributors to process\n`);

        let updated = 0;

        for (const contributor of contributors) {
            let prsThisQuarter = 0;
            let reviewsThisQuarter = 0;
            let pointsThisQuarter = 0;

            // Count PRs in this quarter
            if (contributor.contributions && contributor.contributions.length > 0) {
                contributor.contributions.forEach(contribution => {
                    const contribDate = new Date(contribution.date);
                    if (contribDate >= quarterStart && contribDate <= quarterEnd && contribution.merged) {
                        prsThisQuarter++;
                    }
                });
            }

            // Count reviews in this quarter
            if (contributor.reviews && contributor.reviews.length > 0) {
                contributor.reviews.forEach(review => {
                    const reviewDate = new Date(review.date);
                    if (reviewDate >= quarterStart && reviewDate <= quarterEnd) {
                        reviewsThisQuarter++;
                    }
                });
            }

            // Calculate points for this quarter
            if (contributor.pointsHistory && contributor.pointsHistory.length > 0) {
                contributor.pointsHistory.forEach(entry => {
                    const entryDate = new Date(entry.timestamp);
                    if (entryDate >= quarterStart && entryDate <= quarterEnd) {
                        pointsThisQuarter += entry.points;
                    }
                });
            }

            // Only update if there's activity this quarter
            if (prsThisQuarter > 0 || reviewsThisQuarter > 0 || pointsThisQuarter > 0) {
                contributor.quarterlyStats = {
                    currentQuarter: currentQuarter,
                    quarterStartDate: quarterStart,
                    quarterEndDate: quarterEnd,
                    prsThisQuarter: prsThisQuarter,
                    reviewsThisQuarter: reviewsThisQuarter,
                    pointsThisQuarter: pointsThisQuarter,
                    lastUpdated: new Date()
                };

                await contributor.save();
                updated++;

                console.log(`✓ ${contributor.username}: ${prsThisQuarter} PRs, ${reviewsThisQuarter} reviews, ${pointsThisQuarter} points`);
            }
        }

        console.log(`\nBackfill complete! Updated ${updated} contributors with quarterly stats.`);

        // Disconnect
        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

backfillQuarterlyStats();
