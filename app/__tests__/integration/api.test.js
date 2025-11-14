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

  describe('POST /api/admin/login', () => {
    it('should return JWT token for valid credentials', async () => {
      const response = await request(app)
        .post('/api/admin/login')
        .send({
          username: 'testadmin',
          password: 'testpassword'
        })
        .expect(200);

      expect(response.body.token).toBeDefined();
      
      // Verify the token is valid
      const decoded = jwt.verify(response.body.token, process.env.JWT_SECRET);
      expect(decoded.username).toBe('testadmin');
    });

    it('should return 401 for invalid credentials', async () => {
      const response = await request(app)
        .post('/api/admin/login')
        .send({
          username: 'testadmin',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body.message).toBe('Invalid credentials');
    });

    it('should return 400 for missing credentials', async () => {
      const response = await request(app)
        .post('/api/admin/login')
        .send({
          username: 'testadmin'
          // Missing password
        })
        .expect(400);

      expect(response.body.message).toBe('Username and password are required');
    });
  });

  describe('GET /api/initialize-database', () => {
    it('should initialize database with valid token', async () => {
      const response = await request(app)
        .get('/api/initialize-database')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.text).toBe('Database initialized successfully.');
    });

    it('should return 401 without authentication token', async () => {
      const response = await request(app)
        .get('/api/initialize-database')
        .expect(401);

      expect(response.body.message).toBe('Access denied. No token provided.');
    });

    it('should return 403 with invalid token', async () => {
      const response = await request(app)
        .get('/api/initialize-database')
        .set('Authorization', 'Bearer invalid-token')
        .expect(403);

      expect(response.body.message).toBe('Invalid token.');
    });
  });

  describe('GET /api/fetch-pull-requests', () => {
    it('should fetch pull requests with valid token', async () => {
      // Mock GitHub API responses
      mockGitHubApi.teamMembers([
        { login: 'testuser', id: 123 }
      ]);
      
      mockGitHubApi.pullRequests([
        {
          id: 1,
          number: 1,
          title: 'Test PR',
          state: 'closed',
          merged_at: '2025-01-01T12:00:00Z',
          user: { login: 'testuser', id: 123, avatar_url: 'https://github.com/testuser.png' }
        }
      ]);

      mockGitHubApi.pullRequestReviews(1, []);

      const response = await request(app)
        .get('/api/fetch-pull-requests')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.text).toBe('Pull requests fetched and data updated.');
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/api/fetch-pull-requests')
        .expect(401);

      expect(response.body.message).toBe('Access denied. No token provided.');
    });
  });

  describe('GET /api/award-badges', () => {
    it('should award badges with valid token', async () => {
      // Create test contributor
      await prisma.contributor.create({
        data: createTestContributor({ 
          username: 'newuser', 
          prCount: BigInt(1), 
          badges: [] 
        })
      });

      const response = await request(app)
        .get('/api/award-badges')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).toBe('Badges awarded successfully.');
      expect(response.body.results).toHaveLength(1);
      expect(response.body.results[0].username).toBe('newuser');
      expect(response.body.results[0].badge).toBe('1st PR badge');
    });
  });

  describe('GET /api/award-bills-vonettes', () => {
    it('should award bills with valid token', async () => {
      await prisma.contributor.create({
        data: createTestContributor({ 
          username: 'productive', 
          prCount: BigInt(10),
          totalBillsAwarded: BigInt(0),
          first10PrsAwarded: false
        })
      });

      const response = await request(app)
        .get('/api/award-bills-vonettes')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.message).toBe('Bills and Vonettes awarded successfully.');
      expect(response.body.results).toHaveLength(1);
      expect(response.body.results[0].username).toBe('productive');
      expect(response.body.results[0].bills).toBe('Bill');
    });
  });

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