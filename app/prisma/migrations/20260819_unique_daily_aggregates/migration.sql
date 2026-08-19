-- One Contribution/Review row per contributor per day.
--
-- Both write paths were find-then-create with no constraint behind them, so two
-- same-day events could each find nothing and each insert. Consumers that sum the
-- rows are unaffected, but anything reading a single row per day silently
-- undercounts — the same shape of drift reconcile-daily-review-aggregate.js exists
-- to repair.
--
-- Production applies schema changes with `prisma db push`, which reads only
-- schema.prisma; this file keeps the docker-compose migrate-deploy path in step.
-- Verified against production before writing: zero violating (contributor_id, date)
-- pairs in either table, so both indexes build cleanly.
DO $$
DECLARE
    dupe_contributions integer;
    dupe_reviews integer;
BEGIN
    SELECT count(*) INTO dupe_contributions FROM (
        SELECT contributor_id, date FROM "contributions" GROUP BY 1,2 HAVING count(*) > 1) c;
    SELECT count(*) INTO dupe_reviews FROM (
        SELECT contributor_id, date FROM "reviews" GROUP BY 1,2 HAVING count(*) > 1) r;

    IF dupe_contributions > 0 OR dupe_reviews > 0 THEN
        RAISE EXCEPTION
            'Daily aggregates hold duplicates (contributions: %, reviews: %). Merge each duplicated (contributor_id, date) pair into one row, summing count and OR-ing merged, before adding these indexes.',
            dupe_contributions, dupe_reviews;
    END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "contributions_contributor_id_date_key" ON "contributions"("contributor_id", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "reviews_contributor_id_date_key" ON "reviews"("contributor_id", "date");
