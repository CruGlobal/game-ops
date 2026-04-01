-- AlterTable: Add all_time_points column with default 0
ALTER TABLE "contributors" ADD COLUMN "all_time_points" BIGINT NOT NULL DEFAULT 0;

-- Backfill: Compute all_time_points from point_history for each contributor
UPDATE "contributors" c
SET "all_time_points" = COALESCE(
    (SELECT SUM(ph."points") FROM "point_history" ph WHERE ph."contributor_id" = c."id"),
    0
);

-- CreateIndex
CREATE INDEX "contributors_all_time_points_idx" ON "contributors"("all_time_points" DESC);
