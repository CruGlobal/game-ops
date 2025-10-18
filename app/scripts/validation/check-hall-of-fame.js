import mongoose from 'mongoose';
import QuarterlyWinner from '../../models/quarterlyWinner.js';

async function checkHallOfFame() {
    try {
        await mongoose.connect('mongodb://localhost:27017/github-scoreboard');
        console.log('✅ Connected to MongoDB\n');

        const winners = await QuarterlyWinner.find({})
            .sort({ year: -1, quarterNumber: -1 })
            .lean();

        console.log('🏆 HALL OF FAME - ALL QUARTERLY WINNERS\n');
        console.log('='.repeat(80));
        console.log('');

        if (winners.length === 0) {
            console.log('⚠️  No quarterly winners found in database');
            console.log('   Run: node scripts/migration/backfill-hall-of-fame.js');
        } else {
            console.log(`Total Quarters: ${winners.length}\n`);

            for (const winner of winners) {
                const dates = `${new Date(winner.quarterStart).toLocaleDateString()} - ${new Date(winner.quarterEnd).toLocaleDateString()}`;
                console.log(`📅 ${winner.quarter} (${dates})`);
                console.log(`   🏆 Champion: ${winner.winner.username}`);
                console.log(`      Points: ${winner.winner.pointsThisQuarter} | PRs: ${winner.winner.prsThisQuarter} | Reviews: ${winner.winner.reviewsThisQuarter}`);

                if (winner.top3 && winner.top3.length > 1) {
                    console.log(`   🥈 2nd Place: ${winner.top3[1].username} (${winner.top3[1].pointsThisQuarter} pts)`);
                }
                if (winner.top3 && winner.top3.length > 2) {
                    console.log(`   🥉 3rd Place: ${winner.top3[2].username} (${winner.top3[2].pointsThisQuarter} pts)`);
                }
                console.log(`   👥 Total Participants: ${winner.totalParticipants}`);
                console.log('');
            }

            // Championship count
            const championCounts = {};
            for (const winner of winners) {
                const username = winner.winner.username;
                championCounts[username] = (championCounts[username] || 0) + 1;
            }

            console.log('='.repeat(80));
            console.log('\n🏅 CHAMPIONSHIP LEADERBOARD (Most Quarter Wins)\n');

            const sorted = Object.entries(championCounts).sort((a, b) => b[1] - a[1]);
            for (const [username, count] of sorted) {
                const emoji = count >= 10 ? '👑' : count >= 5 ? '🏆' : '🥇';
                console.log(`   ${emoji} ${username}: ${count} ${count === 1 ? 'quarter' : 'quarters'}`);
            }
        }

        await mongoose.disconnect();
        console.log('\n✅ Check complete\n');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

checkHallOfFame();
