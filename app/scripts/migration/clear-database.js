import mongoose from 'mongoose';
import Contributor from '../../models/contributor.js';
import Challenge from '../../models/challenge.js';
import PRMetadata from '../../models/prMetadata.js';
import QuarterSettings from '../../models/quarterSettings.js';
import QuarterlyWinner from '../../models/quarterlyWinner.js';
import readline from 'readline';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

async function clearDatabase() {
    try {
        await mongoose.connect('mongodb://localhost:27017/github-scoreboard');
        console.log('✅ Connected to database (github-scoreboard)\n');

        // Count current data
        const contributorCount = await Contributor.countDocuments();
        const challengeCount = await Challenge.countDocuments();
        const metadataCount = await PRMetadata.countDocuments();

        console.log('📊 Current Database Status:');
        console.log(`   Contributors: ${contributorCount}`);
        console.log(`   Challenges: ${challengeCount}`);
        console.log(`   PR Metadata: ${metadataCount}\n`);

        if (contributorCount === 0) {
            console.log('ℹ️  Database is already empty. Nothing to clear.');
            await mongoose.disconnect();
            rl.close();
            return;
        }

        console.log('⚠️  WARNING: This will DELETE ALL data from the following collections:');
        console.log('   - Contributors (all PR/review counts, streaks, points, badges)');
        console.log('   - Challenges (all active and completed challenges)');
        console.log('   - PR Metadata (fetch history and range tracking)');
        console.log('   - Quarterly Winners (hall of fame data)');
        console.log('\n   Quarter Settings will be PRESERVED.\n');

        rl.question('❓ Type "DELETE ALL DATA" to confirm (or anything else to cancel): ', async (answer) => {
            if (answer === 'DELETE ALL DATA') {
                console.log('\n🗑️  Clearing database...\n');

                const results = await Promise.all([
                    Contributor.deleteMany({}),
                    Challenge.deleteMany({}),
                    PRMetadata.deleteMany({}),
                    QuarterlyWinner.deleteMany({})
                ]);

                console.log('✅ Database cleared successfully!');
                console.log(`   Deleted ${results[0].deletedCount} contributors`);
                console.log(`   Deleted ${results[1].deletedCount} challenges`);
                console.log(`   Deleted ${results[2].deletedCount} metadata records`);
                console.log(`   Deleted ${results[3].deletedCount} quarterly winners`);

                console.log('\n💡 Next step: Run full backfill to repopulate clean data');
                console.log('   → node scripts/migration/full-backfill.js\n');
            } else {
                console.log('\n❌ Cancelled. Database was NOT cleared.');
            }

            await mongoose.disconnect();
            rl.close();
        });

    } catch (error) {
        console.error('\n❌ Error:', error.message);
        await mongoose.disconnect();
        rl.close();
        process.exit(1);
    }
}

clearDatabase();
