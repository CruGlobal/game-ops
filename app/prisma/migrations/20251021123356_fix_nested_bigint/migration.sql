-- AlterTable
ALTER TABLE "point_history" ALTER COLUMN "points" SET DATA TYPE BIGINT,
ALTER COLUMN "pr_number" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "processed_prs" ALTER COLUMN "pr_number" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "processed_reviews" ALTER COLUMN "pr_number" SET DATA TYPE BIGINT,
ALTER COLUMN "review_id" SET DATA TYPE BIGINT;
