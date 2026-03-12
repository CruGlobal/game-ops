-- CreateTable
CREATE TABLE IF NOT EXISTS "webhook_events" (
    "id" TEXT NOT NULL,
    "delivery_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'processed',

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "webhook_events_delivery_id_key" ON "webhook_events"("delivery_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "webhook_events_event_type_action_idx" ON "webhook_events"("event_type", "action");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "webhook_events_processed_at_idx" ON "webhook_events"("processed_at");
