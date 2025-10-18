import mongoose from 'mongoose';
import Contributor from '../../models/contributor.js';
import Challenge from '../../models/challenge.js';
import PRMetadata from '../../models/prMetadata.js';
import QuarterlyWinner from '../../models/quarterlyWinner.js';

async function clearDatabaseNow() {
    try {
        await mongoose.connect('mongodb://localhost:27017/github-scoreboard');
        console.log('✅ Connected to database (github-scoreboard)\n');

        // Count current data
        const contributorCount = await Contributor.countDocuments();
        const challengeCount = await Challenge.countDocuments();
        const metadataCount = await PRMetadata.countDocuments();
        const winnersCount = await QuarterlyWinner.countDocuments();

        console.log('📊 Current Database Status:');
        console.log(`   Contributors: ${contributorCount}`);
        console.log(`   Challenges: ${challengeCount}`);
        console.log(`   PR Metadata: ${metadataCount}`);
        console.log(`   Quarterly Winners: ${winnersCount}\n`);

        console.log('🗑️  Deleting all data...\n');

        const results = await Promise.all([
            Contributor.deleteMany({}),
            Challenge.deleteMany({}),
            PRMetadata.deleteMany({}),
            QuarterlyWinner.deleteMany({})
        ]);

        console.log('✅ Database cleared successfully!\n');
        console.log('   Deleted:');
        console.log(`   - ${results[0].deletedCount} contributors`);
        console.log(`   - ${results[1].deletedCount} challenges`);
        console.log(`   - ${results[2].deletedCount} metadata records`);
        console.log(`   - ${results[3].deletedCount} quarterly winners\n`);

        console.log('✅ Database is now clean and ready for backfill!\n');

        await mongoose.disconnect();
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        await mongoose.disconnect();
        process.exit(1);
    }
}

clearDatabaseNow();
