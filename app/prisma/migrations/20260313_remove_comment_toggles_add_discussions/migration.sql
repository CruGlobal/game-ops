-- Remove old comment toggle columns
ALTER TABLE "quarter_settings" DROP COLUMN IF EXISTS "enable_achievement_comments";
ALTER TABLE "quarter_settings" DROP COLUMN IF EXISTS "enable_bills_comments";

-- Add GitHub Discussions toggle
ALTER TABLE "quarter_settings" ADD COLUMN "enable_github_discussions" BOOLEAN NOT NULL DEFAULT false;
