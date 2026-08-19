-- An achievement is earned once per contributor. awardAchievement checks an
-- earned-set first, but that is a read: two concurrent events (a PR merge and a
-- review arriving together) can both see the achievement as unearned, both insert,
-- and both pay the bonus points.
--
-- Production applies schema changes with `prisma db push` (see
-- applications/game-ops/prod/application.tf in cru-terraform), which reads only
-- schema.prisma and never this directory. The constraint therefore lives in
-- schema.prisma as @@unique([contributorId, achievementId]); this file exists so the
-- migrate-deploy path used by docker-compose stays in step.
--
-- Verified against production before writing this: zero violating
-- (contributor_id, achievement_id) pairs, so the index builds cleanly.
DO $$
DECLARE
    duplicate_pairs integer;
BEGIN
    SELECT count(*) INTO duplicate_pairs FROM (
        SELECT contributor_id, achievement_id
        FROM "achievements"
        GROUP BY contributor_id, achievement_id
        HAVING count(*) > 1
    ) AS d;

    IF duplicate_pairs > 0 THEN
        RAISE EXCEPTION
            'achievements holds % duplicated (contributor_id, achievement_id) pair(s). Keep the earliest earned_at row per pair and reverse the duplicated bonus from contributors.total_points / all_time_points and the matching point_history rows before adding this index.',
            duplicate_pairs;
    END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "achievements_contributor_id_achievement_id_key" ON "achievements"("contributor_id", "achievement_id");
