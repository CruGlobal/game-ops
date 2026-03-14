-- AlterTable
ALTER TABLE "quarter_settings" ADD COLUMN "enable_slack_notifications" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "quarter_settings" ADD COLUMN "slack_webhook_url" TEXT;
