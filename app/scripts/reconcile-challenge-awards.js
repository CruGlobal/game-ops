#!/usr/bin/env node
/**
 * Reconcile Missing Challenge Awards
 *
 * completeChallenge() writes the CompletedChallenge row and the reward points in one
 * transaction, but the participant's `completed` flag is written by the caller in a
 * separate statement beforehand. If the award transaction fails, the flag survives
 * without the points: the participation looks finished and pays nothing.
 *
 * This script reports (and optionally pays out) participations that earned their
 * reward but never received it:
 *   - flagged-not-awarded:    completed=true with no CompletedChallenge row
 *   - target-met-not-flagged: progress >= target, never flagged, never awarded
 *
 * Only `flagged-not-awarded` is paid by default. Progress used to accrue on challenges
 * that had already ended, so a progress figure above target can be the residue of
 * post-window activity that never earned the reward (a 5-PR challenge sitting at 34/5
 * months later). Pass --include-unflagged to pay those too, and read the reported rows
 * first: if the progress figure looks inflated for the challenge duration, it is.
 *
 * Awards are backdated to the challenge end date, so the CompletedChallenge row and the
 * point-history entry sit in the period the work happened in.
 *
 * Quarterly stats are only repaired for challenges that ended in the CURRENT quarter.
 * `Contributor.quarterlyStats` holds one live quarter and past quarters are settled in
 * QuarterlyWinner archives with their rewards already paid, so there is nowhere to write
 * a closed quarter's points. Those awards are listed under "Quarterly stats NOT
 * repaired" rather than silently dropped.
 *
 * Re-running is safe, including alongside another run or the live award path: the unique
 * (contributorId, challengeId) constraint on CompletedChallenge rejects a duplicate and
 * the award transaction rolls back rather than paying twice.
 *
 * Usage:
 *   # Report only (default, writes nothing)
 *   node scripts/reconcile-challenge-awards.js
 *
 *   # Report for one contributor
 *   node scripts/reconcile-challenge-awards.js --user jasonbuckner
 *
 *   # Pay out the unambiguous awards
 *   node scripts/reconcile-challenge-awards.js --apply
 *
 *   # Also pay participations that met target but were never flagged
 *   node scripts/reconcile-challenge-awards.js --apply --include-unflagged
 *
 * After applying, refresh the standings:
 *   npm run recompute:quarter:history
 *
 * Requires DATABASE_URL in env.
 */

import dotenv from 'dotenv';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { prisma } from '../lib/prisma.js';
import { reconcileMissingChallengeAwards } from '../services/challengeService.js';

dotenv.config();

const argv = yargs(hideBin(process.argv))
    .option('apply', {
        type: 'boolean',
        default: false,
        describe: 'Write the missing awards. Omit for a dry run.'
    })
    .option('user', {
        type: 'string',
        demandOption: false,
        describe: 'Limit the run to one GitHub username. Defaults to all contributors.'
    })
    .option('include-unflagged', {
        type: 'boolean',
        default: false,
        describe: 'Also pay participations that met target but were never flagged complete. '
            + 'Their progress may be inflated by post-window activity - review the report first.'
    })
    .help()
    .argv;

async function reconcileChallengeAwards() {
    const mode = argv.apply ? 'APPLY' : 'DRY RUN';
    console.log(`🔍 Reconciling missing challenge awards (${mode})\n`);

    try {
        const { awards, paid, skipped, quarterlyDeferred, totalPoints, paidPoints } = await reconcileMissingChallengeAwards({
            apply: argv.apply,
            username: argv.user || null,
            includeUnflagged: argv.includeUnflagged
        });

        if (awards.length === 0) {
            console.log('✅ No missing challenge awards found. Nothing to do.\n');
            return;
        }

        const byUser = new Map();
        for (const award of awards) {
            if (!byUser.has(award.username)) {
                byUser.set(award.username, []);
            }
            byUser.get(award.username).push(award);
        }

        for (const [username, userAwards] of byUser) {
            const userPoints = userAwards.reduce((sum, a) => sum + a.reward, 0);
            console.log(`${username}: ${userAwards.length} award(s), ${userPoints} pts`);
            for (const award of userAwards) {
                console.log(
                    `  - ${award.title} (${award.progress}/${award.target}) ` +
                    `+${award.reward} pts, ended ${award.endDate.toISOString().split('T')[0]} ` +
                    `[${award.reason}]`
                );
            }
        }

        console.log('\nSummary:');
        console.log(`  - Contributors affected: ${byUser.size}`);
        console.log(`  - Awards owed: ${awards.length} (${totalPoints} pts)`);

        const withheld = skipped.filter(a => a.reason === 'target-met-not-flagged');
        const raced = skipped.filter(a => a.reason === 'already-awarded');

        if (withheld.length > 0) {
            console.log(`  - Withheld as target-met-not-flagged: ${withheld.length} `
                + `(${withheld.reduce((sum, a) => sum + a.reward, 0)} pts)`);
            console.log('    Their progress may be inflated by activity after the challenge');
            console.log('    ended. Review the figures above, then pass --include-unflagged');
            console.log('    to pay them.');
        }

        if (raced.length > 0) {
            console.log(`  - Already paid by another writer: ${raced.length}`);
        }

        if (argv.apply) {
            console.log(`  - Awards paid: ${paid.length} (${paidPoints} pts)`);

            if (quarterlyDeferred.length > 0) {
                console.log(`  - Quarterly stats NOT repaired: ${quarterlyDeferred.length} `
                    + `(${quarterlyDeferred.reduce((sum, a) => sum + a.reward, 0)} pts)`);
                console.log('    These challenges ended in a closed quarter. Total and all-time');
                console.log('    points and point history were repaired, but pointsThisQuarter');
                console.log('    was not: quarterlyStats holds only the live quarter, and past');
                console.log('    quarters are already settled in the Hall of Fame with their');
                console.log('    rewards paid. Reopening one is a decision, not a backfill.');
                for (const award of quarterlyDeferred) {
                    console.log(`      ${award.username}: ${award.title} `
                        + `(ended ${award.endDate.toISOString().split('T')[0]}, +${award.reward} pts)`);
                }
            }

            const currentQuarterPaid = paid.length - quarterlyDeferred.length;
            if (currentQuarterPaid > 0) {
                console.log('\n🎉 Backfill complete. Refresh the current quarter standings with:');
                console.log('     npm run recompute:quarter:history');
            } else {
                console.log('\n🎉 Backfill complete.');
            }
        } else {
            console.log('\nRe-run with --apply to award these points.');
        }
    } catch (error) {
        console.error('❌ Error reconciling challenge awards:', error);
        throw error;
    } finally {
        await prisma.$disconnect();
    }
}

reconcileChallengeAwards()
    .catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
