#!/usr/bin/env node
/**
 * Backdate pointHistory timestamps to actual GitHub event times
 * - For PR Merged events: sets timestamp to PR.merged_at
 * - For Review Completed events: sets timestamp(s) to actual review.submitted_at for that user/PR
 *
 * Why: Historical backfills created pointHistory rows with "now()" timestamps,
 * which breaks quarter-based recomputations from history. This script corrects
 * timestamps so recomputeCurrentQuarterStats can rely on pointHistory alone.
 *
 * Usage:
 *   npm run backdate:point-history [-- --owner <owner> --repo <name> --dry]
 *
 * Env:
 *   GITHUB_TOKEN is required (repo scope). If not provided, exits.
 *   If --owner/--repo not provided, attempts to read from PRMetadata table
 *   or env GITHUB_OWNER/GITHUB_REPO.
 */

import dotenv from 'dotenv';
import { Octokit } from '@octokit/rest';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { prisma } from '../lib/prisma.js';
import { getQuarterDateRange } from '../services/quarterlyService.js';

dotenv.config();

const argv = yargs(hideBin(process.argv))
  .option('owner', { type: 'string', describe: 'GitHub repo owner/org' })
  .option('repo', { type: 'string', describe: 'GitHub repository name' })
  .option('dry', { type: 'boolean', default: false, describe: 'Dry run: show planned updates without writing' })
  .option('quarter', { type: 'string', describe: 'Limit to PRs with pointHistory entries in this quarter (YYYY-QN)' })
  .option('since', { type: 'string', describe: 'ISO date to limit pointHistory entries from this date (inclusive)' })
  .option('until', { type: 'string', describe: 'ISO date to limit pointHistory entries up to this date (inclusive)' })
  .option('limit', { type: 'number', describe: 'Max number of unique PRs to process', default: 0 })
  .option('reasons', { type: 'array', describe: 'Limit to these reasons (e.g., --reasons "PR Merged" "Review Completed")' })
  .help()
  .argv;

const GH_TOKEN = process.env.GITHUB_TOKEN || process.env.GITHUB_PAT;
if (!GH_TOKEN) {
  console.error('Missing GITHUB_TOKEN (or GITHUB_PAT) in environment');
  process.exit(1);
}

const octokit = new Octokit({ auth: GH_TOKEN, userAgent: 'pr-scoreboard-backdate/1.0' });

async function resolveRepo() {
  // 1) CLI flags
  if (argv.owner && argv.repo) return { owner: argv.owner, repo: argv.repo };
  // 2) PRMetadata table
  const meta = await prisma.pRMetadata.findFirst();
  if (meta?.repoOwner && meta?.repoName) {
    return { owner: meta.repoOwner, repo: meta.repoName };
  }
  // 3) Env fallback
  const owner = process.env.GITHUB_OWNER;
  const repo = process.env.GITHUB_REPO;
  if (owner && repo) return { owner, repo };
  throw new Error('Unable to resolve repo owner/name. Use --owner/--repo or set PRMetadata or env GITHUB_OWNER/GITHUB_REPO');
}

async function fetchPr(owner, repo, number) {
  const { data } = await octokit.pulls.get({ owner, repo, pull_number: Number(number) });
  return data;
}

async function fetchPrReviewsByUser(owner, repo, number, username) {
  // Paginate all reviews, filter by user
  const reviews = await octokit.paginate(octokit.pulls.listReviews, {
    owner,
    repo,
    pull_number: Number(number),
    per_page: 100
  });
  return reviews
    .filter(r => (r.user?.login || '').toLowerCase() === String(username).toLowerCase())
    .map(r => ({ id: r.id, submittedAt: r.submitted_at || r.submittedAt || r.created_at || r.createdAt }))
    .filter(r => !!r.submittedAt)
    .sort((a, b) => new Date(a.submittedAt) - new Date(b.submittedAt));
}

async function main() {
  let updatedPRs = 0;
  let updatedReviews = 0;
  let skipped = 0;

  try {
    const { owner, repo } = await resolveRepo();
    const dryRun = !!argv.dry;
    console.log(`\nBackdating pointHistory using GitHub data for ${owner}/${repo}${dryRun ? ' [DRY RUN]' : ''}`);

    // Build time window filter
    let start = null, end = null;
    if (argv.quarter) {
      const { start: qStart, end: qEnd } = await getQuarterDateRange(argv.quarter);
      start = qStart; end = qEnd;
      console.log(`Limiting to quarter ${argv.quarter}: ${start.toISOString()} → ${end.toISOString()}`);
    }
    if (argv.since) start = new Date(argv.since);
    if (argv.until) end = new Date(argv.until);

    // Decide source for selecting candidate PRs
    // If a time window is provided, prefer processed tables (they reflect actual activity windows)
    const selectedReasons = Array.isArray(argv.reasons) && argv.reasons.length ? argv.reasons : ['PR Merged', 'Review Completed'];
    let phPRs = [];
    if (start || end) {
      const prNums = new Set();
      const prs = await prisma.processedPR.findMany({
        where: {
          processedDate: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) },
          action: 'authored'
        },
        select: { prNumber: true }
      });
      prs.forEach(p => prNums.add(String(p.prNumber)));
      const rvs = await prisma.processedReview.findMany({
        where: { processedDate: { ...(start ? { gte: start } : {}), ...(end ? { lte: end } : {}) } },
        select: { prNumber: true }
      });
      rvs.forEach(r => prNums.add(String(r.prNumber)));

      if (prNums.size > 0) {
        // Now only keep PRs that also have pointHistory entries with selected reasons
        const ph = await prisma.pointHistory.findMany({
          where: {
            prNumber: { in: Array.from(prNums).map(n => BigInt(n)) },
            reason: { in: selectedReasons }
          },
          distinct: ['prNumber'],
          select: { prNumber: true },
          orderBy: { prNumber: 'asc' }
        });
        phPRs = ph;
      }
    } else {
      // Fallback: distinct PRs from pointHistory (unbounded)
      phPRs = await prisma.pointHistory.findMany({
        where: {
          prNumber: { not: null },
          reason: { in: selectedReasons }
        },
        distinct: ['prNumber'],
        select: { prNumber: true },
        orderBy: { timestamp: 'asc' }
      });
    }

    // Apply limit if requested
    if (argv.limit && argv.limit > 0 && phPRs.length > argv.limit) {
      phPRs = phPRs.slice(0, argv.limit);
    }

    console.log(`Found ${phPRs.length} unique PRs in pointHistory to examine`);

    // Preload contributorId -> username map for involved contributors (helps with reviews)
    const involvedPh = await prisma.pointHistory.findMany({
      where: { prNumber: { not: null }, reason: 'Review Completed' },
      select: { contributorId: true },
      distinct: ['contributorId']
    });
    const contributorIds = involvedPh.map(p => p.contributorId);
    const contributors = contributorIds.length
      ? await prisma.contributor.findMany({ where: { id: { in: contributorIds } }, select: { id: true, username: true } })
      : [];
    const idToUsername = new Map(contributors.map(c => [String(c.id), c.username]));

    for (const row of phPRs) {
      const prNumber = Number(row.prNumber);
      let prData;
      try {
        prData = await fetchPr(owner, repo, prNumber);
      } catch (e) {
        console.warn(`  ⚠️  Skipping #${prNumber}: could not fetch PR (${e.status || ''} ${e.message || e})`);
        skipped++;
        continue;
      }

      // Update PR Merged event timestamp(s) for this PR
      const prMergedEvents = await prisma.pointHistory.findMany({
        where: { prNumber: BigInt(prNumber), reason: 'PR Merged' },
        select: { id: true, timestamp: true }
      });
      if (prMergedEvents.length > 0) {
        const mergedAt = prData.merged_at || prData.mergedAt || prData.closed_at || prData.closedAt;
        if (!mergedAt) {
          console.warn(`  ⚠️  PR #${prNumber} has no merged_at; skipping PR Merged backdate`);
        } else {
          for (const ev of prMergedEvents) {
            if (!dryRun) {
              await prisma.pointHistory.update({ where: { id: ev.id }, data: { timestamp: new Date(mergedAt) } });
            }
            updatedPRs++;
          }
        }
      }

      // Update Review Completed event timestamps for this PR, grouped by contributor
      const reviewEvents = await prisma.pointHistory.findMany({
        where: { prNumber: BigInt(prNumber), reason: 'Review Completed' },
        orderBy: { timestamp: 'asc' }, // current values likely similar; we will reassign reliably by index
        select: { id: true, contributorId: true }
      });

      if (reviewEvents.length > 0) {
        const byUser = new Map();
        for (const ev of reviewEvents) {
          const cid = String(ev.contributorId);
          if (!byUser.has(cid)) byUser.set(cid, []);
          byUser.get(cid).push(ev);
        }

        for (const [cid, events] of byUser.entries()) {
          const username = idToUsername.get(cid);
          if (!username) {
            console.warn(`  ⚠️  Unknown contributor ${cid} for PR #${prNumber} reviews; skipping`);
            skipped += events.length;
            continue;
          }
          let reviews;
          try {
            reviews = await fetchPrReviewsByUser(owner, repo, prNumber, username);
          } catch (e) {
            console.warn(`  ⚠️  Could not fetch reviews for ${username} on #${prNumber}: ${e.message || e}`);
            skipped += events.length;
            continue;
          }
          if (!reviews || reviews.length === 0) {
            console.warn(`  ⚠️  No GitHub reviews found for ${username} on #${prNumber}; skipping ${events.length} entries`);
            skipped += events.length;
            continue;
          }

          const count = Math.min(events.length, reviews.length);
          for (let i = 0; i < count; i++) {
            const ev = events[i];
            const ts = reviews[i].submittedAt;
            if (ts) {
              if (!dryRun) {
                await prisma.pointHistory.update({ where: { id: ev.id }, data: { timestamp: new Date(ts) } });
              }
              updatedReviews++;
            } else {
              skipped++;
            }
          }

          if (events.length > reviews.length) {
            console.warn(`  ⚠️  ${username} has ${events.length} local review events but only ${reviews.length} reviews on GitHub for #${prNumber}`);
          }
        }
      }
    }

    console.log(`\nSummary${dryRun ? ' (dry-run)' : ''}:`);
    console.log(`  PR Merged timestamps updated:   ${updatedPRs}`);
    console.log(`  Review timestamps updated:      ${updatedReviews}`);
    console.log(`  Skipped (missing data/errors):  ${skipped}`);
    console.log('\n✅ Backdating complete');
  } catch (err) {
    console.error('\n❌ Backdating failed:', err.message);
    if (err.stack) console.error(err.stack.split('\n').slice(0, 3).join('\n'));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
