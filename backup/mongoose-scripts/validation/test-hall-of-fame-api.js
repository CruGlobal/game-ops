import mongoose from 'mongoose';
import { getHallOfFame } from '../../services/quarterlyService.js';

async function testHallOfFameAPI() {
    try {
        await mongoose.connect('mongodb://localhost:27017/github-scoreboard');
        console.log('✅ Connected to MongoDB\n');

        console.log('🔍 Testing Hall of Fame API Response Structure\n');
        console.log('='.repeat(80));
        console.log('');

        const hallOfFame = await getHallOfFame(5); // Get last 5 quarters

        if (!hallOfFame || hallOfFame.length === 0) {
            console.log('⚠️  No Hall of Fame data found');
            console.log('   Run: node scripts/migration/backfill-hall-of-fame.js\n');
            return;
        }

        console.log(`📊 Retrieved ${hallOfFame.length} quarterly winners\n`);

        // Test the data structure
        for (let i = 0; i < Math.min(2, hallOfFame.length); i++) {
            const winner = hallOfFame[i];

            console.log(`\n📅 QUARTER: ${winner.quarter}\n`);

            // Check winner structure
            console.log('✅ Winner Structure:');
            console.log(`   quarter: "${winner.quarter}" (${typeof winner.quarter})`);
            console.log(`   archivedDate: ${winner.archivedDate} (${typeof winner.archivedDate})`);
            console.log(`   totalParticipants: ${winner.totalParticipants} (${typeof winner.totalParticipants})`);

            console.log('\n✅ Winner Object:');
            console.log(`   username: "${winner.winner.username}" (${typeof winner.winner.username})`);
            console.log(`   avatarUrl: ${winner.winner.avatarUrl ? 'present' : 'MISSING'} (${typeof winner.winner.avatarUrl})`);
            console.log(`   pointsThisQuarter: ${winner.winner.pointsThisQuarter} (${typeof winner.winner.pointsThisQuarter})`);
            console.log(`   prsThisQuarter: ${winner.winner.prsThisQuarter} (${typeof winner.winner.prsThisQuarter})`);
            console.log(`   reviewsThisQuarter: ${winner.winner.reviewsThisQuarter} (${typeof winner.winner.reviewsThisQuarter})`);

            console.log('\n✅ Top 3 Array:');
            console.log(`   Length: ${winner.top3.length}`);

            if (winner.top3.length > 0) {
                const firstContributor = winner.top3[0];
                console.log('\n   First Contributor Structure:');
                console.log(`   rank: ${firstContributor.rank} (${typeof firstContributor.rank})`);
                console.log(`   username: "${firstContributor.username}" (${typeof firstContributor.username})`);
                console.log(`   avatarUrl: ${firstContributor.avatarUrl ? 'present' : 'MISSING'} (${typeof firstContributor.avatarUrl})`);
                console.log(`   pointsThisQuarter: ${firstContributor.pointsThisQuarter} (${typeof firstContributor.pointsThisQuarter})`);
                console.log(`   prsThisQuarter: ${firstContributor.prsThisQuarter} (${typeof firstContributor.prsThisQuarter})`);
                console.log(`   reviewsThisQuarter: ${firstContributor.reviewsThisQuarter} (${typeof firstContributor.reviewsThisQuarter})`);

                // Check for incorrect structure
                if (firstContributor.stats) {
                    console.log('\n   ⚠️  WARNING: Found unexpected "stats" wrapper!');
                    console.log('   Frontend should access: contributor.pointsThisQuarter');
                    console.log('   NOT: contributor.stats.pointsThisQuarter');
                } else {
                    console.log('\n   ✅ Correct structure (no stats wrapper)');
                    console.log('   Frontend should access: contributor.pointsThisQuarter ✅');
                }
            }
        }

        // Simulate frontend access
        console.log('\n' + '='.repeat(80));
        console.log('\n🔧 FRONTEND ACCESS SIMULATION:\n');

        const testWinner = hallOfFame[0];

        console.log('✅ Winner data (works):');
        console.log(`   winnerData.username = "${testWinner.winner.username}"`);
        console.log(`   winnerData.pointsThisQuarter = ${testWinner.winner.pointsThisQuarter}`);

        console.log('\n✅ Top 3 data (works):');
        if (testWinner.top3.length > 0) {
            const contributor = testWinner.top3[0];
            console.log(`   contributor.username = "${contributor.username}"`);
            console.log(`   contributor.pointsThisQuarter = ${contributor.pointsThisQuarter}`);

            console.log('\n❌ INCORRECT (causes error):');
            try {
                const wrongAccess = contributor.stats.pointsThisQuarter;
                console.log(`   contributor.stats.pointsThisQuarter = ${wrongAccess}`);
            } catch (error) {
                console.log(`   contributor.stats.pointsThisQuarter = ERROR!`);
                console.log(`   Error: ${error.message}`);
            }
        }

        console.log('\n' + '='.repeat(80));
        console.log('\n✅ VERIFICATION COMPLETE\n');
        console.log('Frontend should use:');
        console.log('  • contributor.pointsThisQuarter (NOT contributor.stats.pointsThisQuarter)');
        console.log('  • contributor.username (NOT contributor.stats.username)');
        console.log('  • contributor.avatarUrl (NOT contributor.stats.avatarUrl)\n');

        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB\n');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

testHallOfFameAPI();
