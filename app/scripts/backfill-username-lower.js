/**
 * Populate contributors.username_lower for rows that predate the column.
 *
 * Production applies schema changes with `prisma db push`, which adds the column but
 * cannot fill it — and a NULL does not collide with anything, so until every row is
 * populated the unique constraint enforces nothing. Run this once after the deploy
 * that introduces the column.
 *
 *   node scripts/backfill-username-lower.js            # dry run
 *   node scripts/backfill-username-lower.js --apply    # commit
 *
 * Safe to re-run: it only touches rows where username_lower is NULL.
 */
import { prisma } from '../lib/prisma.js';

const APPLY = process.argv.includes('--apply');

async function main() {
    // A case fork would make two rows want the same username_lower and the update
    // would fail on the unique constraint. Surface that as an instruction, not a
    // constraint violation.
    const all = await prisma.contributor.findMany({ select: { id: true, username: true, usernameLower: true } });
    const byLower = new Map();
    for (const c of all) {
        const key = c.username.toLowerCase();
        byLower.set(key, [...(byLower.get(key) || []), c.username]);
    }
    const forks = [...byLower.entries()].filter(([, names]) => names.length > 1);
    if (forks.length > 0) {
        console.error(`Refusing to backfill: ${forks.length} login(s) are split across rows differing only by case.`);
        for (const [key, names] of forks) console.error(`  ${key}: ${names.join(', ')}`);
        console.error('Merge them first with scripts/merge-case-duplicate-contributors.js, then re-run.');
        process.exitCode = 1;
        return;
    }

    const pending = all.filter(c => c.usernameLower === null);
    console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${pending.length} of ${all.length} contributor(s) need username_lower.`);
    if (pending.length === 0) return;

    for (const c of pending.slice(0, 20)) console.log(`  ${c.username} -> ${c.username.toLowerCase()}`);
    if (pending.length > 20) console.log(`  ... and ${pending.length - 20} more`);

    if (!APPLY) {
        console.log('\nNothing written. Re-run with --apply to commit.');
        return;
    }

    let updated = 0;
    for (const c of pending) {
        await prisma.contributor.update({
            where: { id: c.id },
            data: { usernameLower: c.username.toLowerCase() }
        });
        updated++;
    }
    console.log(`\nBackfilled ${updated} contributor(s).`);
}

main()
    .catch((err) => { console.error(err); process.exitCode = 1; })
    .finally(() => prisma.$disconnect());
