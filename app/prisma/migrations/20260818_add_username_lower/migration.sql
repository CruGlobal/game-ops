-- Case-insensitive uniqueness for contributor logins, carried by a column rather
-- than an index expression.
--
-- GitHub treats logins case-insensitively but `username` is a plain unique text
-- column, so a login recovered from a lowercased no-reply trailer forked five
-- contributors into a second row each (#140, #141).
--
-- The obvious fix, `CREATE UNIQUE INDEX ... (lower(username))`, cannot work here:
-- production applies schema changes with `prisma db push` (see
-- applications/game-ops/prod/application.tf in cru-terraform), which reconciles the
-- database against schema.prisma and never reads this directory. A functional index
-- cannot be expressed in schema.prisma, so it would exist only where migrations run
-- — i.e. local docker-compose — and never in production. A plain column with a
-- unique constraint is expressible, so db push creates and keeps it.
--
-- This file keeps the migrate-deploy path (docker-compose) in step with what db push
-- derives from schema.prisma. Production gets the column from db push and needs the
-- backfill below run once via scripts/backfill-username-lower.js, since db push adds
-- the column but cannot populate it.

-- Existing case duplicates would make the unique index fail to build. Fail with an
-- actionable message rather than a bare "could not create unique index".
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
            'contributors holds % login(s) split across rows differing only by case. Merge them first: run `node scripts/merge-case-duplicate-contributors.js` to preview, then `--apply`.',
            duplicate_logins;
    END IF;
END $$;

-- AlterTable
ALTER TABLE "contributors" ADD COLUMN IF NOT EXISTS "username_lower" TEXT;

-- Backfill: NULLs do not collide, so an unpopulated column enforces nothing.
UPDATE "contributors" SET "username_lower" = lower("username") WHERE "username_lower" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "contributors_username_lower_key" ON "contributors"("username_lower");
