import mongoose from 'mongoose';
import Contributor from '../../models/contributor.js';

/**
 * DRY RUN: Analyze duplicates and show what would be fixed
 * This script DOES NOT modify the database - it only reports issues
 */
async function dryRunFixDuplicates() {
    try {
        await mongoose.connect('mongodb://localhost:27017/github-scoreboard');
        console.log('✅ Connected to MongoDB\n');
        console.log('🔍 DRY RUN MODE - No changes will be made to the database');
        console.log('='.repeat(80));
        console.log('');

        const contributors = await Contributor.find({}).lean();

        const issues = {
            prCountMismatch: [],
            reviewCountMismatch: [],
            duplicatePRs: [],
            duplicateReviews: []
        };

        let totalPRsToRemove = 0;
        let totalReviewsToRemove = 0;

        console.log('📊 ANALYZING CONTRIBUTORS FOR DUPLICATES...\n');

        for (const contributor of contributors) {
            const processedPRCount = contributor.processedPRs?.length || 0;
            const processedReviewCount = contributor.processedReviews?.length || 0;

            // Check PR count mismatch
            if (contributor.prCount !== processedPRCount) {
                const diff = contributor.prCount - processedPRCount;
                totalPRsToRemove += Math.abs(diff);

                issues.prCountMismatch.push({
                    username: contributor.username,
                    currentPRCount: contributor.prCount,
                    correctPRCount: processedPRCount,
                    difference: diff,
                    action: diff > 0 ? `Reduce by ${diff}` : `Increase by ${Math.abs(diff)}`
                });
            }

            // Check review count mismatch
            if (contributor.reviewCount !== processedReviewCount) {
                const diff = contributor.reviewCount - processedReviewCount;
                totalReviewsToRemove += Math.abs(diff);

                issues.reviewCountMismatch.push({
                    username: contributor.username,
                    currentReviewCount: contributor.reviewCount,
                    correctReviewCount: processedReviewCount,
                    difference: diff,
                    action: diff > 0 ? `Reduce by ${diff}` : `Increase by ${Math.abs(diff)}`
                });
            }

            // Check for duplicate PRs in processedPRs array
            if (contributor.processedPRs && contributor.processedPRs.length > 0) {
                const prCounts = {};
                contributor.processedPRs.forEach(pr => {
                    prCounts[pr.prNumber] = (prCounts[pr.prNumber] || 0) + 1;
                });

                const duplicates = Object.entries(prCounts).filter(([_, count]) => count > 1);
                if (duplicates.length > 0) {
                    issues.duplicatePRs.push({
                        username: contributor.username,
                        duplicates: duplicates.map(([prNum, count]) => ({
                            prNumber: parseInt(prNum),
                            count,
                            toRemove: count - 1
                        }))
                    });
                }
            }

            // Check for duplicate reviews in processedReviews array
            if (contributor.processedReviews && contributor.processedReviews.length > 0) {
                const reviewCounts = {};
                contributor.processedReviews.forEach(review => {
                    const key = `${review.prNumber}_${review.reviewId}`;
                    reviewCounts[key] = (reviewCounts[key] || 0) + 1;
                });

                const duplicates = Object.entries(reviewCounts).filter(([_, count]) => count > 1);
                if (duplicates.length > 0) {
                    issues.duplicateReviews.push({
                        username: contributor.username,
                        duplicates: duplicates.map(([key, count]) => {
                            const [prNum, reviewId] = key.split('_');
                            return {
                                prNumber: parseInt(prNum),
                                reviewId: parseInt(reviewId),
                                count,
                                toRemove: count - 1
                            };
                        })
                    });
                }
            }
        }

        // REPORT FINDINGS
        console.log('\n📋 DUPLICATE ANALYSIS REPORT\n');
        console.log('='.repeat(80));

        // PR Count Mismatches
        if (issues.prCountMismatch.length > 0) {
            console.log('\n⚠️  PR COUNT MISMATCHES (prCount ≠ processedPRs.length):\n');
            console.log(`   Found ${issues.prCountMismatch.length} contributors with mismatches`);
            console.log(`   Total excess PRs: ${totalPRsToRemove}\n`);

            // Sort by difference (largest first)
            issues.prCountMismatch.sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference));

            for (const issue of issues.prCountMismatch) {
                console.log(`   👤 ${issue.username}`);
                console.log(`      Current prCount: ${issue.currentPRCount}`);
                console.log(`      Correct prCount: ${issue.correctPRCount}`);
                console.log(`      🔧 Fix: ${issue.action}`);
            }
        } else {
            console.log('\n✅ No PR count mismatches found');
        }

        // Review Count Mismatches
        if (issues.reviewCountMismatch.length > 0) {
            console.log('\n⚠️  REVIEW COUNT MISMATCHES (reviewCount ≠ processedReviews.length):\n');
            console.log(`   Found ${issues.reviewCountMismatch.length} contributors with mismatches`);
            console.log(`   Total excess reviews: ${totalReviewsToRemove}\n`);

            for (const issue of issues.reviewCountMismatch) {
                console.log(`   👤 ${issue.username}`);
                console.log(`      Current reviewCount: ${issue.currentReviewCount}`);
                console.log(`      Correct reviewCount: ${issue.correctReviewCount}`);
                console.log(`      🔧 Fix: ${issue.action}`);
            }
        } else {
            console.log('\n✅ No review count mismatches found');
        }

        // Duplicate PRs in processedPRs
        if (issues.duplicatePRs.length > 0) {
            console.log('\n⚠️  DUPLICATE PRS IN PROCESSEDPRS ARRAY:\n');
            for (const issue of issues.duplicatePRs) {
                console.log(`   👤 ${issue.username}`);
                for (const dup of issue.duplicates) {
                    console.log(`      PR #${dup.prNumber} appears ${dup.count} times (remove ${dup.toRemove})`);
                }
            }
        } else {
            console.log('\n✅ No duplicate PRs in processedPRs arrays');
        }

        // Duplicate Reviews
        if (issues.duplicateReviews.length > 0) {
            console.log('\n⚠️  DUPLICATE REVIEWS IN PROCESSEDREVIEWS ARRAY:\n');
            for (const issue of issues.duplicateReviews) {
                console.log(`   👤 ${issue.username}`);
                for (const dup of issue.duplicates) {
                    console.log(`      Review #${dup.reviewId} on PR #${dup.prNumber} appears ${dup.count} times (remove ${dup.toRemove})`);
                }
            }
        } else {
            console.log('\n✅ No duplicate reviews in processedReviews arrays');
        }

        // Summary
        console.log('\n' + '='.repeat(80));
        console.log('\n📊 SUMMARY:\n');
        console.log(`   Contributors with PR count mismatches: ${issues.prCountMismatch.length}`);
        console.log(`   Contributors with review count mismatches: ${issues.reviewCountMismatch.length}`);
        console.log(`   Contributors with duplicate PRs: ${issues.duplicatePRs.length}`);
        console.log(`   Contributors with duplicate reviews: ${issues.duplicateReviews.length}`);
        console.log(`   Total excess PRs to remove: ${totalPRsToRemove}`);
        console.log(`   Total excess reviews to remove: ${totalReviewsToRemove}`);

        console.log('\n' + '='.repeat(80));
        console.log('\n🔧 RECOMMENDED ACTIONS:\n');
        console.log('   1. Review the issues above');
        console.log('   2. If corrections look good, run: node fix-duplicates-execute.js');
        console.log('   3. After fixing, restart Docker: docker-compose restart app');
        console.log('\n⚠️  IMPORTANT: The execute script will modify the database!');
        console.log('   Make sure to backup first if you have concerns.\n');

        await mongoose.disconnect();
        console.log('✅ Dry run complete - no changes made\n');

    } catch (error) {
        console.error('❌ Error:', error);
        process.exit(1);
    }
}

dryRunFixDuplicates();
