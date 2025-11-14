import mongoose from 'mongoose';
import Contributor from '../../models/contributor.js';

async function checkActualDates() {
    try {
        await mongoose.connect('mongodb://localhost:27017/scoreboard');
        console.log('Connected to MongoDB\n');

        // Get all PRs from all contributors
        const contributors = await Contributor.find({
            'contributions.0': { $exists: true }
        }).select('username contributions');

        const allDates = [];

        for (const contributor of contributors) {
            for (const contribution of contributor.contributions) {
                if (contribution.merged && contribution.date) {
                    allDates.push({
                        date: new Date(contribution.date),
                        username: contributor.username
                    });
                }
            }
        }

        // Sort by date
        allDates.sort((a, b) => a.date - b.date);

        console.log(`Total merged PRs in database: ${allDates.length}\n`);

        if (allDates.length > 0) {
            console.log('Earliest PR:', allDates[0].date.toISOString(), 'by', allDates[0].username);
            console.log('Latest PR:', allDates[allDates.length - 1].date.toISOString(), 'by', allDates[allDates.length - 1].username);
        }

        // Count by month
        const monthCounts = {};

        allDates.forEach(({ date }) => {
            const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            monthCounts[yearMonth] = (monthCounts[yearMonth] || 0) + 1;
        });

        console.log('\n📅 PRs by Month:');
        Object.entries(monthCounts)
            .sort()
            .forEach(([month, count]) => {
                console.log(`   ${month}: ${count} PRs`);
            });

        // Check September specifically
        const september2024 = allDates.filter(({ date }) =>
            date.getFullYear() === 2024 && date.getMonth() === 8  // September is month 8 (0-indexed)
        );

        const september2025 = allDates.filter(({ date }) =>
            date.getFullYear() === 2025 && date.getMonth() === 8
        );

        console.log(`\n🔍 September 2024: ${september2024.length} PRs`);
        console.log(`🔍 September 2025: ${september2025.length} PRs`);

        await mongoose.disconnect();
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkActualDates();
