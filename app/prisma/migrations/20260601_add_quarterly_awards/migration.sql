-- CreateTable
CREATE TABLE "quarterly_awards" (
    "id" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "awarded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "results" JSONB,

    CONSTRAINT "quarterly_awards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "quarterly_awards_quarter_key" ON "quarterly_awards"("quarter");
