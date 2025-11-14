#!/usr/bin/env node
/**
 * Simple PR Fetch Script
 * Fetches recent PRs from GitHub and populates the database
 * No authentication required - runs directly
 * 
 * Usage: node scripts/simple-fetch-prs.js [days]
 * Example: node scripts/simple-fetch-prs.js 30
 */

import { Octokit } from '@octokit/rest';
import { prisma } from '../lib/prisma.js';
import logger from '../utils/logger.js';

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
const repoOwner = process.env.REPO_OWNER || 'CruGlobal';
const repoName = process.env.REPO_NAME || 'cru-terraform';

// Get days from command line or default to 30
const daysAgo = parseInt(process.argv[2]) || 30;
const startDate = new Date();
startDate.setDate(startDate.getDate() - daysAgo);

console.log('\n🚀 Simple PR Fetch');
console.log('='.repeat(50));
console.log(`Repository: ${repoOwner}/${repoName}`);
console.log(`Fetching PRs from: ${startDate.toISOString().split('T')[0]}`);
console.log(`GitHub Token: ${process.env.GITHUB_TOKEN ? '✓ Set' : '✗ Missing'}`);
console.log('='.repeat(50));
console.log('');

async function fetchPRs() {
    try {
        console.log('📡 Fetching merged PRs from GitHub...\n');
        
        let page = 1;
        let totalPRs = 0;
        let hasMore = true;
        
        while (hasMore && page <= 10) { // Limit to 10 pages for safety
            console.log(`  Fetching page ${page}...`);
            
            const { data: prs } = await octokit.pulls.list({
                owner: repoOwner,
                repo: repoName,
                state: 'closed',
                sort: 'updated',
                direction: 'desc',
                per_page: 100,
                page: page
            });
            
            if (prs.length === 0) {
                hasMore = false;
                break;
            }
            
            // Filter for merged PRs within date range
            const mergedPRs = prs.filter(pr => 
                pr.merged_at && 
                new Date(pr.merged_at) >= startDate
            );
            
            console.log(`  Found ${mergedPRs.length} merged PRs in this page\n`);
            
            for (const pr of mergedPRs) {
                await processPR(pr);
                totalPRs++;
            }
            
            // If we found fewer merged PRs than requested, we're done
            if (mergedPRs.length < prs.length) {
                hasMore = false;
            }
            
            page++;
        }
        
        console.log('\n' + '='.repeat(50));
        console.log(`✅ Complete! Processed ${totalPRs} PRs`);
        console.log('='.repeat(50));
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        throw error;
    }
}

async function processPR(pr) {
    try {
        const username = pr.user.login;
        const mergedAt = new Date(pr.merged_at);
        
        console.log(`  📝 PR #${pr.number}: ${pr.title.substring(0, 50)}...`);
        console.log(`     Author: ${username} | Merged: ${mergedAt.toISOString().split('T')[0]}`);
        
        // Find or create contributor
        let contributor = await prisma.contributor.findUnique({
            where: { username }
        });
        
        if (!contributor) {
            console.log(`     👤 Creating new contributor: ${username}`);
            contributor = await prisma.contributor.create({
                data: {
                    username,
                    avatarUrl: pr.user.avatar_url,
                    prCount: 0,
                    reviewCount: 0,
                    totalPoints: 0,
                    currentStreak: 0,
                    longestStreak: 0
                }
            });
        }
        
        // Check if contribution already exists
        const existing = await prisma.contribution.findFirst({
            where: {
                contributorId: contributor.id,
                url: pr.html_url
            }
        });
        
        if (existing) {
            console.log(`     ⏭️  Skipping - already exists\n`);
            return;
        }
        
        // Extract labels
        const labels = pr.labels?.map(l => l.name) || [];
        const isBugFix = labels.some(l => l.toLowerCase().includes('bug') || l.toLowerCase().includes('fix'));
        const isFeature = labels.some(l => l.toLowerCase().includes('feature') || l.toLowerCase().includes('enhancement'));
        
        // Calculate points
        let points = 10; // Base points for PR
        if (isBugFix) points += 5;
        if (isFeature) points += 10;
        
        // Create contribution
        await prisma.contribution.create({
            data: {
                contributorId: contributor.id,
                type: 'PR',
                date: mergedAt,
                url: pr.html_url,
                repository: `${repoOwner}/${repoName}`,
                title: pr.title,
                labels,
                isBugFix,
                isFeature,
                points
            }
        });
        
        // Update contributor stats
        await prisma.contributor.update({
            where: { id: contributor.id },
            data: {
                prCount: { increment: 1 },
                totalPoints: { increment: points },
                lastContributionDate: mergedAt
            }
        });
        
        console.log(`     ✅ Added contribution (+${points} points)\n`);
        
    } catch (error) {
        console.error(`     ❌ Error processing PR #${pr.number}:`, error.message);
    }
}

async function main() {
    try {
        // Test database connection
        await prisma.$queryRaw`SELECT 1`;
        console.log('✅ Database connected\n');
        
        // Fetch and process PRs
        await fetchPRs();
        
        // Show final stats
        const contributorCount = await prisma.contributor.count();
        const contributionCount = await prisma.contribution.count();
        
        console.log('\n📊 Database Stats:');
        console.log(`   Contributors: ${contributorCount}`);
        console.log(`   Contributions: ${contributionCount}`);
        
    } catch (error) {
        console.error('\n❌ Fatal error:', error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
        console.log('\n👋 Disconnected from database\n');
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', async () => {
    console.log('\n\n⚠️  Interrupted. Cleaning up...');
    await prisma.$disconnect();
    process.exit(0);
});

main();
