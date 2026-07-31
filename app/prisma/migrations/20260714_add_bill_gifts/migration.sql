-- AlterTable: Add Bills recipient email fields to contributors
ALTER TABLE "contributors"
ADD COLUMN IF NOT EXISTS "bills_email" TEXT,
ADD COLUMN IF NOT EXISTS "bills_email_source" TEXT;

-- AlterTable: Add Bills gifts toggle to quarter_settings
ALTER TABLE "quarter_settings"
ADD COLUMN IF NOT EXISTS "enable_bills_gifts" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "bill_gifts" (
    "id" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "email" TEXT,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending_email',
    "bills_gift_id" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sent_at" TIMESTAMP(3),

    CONSTRAINT "bill_gifts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bill_gifts_quarter_username_key" ON "bill_gifts"("quarter", "username");

-- CreateIndex
CREATE INDEX "bill_gifts_status_idx" ON "bill_gifts"("status");
