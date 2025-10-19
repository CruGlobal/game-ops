import mongoose from 'mongoose';
import Contributor from '../../models/contributor.js';

/**
 * EXECUTE: Fix duplicates by correcting counts and removing duplicate entries
 * ⚠️  THIS SCRIPT MODIFIES THE DATABASE
 */
async function executeFixDuplicates() {
    try {
        await mongoose.connect('mongodb://localhost:27017/github-scoreboard');
        console.log('✅ Connected to MongoDB\n');
        console.log('⚠️  EXECUTE MODE - Database will be modified!');
        console.log('='.repeat(80));
        console.log('');

        const contributors = await Contributor.find({});

        let contributorsFixed = 0;
        let totalPRsFixed = 0;
        let totalReviewsFixed = 0;
        let duplicatePRsRemoved = 0;
        let duplicateReviewsRemoved = 0;

        console.log('🔧 FIXING DUPLICATES...\n');

        for (const contributor of contributors) {
            let modified = false;
            const processedPRCount = contributor.processedPRs?.length || 0;
            const processedReviewCount = contributor.processedReviews?.length || 0;

            // FIX 1: Correct PR count mismatch
            if (contributor.prCount !== processedPRCount) {
                const diff = contributor.prCount - processedPRCount;
                console.log(`   👤 ${contributor.username}`);
                console.log(`      Fixing prCount: ${contributor.prCount} → ${processedPRCount} (${diff > 0 ? '-' : '+'}${Math.abs(diff)})`);

                contributor.prCount = processedPRCount;
                totalPRsFixed += Math.abs(diff);
                modified = true;
            }

            // FIX 2: Correct review count mismatch
            if (contributor.reviewCount !== processedReviewCount) {
                const diff = contributor.reviewCount - processedReviewCount;
                console.log(`   👤 ${contributor.username}`);
                console.log(`      Fixing reviewCount: ${contributor.reviewCount} → ${processedReviewCount} (${diff > 0 ? '-' : '+'}${Math.abs(diff)})`);

                contributor.reviewCount = processedReviewCount;
                totalReviewsFixed += Math.abs(diff);
                modified = true;
            }

            // FIX 3: Remove duplicate PRs from processedPRs array
            if (contributor.processedPRs && contributor.processedPRs.length > 0) {
                const seen = new Set();
                const uniquePRs = [];

                for (const pr of contributor.processedPRs) {
                    const key = `${pr.prNumber}_${pr.action}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        uniquePRs.push(pr);
                    } else {
                        duplicatePRsRemoved++;
                        if (!modified) {
                            console.log(`   👤 ${contributor.username}`);
                        }
                        console.log(`      Removing duplicate PR #${pr.prNumber} (${pr.action})`);
                        modified = true;
                    }
                }

                if (uniquePRs.length !== contributor.processedPRs.length) {
                    contributor.processedPRs = uniquePRs;
                    contributor.prCount = uniquePRs.length; // Update count to match
                }
            }

            // FIX 4: Remove duplicate reviews from processedReviews array
            if (contributor.processedReviews && contributor.processedReviews.length > 0) {
                const seen = new Set();
                const uniqueReviews = [];

                for (const review of contributor.processedReviews) {
                    const key = `${review.prNumber}_${review.reviewId}`;
                    if (!seen.has(key)) {
                        seen.add(key);
                        uniqueReviews.push(review);
                    } else {
                        duplicateReviewsRemoved++;
                        if (!modified) {
                            console.log(`   👤 ${contributor.username}`);
                        }
                        console.log(`      Removing duplicate review #${review.reviewId} on PR #${review.prNumber}`);
                        modified = true;
                    }
                }

                if (uniqueReviews.length !== contributor.processedReviews.length) {
                    contributor.processedReviews = uniqueReviews;
                    contributor.reviewCount = uniqueReviews.length; // Update count to match
                }
            }

            // Save changes if modified
            if (modified) {
                await contributor.save();
                contributorsFixed++;
            }
        }

        console.log('\n' + '='.repeat(80));
        console.log('\n✅ DUPLICATE CLEANUP COMPLETE!\n');
        console.log(`   Contributors fixed: ${contributorsFixed}`);
        console.log(`   PR count adjustments: ${totalPRsFixed}`);
        console.log(`   Review count adjustments: ${totalReviewsFixed}`);
        console.log(`   Duplicate PRs removed from processedPRs: ${duplicatePRsRemoved}`);
        console.log(`   Duplicate reviews removed from processedReviews: ${duplicateReviewsRemoved}`);

        console.log('\n📊 VERIFYING FIX...\n');

        // Verify no mismatches remain
        const verification = await Contributor.find({});
        let remainingMismatches = 0;

        for (const contributor of verification) {
            const processedPRCount = contributor.processedPRs?.length || 0;
            const processedReviewCount = contributor.processedReviews?.length || 0;

            if (contributor.prCount !== processedPRCount) {
                console.log(`   ⚠️  ${contributor.username} still has PR mismatch: ${contributor.prCount} vs ${processedPRCount}`);
                remainingMismatches++;
            }

            if (contributor.reviewCount !== processedReviewCount) {
                console.log(`   ⚠️  ${contributor.username} still has review mismatch: ${contributor.reviewCount} vs ${processedReviewCount}`);
                remainingMismatches++;
            }
        }

        if (remainingMismatches === 0) {
            console.log('   ✅ All counts now match their tracking arrays!');
        } else {
            console.log(`   ⚠️  ${remainingMismatches} mismatches still remain`);
        }

        console.log('\n' + '='.repeat(80));
        console.log('\n📋 NEXT STEPS:\n');
        console.log('   1. ✅ Duplicates have been removed');
        console.log('   2. 🔄 Restart Docker to apply the cron fix: docker-compose restart app');
        console.log('   3. 🔍 Check admin page Data Overview to verify');
        console.log('   4. 📊 Monitor the hourly cron to ensure no new duplicates\n');

        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB\n');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

// Confirmation prompt
console.log('\n⚠️  WARNING: This script will modify the database!');
console.log('\nThis script will:');
console.log('  • Fix prCount to match processedPRs.length');
console.log('  • Fix reviewCount to match processedReviews.length');
console.log('  • Remove duplicate entries from processedPRs arrays');
console.log('  • Remove duplicate entries from processedReviews arrays');
console.log('\nPress Ctrl+C to cancel, or wait 5 seconds to continue...\n');

setTimeout(() => {
    executeFixDuplicates();
}, 5000);
