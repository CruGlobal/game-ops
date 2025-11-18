-- AlterTable: Add DevOps team sync fields to quarter_settings
ALTER TABLE "quarter_settings"
ADD COLUMN IF NOT EXISTS "devops_team_members" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN IF NOT EXISTS "exclude_devops_from_leaderboards" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "devops_team_slug" TEXT NOT NULL DEFAULT 'devops-engineering-team',
ADD COLUMN IF NOT EXISTS "devops_team_last_sync" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "devops_team_sync_enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable: Add DevOps flag to contributors
ALTER TABLE "contributors"
ADD COLUMN IF NOT EXISTS "is_devops" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "devops_team_synced_at" TIMESTAMP(3);

-- Create index on is_devops for faster filtering
CREATE INDEX IF NOT EXISTS "contributors_is_devops_idx" ON "contributors"("is_devops");
