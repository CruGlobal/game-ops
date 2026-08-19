import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import contributorRoutes from '../../routes/contributorRoutes.js';
import { prisma } from '../../lib/prisma.js';
import { createTestContributor, mockGitHubApi } from '../setup.js';
import jwt from 'jsonwebtoken';

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api', contributorRoutes);
  return app;
};

describe('API Integration Tests', () => {
  let app;
  let authToken;

  beforeAll(() => {
    app = createTestApp();
    
    // Create a test authentication token
    authToken = jwt.sign(
      { username: 'testadmin' }, 
      process.env.JWT_SECRET, 
      { expiresIn: '1h' }
    );
  });

  beforeEach(async () => {
    // Clean up database before each test
    await prisma.processedPR.deleteMany({});
    await prisma.processedReview.deleteMany({});
    await prisma.contributor.deleteMany({});
  });

  afterEach(async () => {
    // Clean up after each test
    await prisma.processedPR.deleteMany({});
    await prisma.processedReview.deleteMany({});
    await prisma.contributor.deleteMany({});
  });

  afterAll(async () => {
    // Disconnect Prisma to allow Jest to exit
    await prisma.$disconnect();
  });

  describe('GET /api/top-contributors', () => {
    it('should return top contributors successfully', async () => {
      // Create test data
      await prisma.contributor.createMany({
        data: [
          createTestContributor({ username: 'user1', prCount: BigInt(10) }),
          createTestContributor({ username: 'user2', prCount: BigInt(15) }),
          createTestContributor({ username: 'bot[bot]', prCount: BigInt(20) }) // Should be filtered out
        ]
      });

      const response = await request(app)
        .get('/api/top-contributors')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].username).toBe('user2');
      expect(response.body[0].prCount).toBe(15);
      expect(response.body[1].username).toBe('user1');
      expect(response.body[1].prCount).toBe(10);
    });

    it('should return empty array when no contributors exist', async () => {
      const response = await request(app)
        .get('/api/top-contributors')
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('GET /api/top-reviewers', () => {
    it('should return top reviewers successfully', async () => {
      await prisma.contributor.createMany({
        data: [
          createTestContributor({ username: 'reviewer1', reviewCount: BigInt(5) }),
          createTestContributor({ username: 'reviewer2', reviewCount: BigInt(10) })
        ]
      });

      const response = await request(app)
        .get('/api/top-reviewers')
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].username).toBe('reviewer2');
      expect(response.body[0].reviewCount).toBe(10);
    });
  });

  describe('GET /api/top-contributors-date-range', () => {
    it('should return contributors within date range', async () => {
      // Use dates relative to now to ensure they're within the range
      const now = new Date();
      const fiveDaysAgo = new Date(now);
      fiveDaysAgo.setDate(now.getDate() - 5);
      const tenDaysAgo = new Date(now);
      tenDaysAgo.setDate(now.getDate() - 10);

      const contributor = createTestContributor({
        username: 'activeuser',
        contributions: [
          {
            date: fiveDaysAgo,
            count: 2,
            merged: true
          },
          {
            date: tenDaysAgo,
            count: 1,
            merged: true
          }
        ]
      });

      await prisma.contributor.create({ data: contributor });

      const response = await request(app)
        .get('/api/top-contributors-date-range?range=30')
        .expect(200);

      expect(response.body.contributors).toHaveLength(1);
      expect(response.body.contributors[0].username).toBe('activeuser');
      expect(response.body.contributors[0].totalPrCount).toBe(3); // 2 + 1
    });

    it('should return error when range parameter is missing', async () => {
      const response = await request(app)
        .get('/api/top-contributors-date-range')
        .expect(400);

      expect(response.body.error).toBe('Range parameter is required');
    });
  });

  // The JWT/password admin-login subsystem and its four guarded endpoints
  // (/api/admin/login, /initialize-database, /fetch-pull-requests, /award-badges,
  // /award-bills-vonettes) were removed: unauthenticatable in production, zero
  // traffic, and the only caller was this test file.

  describe('GET /api/admin/contributors', () => {
    it('should return all contributors for admin', async () => {
      await prisma.contributor.createMany({
        data: [
          createTestContributor({ username: 'user1' }),
          createTestContributor({ username: 'user2' })
        ]
      });

      const response = await request(app)
        .get('/api/admin/contributors')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toHaveLength(2);
      expect(response.body[0].username).toBeDefined();
      expect(response.body[1].username).toBeDefined();
    });
  });

  describe('GET /api/badges', () => {
    it('should return list of available badges', async () => {
      const response = await request(app)
        .get('/api/badges')
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      // Note: This test may fail if the badges directory doesn't exist
      // In a real scenario, you'd mock the fs operations
    });
  });

  describe('GET /api/auth/status', () => {
    it('should return authentication status', async () => {
      const response = await request(app)
        .get('/api/auth/status')
        .expect(200);

      expect(response.body.isAuthenticated).toBe(false);
    });
  });
});