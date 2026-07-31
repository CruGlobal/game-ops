-- A challenge can only be awarded to a contributor once. Without this constraint the
-- award check in completeChallenge() and reconcileMissingChallengeAwards() is a
-- read-then-write: two overlapping writers both see the participation as unawarded and
-- both pay out.

-- Existing duplicates would make the index creation fail with a bare
-- "could not create unique index" and, because the container runs `prisma migrate
-- deploy` on boot, that failure blocks startup. Fail with an actionable message
-- instead. Deliberately does not delete anything: each duplicate row has matching
-- point_history and contributor totals that have to be reversed as a decision, not as
-- a migration side effect.
DO $$
DECLARE
    duplicate_pairs integer;
BEGIN
    SELECT count(*) INTO duplicate_pairs FROM (
        SELECT contributor_id, challenge_id
        FROM "completed_challenges"
        GROUP BY contributor_id, challenge_id
        HAVING count(*) > 1
    ) AS d;

    IF duplicate_pairs > 0 THEN
        RAISE EXCEPTION
            'completed_challenges holds % duplicated (contributor_id, challenge_id) pair(s). Resolve them before adding the unique index: keep the earliest completed_at row per pair, delete the rest, then reverse the duplicated reward from contributors.total_points / all_time_points and the matching point_history rows.',
            duplicate_pairs;
    END IF;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "completed_challenges_contributor_id_challenge_id_key" ON "completed_challenges"("contributor_id", "challenge_id");
