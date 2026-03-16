-- Drop the old unique constraint/index on quarter alone
DROP INDEX IF EXISTS "quarterly_winners_quarter_key";
ALTER TABLE "quarterly_winners" DROP CONSTRAINT IF EXISTS "quarterly_winners_quarter_key";

-- Add the category column with default 'general' for existing records
ALTER TABLE "quarterly_winners" ADD COLUMN IF NOT EXISTS "category" TEXT NOT NULL DEFAULT 'general';

-- Create new unique constraint on (quarter, category) if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'quarterly_winners_quarter_category_key'
    ) THEN
        ALTER TABLE "quarterly_winners" ADD CONSTRAINT "quarterly_winners_quarter_category_key" UNIQUE ("quarter", "category");
    END IF;
END
$$;
