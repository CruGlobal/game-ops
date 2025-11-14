// migrate-mongo-to-postgres.js
// Full migration script: MongoDB (Mongoose) → PostgreSQL (Prisma)
// Usage: node app/scripts/migrate-mongo-to-postgres.js

import mongoose from 'mongoose';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
// Resolve project root .env regardless of where this script is run from
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../../');
dotenv.config({ path: path.join(projectRoot, '.env') });

// Echo the URIs being used for quick debugging
console.log('[env] MONGO_URI =', process.env.MONGO_URI);
console.log('[env] DATABASE_URL =', process.env.DATABASE_URL ? 'set' : 'NOT SET');

// Import Mongoose models
import Contributor from '../models/contributor.js';
import Challenge from '../models/challenge.js';
import User from '../models/user.js';
import PRMetadata from '../models/prMetadata.js';
import QuarterSettings from '../models/quarterSettings.js';
import QuarterlyWinner from '../models/quarterlyWinner.js';
import FetchDate from '../models/fetchDate.js';

const prisma = new PrismaClient();

async function migrateContributors() {
  console.log('Migrating Contributors...');
  const contributors = await Contributor.find().lean();
  for (const c of contributors) {
    try {
      await prisma.contributor.upsert({
        where: { username: c.username },
        update: {}, // Optionally update fields if needed
        create: {
          username: c.username,
          prCount: c.prCount || 0,
          reviewCount: c.reviewCount || 0,
          avatarUrl: c.avatarUrl,
          lastUpdated: c.lastUpdated,
          badges: c.badges || [],
          totalBillsAwarded: c.totalBillsAwarded || 0,
          currentStreak: c.currentStreak || 0,
          lastContributionDate: c.lastContributionDate,
          longestStreak: c.longestStreak || 0,
          totalPoints: c.totalPoints || 0,
          quarterlyStats: c.quarterlyStats || {},
          sevenDayBadge: c.streakBadges?.sevenDay || false,
          thirtyDayBadge: c.streakBadges?.thirtyDay || false,
          ninetyDayBadge: c.streakBadges?.ninetyDay || false,
          yearLongBadge: c.streakBadges?.yearLong || false,
          contributions: {
            create: (c.contributions || []).map(contrib => ({
              date: contrib.date,
              count: contrib.count,
              merged: contrib.merged || false
            }))
          },
          reviews: {
            create: (c.reviews || []).map(r => ({
              date: r.date,
              count: r.count
            }))
          },
          pointsHistory: {
            create: (c.pointsHistory || []).map(p => ({
              points: p.points,
              reason: p.reason,
              prNumber: p.prNumber,
              timestamp: p.timestamp
            }))
          },
          achievements: {
            create: (c.achievements || []).map(a => ({
              achievementId: a.achievementId,
              name: a.name,
              description: a.description,
              earnedAt: a.earnedAt,
              category: a.category
            }))
          },
          processedPRs: {
            create: (c.processedPRs || []).map(pr => ({
              prNumber: pr.prNumber,
              prTitle: pr.prTitle,
              processedDate: pr.processedDate,
              action: pr.action
            }))
          },
          processedReviews: {
            create: (c.processedReviews || []).map(r => ({
              prNumber: r.prNumber,
              reviewId: r.reviewId,
              processedDate: r.processedDate
            }))
          },
          activeChallenges: {
            create: (c.activeChallenges || []).map(ac => ({
              challengeId: ac.challengeId?.toString() || '',
              progress: ac.progress,
              target: ac.target,
              joinedAt: ac.joined
            }))
          },
          completedChallenges: {
            create: (c.completedChallenges || []).map(cc => ({
              challengeId: cc.challengeId?.toString() || '',
              completedAt: cc.completedAt,
              reward: cc.reward
            }))
          }
        }
      });
    } catch (err) {
      console.error('Contributor migration error:', err, c.username);
    }
  }
  console.log(`Migrated ${contributors.length} contributors.`);
}

async function migrateChallenges() {
  console.log('Migrating Challenges...');
  const challenges = await Challenge.find().lean();
  for (const c of challenges) {
    try {
      await prisma.challenge.create({
        data: {
          title: c.title,
          description: c.description,
          type: c.type,
          target: c.target,
          reward: c.reward,
          startDate: c.startDate,
          endDate: c.endDate,
          status: c.status,
          difficulty: c.difficulty,
          category: c.category,
          labelFilters: c.labelFilters || [],
          okrMetadata: c.okrMetadata || {},
          participants: {
            create: (c.participants || []).map(p => ({
              username: p.username,
              progress: p.progress,
              completed: p.completed,
              joinedAt: p.joinedAt
            }))
          }
        }
      });
    } catch (err) {
      console.error('Challenge migration error:', err, c.title);
    }
  }
  console.log(`Migrated ${challenges.length} challenges.`);
}

async function migrateUsers() {
  console.log('Migrating Users...');
  const users = await User.find().lean();
  for (const u of users) {
    try {
      await prisma.user.upsert({
        where: { githubId: u.githubId },
        update: {}, // Optionally update fields if needed
        create: {
          githubId: u.githubId,
          username: u.username
        }
      });
    } catch (err) {
      console.error('User migration error:', err, u.githubId);
    }
  }
  console.log(`Migrated ${users.length} users.`);
}

async function migratePRMetadata() {
  console.log('Migrating PRMetadata...');
  const prMetas = await PRMetadata.find().lean();
  for (const m of prMetas) {
    try {
      await prisma.pRMetadata.create({
        data: {
          repoOwner: m.repoOwner,
          repoName: m.repoName,
          firstPRFetched: m.firstPRFetched,
          latestPRFetched: m.latestPRFetched,
          totalPRsInDB: m.totalPRsInDB,
          dateRangeStart: m.dateRangeStart,
          dateRangeEnd: m.dateRangeEnd,
          lastFetchDate: m.lastFetchDate,
          fetchHistory: m.fetchHistory || []
        }
      });
    } catch (err) {
      console.error('PRMetadata migration error:', err, m.repoName);
    }
  }
  console.log(`Migrated ${prMetas.length} PRMetadata records.`);
}

async function migrateQuarterSettings() {
  console.log('Migrating QuarterSettings...');
  const settings = await QuarterSettings.find().lean();
  for (const s of settings) {
    try {
      await prisma.quarterSettings.create({
        data: {
          id: s._id || 'quarter-config',
          systemType: s.systemType,
          q1StartMonth: s.q1StartMonth,
          customQuarters: s.customQuarters || [],
          lastModified: s.lastModified,
          modifiedBy: s.modifiedBy
        }
      });
    } catch (err) {
      // Provide actionable hint if table missing (migrations not applied)
      if (err?.code === 'P2021') {
        console.error('\n[Hint] Prisma table missing. Did you run `npx prisma migrate dev --schema=app/prisma/schema.prisma`?');
      }
      console.error('QuarterSettings migration error:', err, s._id);
    }
  }
  console.log(`Migrated ${settings.length} quarter settings.`);
}

async function migrateQuarterlyWinners() {
  console.log('Migrating QuarterlyWinners...');
  const winners = await QuarterlyWinner.find().lean();
  for (const w of winners) {
    try {
      await prisma.quarterlyWinner.create({
        data: {
          quarter: w.quarter,
          year: w.year,
          quarterNumber: w.quarterNumber,
          quarterStart: w.quarterStart,
          quarterEnd: w.quarterEnd,
          winner: w.winner || {},
          top3: w.top3 || [],
          totalParticipants: w.totalParticipants,
          archivedDate: w.archivedDate
        }
      });
    } catch (err) {
      console.error('QuarterlyWinner migration error:', err, w.quarter);
    }
  }
  console.log(`Migrated ${winners.length} quarterly winners.`);
}

async function migrateFetchDates() {
  console.log('Migrating FetchDates...');
  const fetchDates = await FetchDate.find().lean();
  for (const f of fetchDates) {
    try {
      await prisma.fetchDate.create({
        data: {
          date: f.date
        }
      });
    } catch (err) {
      console.error('FetchDate migration error:', err, f.date);
    }
  }
  console.log(`Migrated ${fetchDates.length} fetch dates.`);
}

async function main() {
  try {
    // Pre-flight sanity
    if (!process.env.MONGO_URI) {
      throw new Error('MONGO_URI is not set. Check your .env at project root.');
    }
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set. Check your .env at project root.');
    }

    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('Connected to MongoDB');

    // Log counts to confirm data presence
    const [cCount, chCount, uCount, mCount, qsCount, qwCount, fCount] = await Promise.all([
      Contributor.countDocuments(),
      Challenge.countDocuments(),
      User.countDocuments(),
      PRMetadata.countDocuments(),
      QuarterSettings.countDocuments(),
      QuarterlyWinner.countDocuments(),
      FetchDate.countDocuments(),
    ]);
    console.log(`[Mongo Counts] contributors=${cCount}, challenges=${chCount}, users=${uCount}, prMetadata=${mCount}, quarterSettings=${qsCount}, quarterlyWinners=${qwCount}, fetchDates=${fCount}`);

  // Execute migrations in an order that respects FK dependencies
  await migrateContributors();
  await migrateChallenges();
  await migrateUsers();
  await migratePRMetadata();
  await migrateQuarterSettings();
  await migrateQuarterlyWinners();
  await migrateFetchDates();

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    await prisma.$disconnect();
  }
}

main();
