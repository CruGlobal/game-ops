-- AddForeignKey
ALTER TABLE "completed_challenges" ADD CONSTRAINT "completed_challenges_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;
