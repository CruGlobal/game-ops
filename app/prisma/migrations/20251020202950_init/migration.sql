-- CreateTable
CREATE TABLE "contributors" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "pr_count" INTEGER NOT NULL DEFAULT 0,
    "review_count" INTEGER NOT NULL DEFAULT 0,
    "avatar_url" TEXT,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "first_pr_awarded" BOOLEAN NOT NULL DEFAULT false,
    "first_review_awarded" BOOLEAN NOT NULL DEFAULT false,
    "first_10_prs_awarded" BOOLEAN NOT NULL DEFAULT false,
    "first_10_reviews_awarded" BOOLEAN NOT NULL DEFAULT false,
    "first_50_prs_awarded" BOOLEAN NOT NULL DEFAULT false,
    "first_50_reviews_awarded" BOOLEAN NOT NULL DEFAULT false,
    "first_100_prs_awarded" BOOLEAN NOT NULL DEFAULT false,
    "first_100_reviews_awarded" BOOLEAN NOT NULL DEFAULT false,
    "first_500_prs_awarded" BOOLEAN NOT NULL DEFAULT false,
    "first_500_reviews_awarded" BOOLEAN NOT NULL DEFAULT false,
    "first_1000_prs_awarded" BOOLEAN NOT NULL DEFAULT false,
    "first_1000_reviews_awarded" BOOLEAN NOT NULL DEFAULT false,
    "badges" JSONB NOT NULL DEFAULT '[]',
    "total_bills_awarded" INTEGER NOT NULL DEFAULT 0,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "last_contribution_date" TIMESTAMP(3),
    "longest_streak" INTEGER NOT NULL DEFAULT 0,
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "quarterly_stats" JSONB,
    "seven_day_badge" BOOLEAN NOT NULL DEFAULT false,
    "thirty_day_badge" BOOLEAN NOT NULL DEFAULT false,
    "ninety_day_badge" BOOLEAN NOT NULL DEFAULT false,
    "year_long_badge" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contributors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contributions" (
    "id" TEXT NOT NULL,
    "contributor_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "merged" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "contributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "contributor_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_history" (
    "id" TEXT NOT NULL,
    "contributor_id" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "pr_number" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "achievements" (
    "id" TEXT NOT NULL,
    "contributor_id" TEXT NOT NULL,
    "achievement_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "earned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "achievements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_prs" (
    "id" TEXT NOT NULL,
    "contributor_id" TEXT NOT NULL,
    "pr_number" INTEGER NOT NULL,
    "pr_title" TEXT,
    "processed_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,

    CONSTRAINT "processed_prs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processed_reviews" (
    "id" TEXT NOT NULL,
    "contributor_id" TEXT NOT NULL,
    "pr_number" INTEGER NOT NULL,
    "review_id" INTEGER,
    "processed_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processed_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenges" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "target" INTEGER NOT NULL,
    "reward" INTEGER NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "category" TEXT NOT NULL DEFAULT 'individual',
    "label_filters" JSONB,
    "okr_metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "challenge_participants" (
    "id" TEXT NOT NULL,
    "challenge_id" TEXT NOT NULL,
    "contributor_id" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "target" INTEGER,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "challenge_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "completed_challenges" (
    "id" TEXT NOT NULL,
    "contributor_id" TEXT NOT NULL,
    "challenge_id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reward" INTEGER NOT NULL,

    CONSTRAINT "completed_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "github_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pr_metadata" (
    "id" TEXT NOT NULL,
    "repo_owner" TEXT NOT NULL DEFAULT 'cru-Luis-Rodriguez',
    "repo_name" TEXT NOT NULL DEFAULT 'github-pr-scoreboard',
    "first_pr_fetched" INTEGER,
    "latest_pr_fetched" INTEGER,
    "total_prs_in_db" INTEGER NOT NULL DEFAULT 0,
    "date_range_start" TIMESTAMP(3),
    "date_range_end" TIMESTAMP(3),
    "last_fetch_date" TIMESTAMP(3),
    "fetch_history" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pr_metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quarter_settings" (
    "id" TEXT NOT NULL DEFAULT 'quarter-config',
    "system_type" TEXT NOT NULL DEFAULT 'calendar',
    "q1_start_month" INTEGER NOT NULL DEFAULT 1,
    "custom_quarters" JSONB,
    "last_modified" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "modified_by" TEXT NOT NULL DEFAULT 'system',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quarter_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quarterly_winners" (
    "id" TEXT NOT NULL,
    "quarter" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "quarter_number" INTEGER NOT NULL,
    "quarter_start" TIMESTAMP(3) NOT NULL,
    "quarter_end" TIMESTAMP(3) NOT NULL,
    "winner" JSONB NOT NULL,
    "top3" JSONB NOT NULL,
    "total_participants" INTEGER NOT NULL DEFAULT 0,
    "archived_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "quarterly_winners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fetch_dates" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fetch_dates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contributors_username_key" ON "contributors"("username");

-- CreateIndex
CREATE INDEX "contributors_username_idx" ON "contributors"("username");

-- CreateIndex
CREATE INDEX "contributors_total_points_idx" ON "contributors"("total_points" DESC);

-- CreateIndex
CREATE INDEX "contributors_current_streak_idx" ON "contributors"("current_streak" DESC);

-- CreateIndex
CREATE INDEX "contributions_contributor_id_date_idx" ON "contributions"("contributor_id", "date");

-- CreateIndex
CREATE INDEX "reviews_contributor_id_date_idx" ON "reviews"("contributor_id", "date");

-- CreateIndex
CREATE INDEX "point_history_contributor_id_timestamp_idx" ON "point_history"("contributor_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "achievements_contributor_id_earned_at_idx" ON "achievements"("contributor_id", "earned_at");

-- CreateIndex
CREATE INDEX "processed_prs_pr_number_idx" ON "processed_prs"("pr_number");

-- CreateIndex
CREATE UNIQUE INDEX "processed_prs_contributor_id_pr_number_action_key" ON "processed_prs"("contributor_id", "pr_number", "action");

-- CreateIndex
CREATE INDEX "processed_reviews_pr_number_idx" ON "processed_reviews"("pr_number");

-- CreateIndex
CREATE UNIQUE INDEX "processed_reviews_contributor_id_pr_number_review_id_key" ON "processed_reviews"("contributor_id", "pr_number", "review_id");

-- CreateIndex
CREATE INDEX "challenges_status_end_date_idx" ON "challenges"("status", "end_date");

-- CreateIndex
CREATE INDEX "challenge_participants_challenge_id_completed_idx" ON "challenge_participants"("challenge_id", "completed");

-- CreateIndex
CREATE UNIQUE INDEX "challenge_participants_challenge_id_contributor_id_key" ON "challenge_participants"("challenge_id", "contributor_id");

-- CreateIndex
CREATE INDEX "completed_challenges_contributor_id_completed_at_idx" ON "completed_challenges"("contributor_id", "completed_at");

-- CreateIndex
CREATE UNIQUE INDEX "users_github_id_key" ON "users"("github_id");

-- CreateIndex
CREATE INDEX "users_github_id_idx" ON "users"("github_id");

-- CreateIndex
CREATE UNIQUE INDEX "pr_metadata_repo_owner_repo_name_key" ON "pr_metadata"("repo_owner", "repo_name");

-- CreateIndex
CREATE UNIQUE INDEX "quarterly_winners_quarter_key" ON "quarterly_winners"("quarter");

-- CreateIndex
CREATE INDEX "quarterly_winners_year_quarter_number_idx" ON "quarterly_winners"("year" DESC, "quarter_number" DESC);

-- AddForeignKey
ALTER TABLE "contributions" ADD CONSTRAINT "contributions_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "contributors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "contributors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_history" ADD CONSTRAINT "point_history_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "contributors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "achievements" ADD CONSTRAINT "achievements_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "contributors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processed_prs" ADD CONSTRAINT "processed_prs_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "contributors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processed_reviews" ADD CONSTRAINT "processed_reviews_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "contributors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_challenge_id_fkey" FOREIGN KEY ("challenge_id") REFERENCES "challenges"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "challenge_participants" ADD CONSTRAINT "challenge_participants_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "contributors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "completed_challenges" ADD CONSTRAINT "completed_challenges_contributor_id_fkey" FOREIGN KEY ("contributor_id") REFERENCES "contributors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
