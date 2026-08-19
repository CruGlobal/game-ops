-- Index for the contribution-grid query.
--
-- The grid groups contributions by date across ALL contributors
-- (WHERE date >= ... GROUP BY date). The existing composite index leads with
-- contributor_id, so it cannot serve that query and Postgres fell back to a
-- sequential scan on every request to a page anyone can load.
--
-- Production applies schema changes with `prisma db push`, which reads only
-- schema.prisma; this file keeps the docker-compose migrate-deploy path in step.
CREATE INDEX IF NOT EXISTS "contributions_date_idx" ON "contributions"("date");
