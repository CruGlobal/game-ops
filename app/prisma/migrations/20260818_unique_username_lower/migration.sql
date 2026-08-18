-- GitHub treats logins case-insensitively, but `contributors.username` is a plain
-- unique text column, so `cru-luis-rodriguez` and `cru-Luis-Rodriguez` were stored as
-- two separate contributors. A login recovered from a Co-authored-by no-reply trailer
-- arrives lowercased (GitHub lowercases the email local part), which forked five
-- contributors into a second row each: stats split across the two, badges re-earned
-- from zero, and — because the DevOps team sync only ever matches the canonical
-- login — the stray row carried is_devops = false and surfaced on the public
-- leaderboard despite excludeDevOpsFromLeaderboards.

-- Application code now normalises the login before any lookup or mutation
-- (resolveContributorUsername), and the existing forks have been merged. This index
-- is the part the database enforces on its own, so a future ingestion path cannot
-- reintroduce the split.

-- Note: a functional unique index cannot be expressed in schema.prisma, so this
-- constraint lives only here. `prisma migrate dev` will report it as drift against
-- the schema; that is expected and must not be "fixed" by dropping the index.

-- Existing case duplicates would make the index creation fail with a bare
-- "could not create unique index" and, because the container runs `prisma migrate
-- deploy` on boot, that failure blocks startup. Fail with an actionable message
-- instead. Deliberately does not merge anything: folding two contributors together
-- moves processed PRs, point history, badges and challenge progress, which is a
-- decision, not a migration side effect.
DO $$
DECLARE
    duplicate_logins integer;
BEGIN
    SELECT count(*) INTO duplicate_logins FROM (
        SELECT lower(username)
        FROM "contributors"
        GROUP BY lower(username)
        HAVING count(*) > 1
    ) AS d;

    IF duplicate_logins > 0 THEN
        RAISE EXCEPTION
            'contributors holds % login(s) split across rows differing only by case. Merge them before adding the unique index: run `node scripts/merge-case-duplicate-contributors.js` to preview, then `--apply` to fold each stray into the oldest row of its casing group.',
            duplicate_logins;
    END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "contributors_username_lower_key" ON "contributors" (lower("username"));
