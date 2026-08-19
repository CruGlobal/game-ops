/**
 * Rebuild the daily `reviews` aggregate counts from processed_reviews.
 *
 * The pre-fix processSingleReview incremented both contributors.reviewCount AND the
 * daily Review row before bailing out on a replay, so both drifted. Only the counter
 * was repaired (/api/admin/fix-duplicates reconciles counters, not aggregates), which
 * left the daily table roughly 3x high — 47,469 against 15,061 real credits.
 *
 * That is not cosmetic: recomputeCurrentQuarterStatsFallback and the
 * recomputeHallOfFame fallback both PREFER this table over the processed tables, so a
 * future recompute would re-import the inflation into visible quarterly stats.
 *
 * processed_reviews is the authority. Six of the eight years already agree with it
 * exactly, which is what makes rebuilding from it sound rather than a guess.
 *
 *   node scripts/reconcile-daily-review-aggregate.js            # dry run
 *   node scripts/reconcile-daily-review-aggregate.js --apply    # commit
 *
 * Corrects counts only. Rows with no matching processed_reviews, and processed days
 * with no aggregate row, are reported but NOT deleted or created: inventing or
 * removing a day is a different decision from fixing a number, and there are none of
 * either in production. Safe to re-run.
 */
import { writeFileSync } from 'fs';
import { prisma } from '../lib/prisma.js';

const APPLY = process.argv.includes('--apply');
const BACKUP = (process.argv.find(a => a.startsWith('--backup=')) || '').split('=')[1];

// `date` is a midnight timestamp and processedDate a real one; both are stored without
// a zone, so UTC parts reproduce Postgres's own ::date bucketing.
const dayKey = (contributorId, d) => `${contributorId}|${new Date(d).toISOString().slice(0, 10)}`;

async function main() {
    const [processed, aggregates, contributors] = await Promise.all([
        prisma.processedReview.findMany({ select: { contributorId: true, processedDate: true } }),
        prisma.review.findMany({ select: { id: true, contributorId: true, date: true, count: true } }),
        prisma.contributor.findMany({ select: { id: true, username: true } })
    ]);

    const nameById = new Map(contributors.map(c => [c.id, c.username]));

    const truth = new Map();
    for (const r of processed) {
        const key = dayKey(r.contributorId, r.processedDate);
        truth.set(key, (truth.get(key) || 0) + 1);
    }

    const seen = new Set();
    const toUpdate = [];
    const orphans = [];
    for (const row of aggregates) {
        const key = dayKey(row.contributorId, row.date);
        seen.add(key);
        const correct = truth.get(key);
        if (correct === undefined) { orphans.push(row); continue; }
        if (Number(row.count) !== correct) toUpdate.push({ row, correct });
    }
    const missing = [...truth.keys()].filter(k => !seen.has(k));

    const drift = toUpdate.reduce((n, u) => n + (Number(u.row.count) - u.correct), 0);
    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'}`);
    console.log(`  aggregate rows:      ${aggregates.length}`);
    console.log(`  already correct:     ${aggregates.length - toUpdate.length - orphans.length}`);
    console.log(`  counts to correct:   ${toUpdate.length}  (net ${drift > 0 ? '-' : '+'}${Math.abs(drift)} credits)`);
    console.log(`  orphan rows (left):  ${orphans.length}`);
    console.log(`  missing days (left): ${missing.length}`);

    for (const { row, correct } of toUpdate.slice(0, 10)) {
        console.log(`    ${nameById.get(row.contributorId) || row.contributorId} ${new Date(row.date).toISOString().slice(0, 10)}: ${row.count} -> ${correct}`);
    }
    if (toUpdate.length > 10) console.log(`    ... and ${toUpdate.length - 10} more`);

    if (BACKUP) {
        writeFileSync(BACKUP, JSON.stringify({
            takenAt: new Date().toISOString(),
            rows: aggregates.map(r => ({ ...r, count: Number(r.count), username: nameById.get(r.contributorId) }))
        }, null, 2));
        console.log(`\nBackup of every aggregate row written to ${BACKUP}`);
    }

    if (!APPLY) {
        console.log('\nNothing written. Re-run with --apply to commit.');
        return;
    }

    for (const { row, correct } of toUpdate) {
        await prisma.review.update({ where: { id: row.id }, data: { count: correct } });
    }
    console.log(`\nCorrected ${toUpdate.length} aggregate row(s).`);
}

main()
    .catch((err) => { console.error(err); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
