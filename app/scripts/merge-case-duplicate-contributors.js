/**
 * Merge contributor rows that differ only by the casing of their username.
 *
 * GitHub logins are case-insensitive but `contributors.username` is a plain
 * unique text column, so a login recovered from a lowercased no-reply email
 * forked contributors into a second row (see resolveContributorUsername). The
 * ingestion fix stops new forks; this script folds the existing strays back
 * into the row that holds the history — the oldest row of each casing group.
 *
 * The merge adds, it does not reconcile: counters are summed rather than
 * recomputed from the processed-row tables, so any pre-existing prCount /
 * processedPRs drift is left exactly as it was for the separate
 * /api/admin/fix-duplicates pass to correct. Run that pass after this one.
 *
 *   node scripts/merge-case-duplicate-contributors.js            # dry run
 *   node scripts/merge-case-duplicate-contributors.js --apply    # commit
 *
 * The dry run executes the real merge inside a transaction and rolls it back,
 * so the preview cannot drift from what --apply does.
 */
import { writeFileSync } from 'fs';
import { prisma } from '../lib/prisma.js';

const APPLY = process.argv.includes('--apply');
const BACKUP = (process.argv.find(a => a.startsWith('--backup=')) || '').split('=')[1];

class Rollback extends Error {}

const json = (v) => JSON.stringify(v, (_k, x) => (typeof x === 'bigint' ? x.toString() : x), 2);
// Contributor counters are BigInt; the daily aggregate counts are plain Int.
const big = (v) => BigInt(v ?? 0);

/** Group contributors by lowercased username; oldest row is the one we keep. */
async function findCaseGroups() {
    const all = await prisma.contributor.findMany({ orderBy: { createdAt: 'asc' } });
    const byLower = new Map();
    for (const c of all) {
        const key = c.username.toLowerCase();
        if (!byLower.has(key)) byLower.set(key, []);
        byLower.get(key).push(c);
    }
    return [...byLower.values()]
        .filter(rows => rows.length > 1)
        .map(rows => ({ keep: rows[0], strays: rows.slice(1) }));
}

/** Union badge lists by badge name, keeping the earliest award date. */
function mergeBadges(keepBadges, strayBadges) {
    const out = new Map();
    for (const b of [...(keepBadges || []), ...(strayBadges || [])]) {
        if (!b?.badge) continue;
        const prev = out.get(b.badge);
        if (!prev || new Date(b.date) < new Date(prev.date)) out.set(b.badge, b);
    }
    return [...out.values()];
}

/** Add the stray's quarter totals into the keeper's, but only for the same quarter. */
function mergeQuarterlyStats(keep, stray) {
    if (!stray) return keep;
    if (!keep) return stray;
    if (keep.currentQuarter !== stray.currentQuarter) return keep;
    return {
        ...keep,
        prsThisQuarter: (keep.prsThisQuarter || 0) + (stray.prsThisQuarter || 0),
        reviewsThisQuarter: (keep.reviewsThisQuarter || 0) + (stray.reviewsThisQuarter || 0),
        pointsThisQuarter: (keep.pointsThisQuarter || 0) + (stray.pointsThisQuarter || 0)
    };
}

const AWARD_FLAGS = [
    'firstPrAwarded', 'firstReviewAwarded', 'first10PrsAwarded', 'first10ReviewsAwarded',
    'first50PrsAwarded', 'first50ReviewsAwarded', 'first100PrsAwarded', 'first100ReviewsAwarded',
    'first500PrsAwarded', 'first500ReviewsAwarded', 'first1000PrsAwarded', 'first1000ReviewsAwarded',
    'sevenDayBadge', 'thirtyDayBadge', 'ninetyDayBadge', 'yearLongBadge'
];

async function mergeStray(tx, keep, stray, log) {
    const keepId = keep.id;
    const strayId = stray.id;

    // --- processed PRs: reassign, drop anything the keeper already has -------
    for (const pr of await tx.processedPR.findMany({ where: { contributorId: strayId } })) {
        const clash = await tx.processedPR.findFirst({
            where: { contributorId: keepId, prNumber: pr.prNumber, action: pr.action }
        });
        if (clash) { await tx.processedPR.delete({ where: { id: pr.id } }); log.prsDropped++; }
        else { await tx.processedPR.update({ where: { id: pr.id }, data: { contributorId: keepId } }); log.prsMoved++; }
    }

    // --- processed reviews: same shape, unique on (contributor, pr, review) --
    for (const rv of await tx.processedReview.findMany({ where: { contributorId: strayId } })) {
        const clash = await tx.processedReview.findFirst({
            where: { contributorId: keepId, prNumber: rv.prNumber, reviewId: rv.reviewId }
        });
        if (clash) { await tx.processedReview.delete({ where: { id: rv.id } }); log.reviewsDropped++; }
        else { await tx.processedReview.update({ where: { id: rv.id }, data: { contributorId: keepId } }); log.reviewsMoved++; }
    }

    // --- daily contribution aggregate: fold same-date rows together ----------
    // There is no unique index on (contributor_id, date), but the app looks the
    // row up with findFirst, so leaving two rows for one date would silently
    // strand a count. Sum instead.
    for (const c of await tx.contribution.findMany({ where: { contributorId: strayId } })) {
        const same = await tx.contribution.findFirst({ where: { contributorId: keepId, date: c.date } });
        if (same) {
            await tx.contribution.update({
                where: { id: same.id },
                data: { count: Number(same.count) + Number(c.count), merged: same.merged || c.merged }
            });
            await tx.contribution.delete({ where: { id: c.id } });
            log.contributionsFolded++;
        } else {
            await tx.contribution.update({ where: { id: c.id }, data: { contributorId: keepId } });
            log.contributionsMoved++;
        }
    }

    // --- daily review aggregate: same treatment -----------------------------
    for (const r of await tx.review.findMany({ where: { contributorId: strayId } })) {
        const same = await tx.review.findFirst({ where: { contributorId: keepId, date: r.date } });
        if (same) {
            await tx.review.update({ where: { id: same.id }, data: { count: Number(same.count) + Number(r.count) } });
            await tx.review.delete({ where: { id: r.id } });
            log.reviewAggFolded++;
        } else {
            await tx.review.update({ where: { id: r.id }, data: { contributorId: keepId } });
            log.reviewAggMoved++;
        }
    }

    // --- point history: straight reassignment, no uniqueness to honour -------
    const pts = await tx.pointHistory.updateMany({
        where: { contributorId: strayId }, data: { contributorId: keepId }
    });
    log.pointHistoryMoved += pts.count;

    // --- achievements: dedupe on achievementId ------------------------------
    for (const a of await tx.achievement.findMany({ where: { contributorId: strayId } })) {
        const clash = await tx.achievement.findFirst({
            where: { contributorId: keepId, achievementId: a.achievementId }
        });
        if (clash) { await tx.achievement.delete({ where: { id: a.id } }); log.achievementsDropped++; }
        else { await tx.achievement.update({ where: { id: a.id }, data: { contributorId: keepId } }); log.achievementsMoved++; }
    }

    // --- challenge participation --------------------------------------------
    // Progress is a count of the contributor's qualifying activity, and that
    // activity is being moved onto the keeper, so the keeper's progress has to
    // absorb the stray's rather than discard it. Cap at target and re-derive
    // `completed`, since a summed progress can now cross the line.
    for (const cp of await tx.challengeParticipant.findMany({ where: { contributorId: strayId } })) {
        const clash = await tx.challengeParticipant.findFirst({
            where: { contributorId: keepId, challengeId: cp.challengeId }
        });
        if (clash) {
            const target = clash.target ?? cp.target ?? 0;
            const progress = Math.min((clash.progress || 0) + (cp.progress || 0), target || Infinity);
            await tx.challengeParticipant.update({
                where: { id: clash.id },
                data: { progress, completed: clash.completed || cp.completed || (target > 0 && progress >= target) }
            });
            await tx.challengeParticipant.delete({ where: { id: cp.id } });
            log.challengeProgressFolded++;
        } else {
            await tx.challengeParticipant.update({ where: { id: cp.id }, data: { contributorId: keepId } });
            log.challengeParticipantsMoved++;
        }
    }

    // --- completed challenges: dedupe on challengeId ------------------------
    for (const cc of await tx.completedChallenge.findMany({ where: { contributorId: strayId } })) {
        const clash = await tx.completedChallenge.findFirst({
            where: { contributorId: keepId, challengeId: cc.challengeId }
        });
        if (clash) { await tx.completedChallenge.delete({ where: { id: cc.id } }); log.completedChallengesDropped++; }
        else { await tx.completedChallenge.update({ where: { id: cc.id }, data: { contributorId: keepId } }); log.completedChallengesMoved++; }
    }

    // --- the contributor row itself ------------------------------------------
    const fresh = await tx.contributor.findUnique({ where: { id: keepId } });
    const strayIsNewer = stray.lastContributionDate && fresh.lastContributionDate
        ? stray.lastContributionDate > fresh.lastContributionDate
        : !!stray.lastContributionDate && !fresh.lastContributionDate;

    const data = {
        prCount: big(fresh.prCount) + big(stray.prCount),
        reviewCount: big(fresh.reviewCount) + big(stray.reviewCount),
        totalPoints: big(fresh.totalPoints) + big(stray.totalPoints),
        allTimePoints: big(fresh.allTimePoints) + big(stray.allTimePoints),
        totalBillsAwarded: big(fresh.totalBillsAwarded) + big(stray.totalBillsAwarded),
        badges: mergeBadges(fresh.badges, stray.badges),
        quarterlyStats: mergeQuarterlyStats(fresh.quarterlyStats, stray.quarterlyStats),
        longestStreak: big(fresh.longestStreak) > big(stray.longestStreak) ? big(fresh.longestStreak) : big(stray.longestStreak),
        // Streak state belongs to whichever row contributed most recently.
        ...(strayIsNewer
            ? { currentStreak: big(stray.currentStreak), lastContributionDate: stray.lastContributionDate }
            : {}),
        // Never downgrade an existing DevOps classification.
        isDevOps: fresh.isDevOps || stray.isDevOps
    };
    for (const flag of AWARD_FLAGS) data[flag] = fresh[flag] || stray[flag];

    await tx.contributor.update({ where: { id: keepId }, data });
    await tx.contributor.delete({ where: { id: strayId } });
    log.strayDeleted++;
    log.counters = {
        prCount: `${fresh.prCount} + ${stray.prCount} -> ${data.prCount}`,
        reviewCount: `${fresh.reviewCount} + ${stray.reviewCount} -> ${data.reviewCount}`,
        allTimePoints: `${fresh.allTimePoints} + ${stray.allTimePoints} -> ${data.allTimePoints}`
    };
}

async function main() {
    const groups = await findCaseGroups();
    if (groups.length === 0) {
        console.log('No case-duplicate contributors found.');
        return;
    }

    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${groups.length} casing group(s):\n`);
    for (const { keep, strays } of groups) {
        console.log(`  keep  ${keep.username}  (created ${keep.createdAt.toISOString().slice(0, 10)}, pr=${keep.prCount}, rv=${keep.reviewCount})`);
        for (const s of strays) {
            console.log(`  merge ${s.username}  (created ${s.createdAt.toISOString().slice(0, 10)}, pr=${s.prCount}, rv=${s.reviewCount}, pts=${s.allTimePoints})`);
        }
    }
    console.log('');

    if (BACKUP) {
        const ids = groups.flatMap(g => [g.keep.id, ...g.strays.map(s => s.id)]);
        const dump = {
            takenAt: new Date().toISOString(),
            contributors: await prisma.contributor.findMany({ where: { id: { in: ids } } }),
            processedPRs: await prisma.processedPR.findMany({ where: { contributorId: { in: ids } } }),
            processedReviews: await prisma.processedReview.findMany({ where: { contributorId: { in: ids } } }),
            contributions: await prisma.contribution.findMany({ where: { contributorId: { in: ids } } }),
            reviews: await prisma.review.findMany({ where: { contributorId: { in: ids } } }),
            pointHistory: await prisma.pointHistory.findMany({ where: { contributorId: { in: ids } } }),
            achievements: await prisma.achievement.findMany({ where: { contributorId: { in: ids } } }),
            challengeParticipants: await prisma.challengeParticipant.findMany({ where: { contributorId: { in: ids } } }),
            completedChallenges: await prisma.completedChallenge.findMany({ where: { contributorId: { in: ids } } })
        };
        writeFileSync(BACKUP, json(dump));
        console.log(`Backup of every affected row written to ${BACKUP}\n`);
    }

    const results = [];
    try {
        await prisma.$transaction(async (tx) => {
            for (const { keep, strays } of groups) {
                for (const stray of strays) {
                    const log = {
                        keep: keep.username, stray: stray.username,
                        prsMoved: 0, prsDropped: 0, reviewsMoved: 0, reviewsDropped: 0,
                        contributionsMoved: 0, contributionsFolded: 0,
                        reviewAggMoved: 0, reviewAggFolded: 0,
                        pointHistoryMoved: 0, achievementsMoved: 0, achievementsDropped: 0,
                        challengeParticipantsMoved: 0, challengeProgressFolded: 0,
                        completedChallengesMoved: 0, completedChallengesDropped: 0,
                        strayDeleted: 0
                    };
                    await mergeStray(tx, keep, stray, log);
                    results.push(log);
                }
            }
            if (!APPLY) throw new Rollback();
        }, { timeout: 180000, maxWait: 30000 });
    } catch (err) {
        if (!(err instanceof Rollback)) throw err;
    }

    console.log(json(results));
    console.log(APPLY ? '\nCommitted.' : '\nRolled back — nothing was written. Re-run with --apply to commit.');
}

main()
    .catch((err) => { console.error(err); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
