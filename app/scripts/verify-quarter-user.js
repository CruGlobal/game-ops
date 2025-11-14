#!/usr/bin/env node
/**
 * Verify a user's This Quarter totals against GitHub data
 * - Uses GitHub GraphQL contributionsCollection to get PR contributions and review contributions
 * - Counts PRs merged within the quarter window and reviews submitted within the window
 * - Compares against local quarterlyStats and expected points
 *
 * Usage:
 *   npm run verify:quarter:user -- --user <github_login> [--quarter YYYY-QN] [--org <org_login>]
 *
 * Requires:
 *   - GITHUB_TOKEN in env (PAT with read:org, repo scope is sufficient to read PR metadata)
 *   - Optionally GITHUB_ORG in env; or pass --org
 */

import dotenv from 'dotenv';
import fetch from 'node-fetch';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { prisma } from '../lib/prisma.js';
import { getCurrentQuarter, getQuarterDateRange } from '../services/quarterlyService.js';
import { POINT_VALUES } from '../config/points-config.js';

dotenv.config();

const argv = yargs(hideBin(process.argv))
  .option('user', { type: 'string', demandOption: true, describe: 'GitHub username/login' })
  .option('quarter', { type: 'string', demandOption: false, describe: 'Quarter to verify (YYYY-QN). Defaults to current.' })
  .option('org', { type: 'string', demandOption: false, describe: 'GitHub organization login. Defaults to env GITHUB_ORG.' })
  .help()
  .argv;

const GH_TOKEN = process.env.GITHUB_TOKEN;
if (!GH_TOKEN) {
  console.error('Missing GITHUB_TOKEN in environment');
  process.exit(1);
}

const ORG_LOGIN = argv.org || process.env.GITHUB_ORG;
if (!ORG_LOGIN) {
  console.error('Missing GitHub org. Pass --org or set GITHUB_ORG env var.');
  process.exit(1);
}

const USER_LOGIN = argv.user;

async function gh(query, variables) {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      'Authorization': `bearer ${GH_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    throw new Error('GitHub GraphQL error: ' + JSON.stringify(json.errors || json, null, 2));
  }
  return json.data;
}

async function getOrgId(login) {
  const q = `query($login:String!){ organization(login:$login){ id login } }`;
  const data = await gh(q, { login });
  if (!data.organization) throw new Error(`Organization not found: ${login}`);
  return data.organization.id;
}

function inRange(dateStr, start, end) {
  if (!dateStr) return false;
  const t = new Date(dateStr).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

async function getPRContributions(login, from, to, orgId, orgLogin) {
  const results = [];
  let after = null;
  const q = `
    query($login:String!, $from:DateTime!, $to:DateTime!, $orgID:ID, $after:String){
      user(login:$login){
        contributionsCollection(from:$from, to:$to, organizationID:$orgID){
          pullRequestContributions(first:100, after:$after){
            pageInfo{ hasNextPage endCursor }
            nodes{
              pullRequest{
                number
                mergedAt
                state
                url
                repository{ nameWithOwner owner{ login } }
              }
            }
          }
        }
      }
    }`;
  while (true) {
    const data = await gh(q, { login, from: from.toISOString(), to: to.toISOString(), orgID: orgId, after });
    const nodes = data?.user?.contributionsCollection?.pullRequestContributions?.nodes || [];
    for (const n of nodes) {
      const pr = n.pullRequest;
      if (!pr) continue;
      // If org filter not applied, ensure repo owner matches
      if (orgId == null && pr.repository?.owner?.login !== orgLogin) continue;
      results.push(pr);
    }
    const pi = data?.user?.contributionsCollection?.pullRequestContributions?.pageInfo;
    if (!pi?.hasNextPage) break;
    after = pi.endCursor;
  }
  return results;
}

async function getReviewContributions(login, from, to, orgId, orgLogin) {
  const results = [];
  let after = null;
  const q = `
    query($login:String!, $from:DateTime!, $to:DateTime!, $orgID:ID, $after:String){
      user(login:$login){
        contributionsCollection(from:$from, to:$to, organizationID:$orgID){
          pullRequestReviewContributions(first:100, after:$after){
            pageInfo{ hasNextPage endCursor }
            nodes{
              pullRequestReview{ submittedAt createdAt state }
              pullRequest{ number url repository{ nameWithOwner owner{ login } } }
            }
          }
        }
      }
    }`;
  while (true) {
    const data = await gh(q, { login, from: from.toISOString(), to: to.toISOString(), orgID: orgId, after });
    const nodes = data?.user?.contributionsCollection?.pullRequestReviewContributions?.nodes || [];
    for (const n of nodes) {
      const repoOwner = n.pullRequest?.repository?.owner?.login;
      if (orgId == null && repoOwner !== orgLogin) continue;
      results.push({
        submittedAt: n.pullRequestReview?.submittedAt || n.pullRequestReview?.createdAt,
        pullRequest: n.pullRequest
      });
    }
    const pi = data?.user?.contributionsCollection?.pullRequestReviewContributions?.pageInfo;
    if (!pi?.hasNextPage) break;
    after = pi.endCursor;
  }
  return results;
}

async function main() {
  try {
    const quarter = argv.quarter || await getCurrentQuarter();
    const { start, end } = await getQuarterDateRange(quarter);

    // Resolve org ID, but fall back to owner filter if the API rejects organizationID
    let orgId = null;
    try {
      orgId = await getOrgId(ORG_LOGIN);
    } catch (e) {
      console.warn('Warning: could not fetch organization ID, falling back to client-side filtering:', e.message);
    }

    console.log(`\n🔎 Verifying ${USER_LOGIN} for ${quarter}`);
    console.log(`Org: ${ORG_LOGIN}`);
    console.log(`Range: ${start.toISOString()} → ${end.toISOString()}`);

    const prContribs = await getPRContributions(USER_LOGIN, start, end, orgId, ORG_LOGIN);
    // Count only PRs merged within the window
    const mergedPRs = prContribs.filter(pr => inRange(pr.mergedAt, start, end));

    const reviewContribs = await getReviewContributions(USER_LOGIN, start, end, orgId, ORG_LOGIN);
    // contributionsCollection already scoped by from/to, but double-check submission time
    const reviews = reviewContribs.filter(rv => inRange(rv.submittedAt, start, end));

    const ghPrs = mergedPRs.length;
    const ghReviews = reviews.length;
    const ghPoints = ghPrs * (POINT_VALUES.default || 40) + ghReviews * (POINT_VALUES.review || 15);

    // Fetch local snapshot
    const local = await prisma.contributor.findUnique({ where: { username: USER_LOGIN } });
    const qStats = local?.quarterlyStats || {};
    const localIsSameQuarter = qStats.currentQuarter === quarter;

    console.log('\nGitHub-derived totals (from GraphQL):');
    console.log(`  PRs merged:   ${ghPrs}`);
    console.log(`  Reviews:      ${ghReviews}`);
    console.log(`  Points:       ${ghPoints}`);

    console.log('\nLocal This Quarter:');
    if (!local) {
      console.log('  Contributor not found locally');
    } else if (!localIsSameQuarter) {
      console.log(`  quarterlyStats not for ${quarter} (found: ${qStats.currentQuarter || 'n/a'})`);
    } else {
      console.log(`  PRs merged:   ${qStats.prsThisQuarter || 0}`);
      console.log(`  Reviews:      ${qStats.reviewsThisQuarter || 0}`);
      console.log(`  Points:       ${qStats.pointsThisQuarter || 0}`);
    }

    // Simple diff summary
    if (local && localIsSameQuarter) {
      const dPr = (qStats.prsThisQuarter || 0) - ghPrs;
      const dRv = (qStats.reviewsThisQuarter || 0) - ghReviews;
      const dPt = (qStats.pointsThisQuarter || 0) - ghPoints;
      console.log('\nDiff (Local - GitHub):');
      console.log(`  PRs:     ${dPr}`);
      console.log(`  Reviews: ${dRv}`);
      console.log(`  Points:  ${dPt}`);
    }

    console.log('\n✅ Verification complete\n');
  } catch (err) {
    console.error('\n❌ Verification failed:', err.message);
    // Print additional details if present
    if (err.stack) console.error(err.stack.split('\n').slice(0, 3).join('\n'));
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
