-- scripts/init-postgres.sql
-- PostgreSQL initialization script for Game Ops
-- This script sets up extensions and initial configuration

-- ============================================
-- EXTENSIONS
-- ============================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enable pg_trgm for fuzzy text search
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Enable btree_gin for multi-column indexes
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- ============================================
-- CUSTOM TYPES
-- ============================================

-- Create enum types for better type safety
DO $$ BEGIN
    CREATE TYPE challenge_type AS ENUM (
        'pr-merge', 
        'review', 
        'streak', 
        'points', 
        'team', 
        'okr-label'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE challenge_status AS ENUM (
        'upcoming', 
        'active', 
        'completed', 
        'expired'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE challenge_difficulty AS ENUM (
        'easy', 
        'medium', 
        'hard'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE quarter_system_type AS ENUM (
        'calendar', 
        'fiscal-us', 
        'academic', 
        'custom'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to calculate streak from contributions
CREATE OR REPLACE FUNCTION calculate_current_streak(contributor_id TEXT)
RETURNS INTEGER AS $$
DECLARE
    streak INTEGER := 0;
    check_date DATE := CURRENT_DATE;
    found BOOLEAN;
BEGIN
    LOOP
        SELECT EXISTS(
            SELECT 1 FROM "Contribution"
            WHERE "contributorId" = contributor_id
            AND DATE(date) = check_date
        ) INTO found;
        
        IF NOT found THEN
            EXIT;
        END IF;
        
        streak := streak + 1;
        check_date := check_date - INTERVAL '1 day';
    END LOOP;
    
    RETURN streak;
END;
$$ LANGUAGE plpgsql;

-- Function to get current quarter string (e.g., "2025-Q1")
CREATE OR REPLACE FUNCTION get_current_quarter()
RETURNS TEXT AS $$
BEGIN
    RETURN TO_CHAR(CURRENT_DATE, 'YYYY') || '-Q' || TO_CHAR(CURRENT_DATE, 'Q');
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- INDEXES (after Prisma migration)
-- ============================================
-- Note: Most indexes are created by Prisma schema
-- These are additional performance indexes

-- GIN index for JSONB fields (badges, quarterlyStats)
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contributor_badges_gin
--     ON "Contributor" USING GIN (badges);

-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contributor_quarterly_stats_gin
--     ON "Contributor" USING GIN ("quarterlyStats");

-- Composite index for leaderboard queries
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contributor_leaderboard
--     ON "Contributor" ("totalPoints" DESC, username);

-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contributor_streak_leaderboard
--     ON "Contributor" ("currentStreak" DESC, username);

-- ============================================
-- MATERIALIZED VIEWS (Optional - for performance)
-- ============================================

-- Leaderboard materialized view for faster queries
-- CREATE MATERIALIZED VIEW IF NOT EXISTS mv_leaderboard AS
-- SELECT 
--     id,
--     username,
--     "avatarUrl" as avatar_url,
--     "prCount" as pr_count,
--     "reviewCount" as review_count,
--     "totalPoints" as total_points,
--     "currentStreak" as current_streak,
--     "longestStreak" as longest_streak,
--     badges,
--     "quarterlyStats" as quarterly_stats,
--     ROW_NUMBER() OVER (ORDER BY "totalPoints" DESC) as rank
-- FROM "Contributor"
-- WHERE username NOT LIKE '%[bot]%'
-- ORDER BY "totalPoints" DESC;

-- Create index on materialized view
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_leaderboard_username
--     ON mv_leaderboard(username);

-- Function to refresh leaderboard
-- CREATE OR REPLACE FUNCTION refresh_leaderboard()
-- RETURNS void AS $$
-- BEGIN
--     REFRESH MATERIALIZED VIEW CONCURRENTLY mv_leaderboard;
-- END;
-- $$ LANGUAGE plpgsql;

-- ============================================
-- GRANTS (Security)
-- ============================================

-- Grant appropriate permissions to app user
-- Note: In production, create separate user with limited permissions
-- CREATE USER scoreboard_app WITH PASSWORD 'your_secure_password';
-- GRANT CONNECT ON DATABASE game_ops TO scoreboard_app;
-- GRANT USAGE ON SCHEMA public TO scoreboard_app;
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO scoreboard_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO scoreboard_app;

-- ============================================
-- MONITORING & MAINTENANCE
-- ============================================

-- Enable auto-vacuum for better performance
ALTER DATABASE game_ops SET autovacuum = on;

-- Set statistics target higher for better query planning
ALTER DATABASE game_ops SET default_statistics_target = 100;

-- ============================================
-- INITIAL DATA (Optional)
-- ============================================

-- Insert default quarter settings (if table exists)
-- This will be handled by Prisma migration, but kept as reference
-- INSERT INTO "QuarterSettings" (id, "systemType", "q1StartMonth", "createdAt")
-- VALUES ('quarter-config', 'calendar', 1, CURRENT_TIMESTAMP)
-- ON CONFLICT (id) DO NOTHING;

-- ============================================
-- COMPLETION
-- ============================================

DO $$
BEGIN
    RAISE NOTICE 'PostgreSQL initialization completed successfully!';
    RAISE NOTICE 'Extensions enabled: uuid-ossp, pg_trgm, btree_gin';
    RAISE NOTICE 'Custom functions created: update_updated_at_column, calculate_current_streak, get_current_quarter';
    RAISE NOTICE 'Ready for Prisma migration!';
END $$;
