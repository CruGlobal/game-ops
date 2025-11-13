/**
 * Test Workweek Streak Calculation
 *
 * This script tests the new workweek-aware streak logic that:
 * - Counts both PR merges and code reviews as contributions
 * - Allows weekend gaps without breaking streaks
 * - Requires consecutive business days (Mon-Fri) to maintain streaks
 */

import { prisma } from '../lib/prisma.js';
import { updateStreak } from '../services/streakService.js';
import dotenv from 'dotenv';

dotenv.config();

// Test scenarios (November 2025 calendar: 3=Mon, 4=Tue, 5=Wed, 6=Thu, 7=Fri, 8/9=Weekend, 10=Mon, etc.)
const testScenarios = [
    {
        name: 'Consecutive Weekdays',
        dates: ['2025-11-03', '2025-11-04', '2025-11-05'], // Mon, Tue, Wed
        expected: { finalStreak: 3, broken: false }
    },
    {
        name: 'Friday to Monday (Weekend Gap)',
        dates: ['2025-11-07', '2025-11-10'], // Fri, Mon
        expected: { finalStreak: 2, broken: false }
    },
    {
        name: 'Thursday to Tuesday (Missed Friday)',
        dates: ['2025-11-06', '2025-11-11'], // Thu, Tue
        expected: { finalStreak: 1, broken: true }
    },
    {
        name: 'Multiple Consecutive Workdays with Weekend',
        dates: ['2025-11-06', '2025-11-07', '2025-11-10', '2025-11-11'], // Thu, Fri, Mon, Tue (with weekend gap)
        expected: { finalStreak: 4, broken: false }
    },
    {
        name: 'Missed Full Week',
        dates: ['2025-11-03', '2025-11-13'], // Mon to Thu (missed full week)
        expected: { finalStreak: 1, broken: true }
    },
    {
        name: 'Same Day Multiple Contributions',
        dates: ['2025-11-03', '2025-11-03', '2025-11-03'], // Multiple PRs/reviews same day
        expected: { finalStreak: 1, broken: false }
    }
];

async function runTests() {
    console.log('🧪 Testing Workweek Streak Logic\n');
    console.log('=' .repeat(80) + '\n');

    // Create or find test contributor
    const testUsername = 'streak-test-user';
    let testContributor = await prisma.contributor.findUnique({
        where: { username: testUsername }
    });

    if (!testContributor) {
        testContributor = await prisma.contributor.create({
            data: {
                username: testUsername,
                avatarUrl: 'https://avatars.githubusercontent.com/u/0',
                prCount: 0,
                reviewCount: 0,
                currentStreak: 0,
                longestStreak: 0
            }
        });
        console.log(`✅ Created test contributor: ${testUsername}\n`);
    }

    let passedTests = 0;
    let failedTests = 0;

    for (const scenario of testScenarios) {
        console.log(`📋 Test: ${scenario.name}`);
        console.log(`   Dates: ${scenario.dates.join(' → ')}`);

        // Reset streak before each test
        await prisma.contributor.update({
            where: { username: testUsername },
            data: {
                currentStreak: 0,
                longestStreak: 0,
                lastContributionDate: null
            }
        });

        let result;
        let streakBroken = false;

        // Process each date
        for (const dateStr of scenario.dates) {
            const contributor = await prisma.contributor.findUnique({
                where: { username: testUsername }
            });

            const contributionDate = new Date(dateStr + 'T12:00:00Z');
            result = await updateStreak(contributor, contributionDate);

            if (result.streakBroken) {
                streakBroken = true;
            }

            console.log(`   ${dateStr}: streak=${result.currentStreak}, broken=${result.streakBroken || false}, weekend=${result.weekendGap || false}`);
        }

        // Verify results
        const finalContributor = await prisma.contributor.findUnique({
            where: { username: testUsername }
        });

        const finalStreak = Number(finalContributor.currentStreak);
        const passed = finalStreak === scenario.expected.finalStreak &&
                      streakBroken === scenario.expected.broken;

        if (passed) {
            console.log(`   ✅ PASSED: Final streak = ${finalStreak}, Broken = ${streakBroken}\n`);
            passedTests++;
        } else {
            console.log(`   ❌ FAILED: Expected streak = ${scenario.expected.finalStreak}, Got = ${finalStreak}`);
            console.log(`              Expected broken = ${scenario.expected.broken}, Got = ${streakBroken}\n`);
            failedTests++;
        }
    }

    // Cleanup
    await prisma.contributor.delete({
        where: { username: testUsername }
    });
    console.log(`🧹 Cleaned up test contributor\n`);

    console.log('=' .repeat(80));
    console.log(`\n📊 Test Results: ${passedTests} passed, ${failedTests} failed`);

    if (failedTests === 0) {
        console.log('🎉 All tests passed!\n');
    } else {
        console.log('⚠️  Some tests failed. Please review the streak logic.\n');
        process.exit(1);
    }
}

// Run tests
runTests()
    .catch(error => {
        console.error('❌ Test error:', error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
