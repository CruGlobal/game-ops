import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
  initializeDatabaseController,
  fetchPRs,
  awardContributorBadges,
  awardBillsAndVonettesController,
  topContributors,
  topReviewers
} from '../../controllers/contributorController.js';
import { login } from '../../controllers/authController.js';
import Contributor from '../../models/contributor.js';
import { createTestContributor } from '../setup.js';

describe.skip('Controllers', () => {
  let mockReq, mockRes;

  beforeEach(async () => {
    await Contributor.deleteMany({});
    
    // Create mock request and response objects
    mockReq = {
      query: {},
      body: {},
      user: { username: 'testuser' }
    };
    
    mockRes = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      text: ''
    };
  });

  describe('initializeDatabaseController', () => {
    it('should initialize database successfully', async () => {
      contributorService.initializeDatabase.mockResolvedValue('Database initialized successfully.');

      await initializeDatabaseController(mockReq, mockRes);

      expect(contributorService.initializeDatabase).toHaveBeenCalledTimes(1);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith('Database initialized successfully.');
    });

    it('should handle initialization errors', async () => {
      contributorService.initializeDatabase.mockRejectedValue(new Error('Database error'));

      await initializeDatabaseController(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith('Error initializing database.');
    });
  });

  describe('fetchPRs', () => {
    it('should fetch pull requests successfully', async () => {
      contributorService.fetchPullRequests.mockResolvedValue();

      await fetchPRs(mockReq, mockRes);

      expect(contributorService.fetchPullRequests).toHaveBeenCalledTimes(1);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith('Pull requests fetched and data updated.');
    });

    it('should handle fetch errors', async () => {
      contributorService.fetchPullRequests.mockRejectedValue(new Error('GitHub API error'));

      await fetchPRs(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.send).toHaveBeenCalledWith('Error fetching pull requests.');
    });
  });

  describe('awardContributorBadges', () => {
    it('should award badges successfully', async () => {
      const mockResults = [
        { username: 'user1', badge: '1st PR badge', badgeImage: '1st_pr_badge.png' }
      ];

      contributorService.awardBadges.mockResolvedValue(mockResults);
      mockReq.query = { pull_request_number: '123', test: 'false' };

      await awardContributorBadges(mockReq, mockRes);

      expect(contributorService.awardBadges).toHaveBeenCalledWith('123', false);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Badges awarded successfully.',
        results: mockResults
      });
    });

    it('should handle test mode correctly', async () => {
      contributorService.awardBadges.mockResolvedValue([]);
      mockReq.query = { test: 'true' };

      await awardContributorBadges(mockReq, mockRes);

      expect(contributorService.awardBadges).toHaveBeenCalledWith(undefined, true);
    });

    it('should handle badge awarding errors', async () => {
      contributorService.awardBadges.mockRejectedValue(new Error('Badge error'));

      await awardContributorBadges(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Error awarding badges.'
      });
    });
  });

  describe('awardBillsAndVonettesController', () => {
    it('should award bills and vonettes successfully', async () => {
      const mockResults = [
        { username: 'user1', bills: 'Bill', billsImage: '1_bill_57X27.png' }
      ];

      contributorService.awardBillsAndVonettes.mockResolvedValue(mockResults);
      mockReq.query = { pull_request_number: '456', test: 'true' };

      await awardBillsAndVonettesController(mockReq, mockRes);

      expect(contributorService.awardBillsAndVonettes).toHaveBeenCalledWith('456', true);
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Bills and Vonettes awarded successfully.',
        results: mockResults
      });
    });

    it('should handle bills awarding errors', async () => {
      contributorService.awardBillsAndVonettes.mockRejectedValue(new Error('Bills error'));

      await awardBillsAndVonettesController(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Error awarding Bills and Vonettes.'
      });
    });
  });

  describe('topContributors', () => {
    it('should return top contributors', async () => {
      const mockContributors = [
        createTestContributor({ username: 'user1', prCount: 10 }),
        createTestContributor({ username: 'user2', prCount: 5 })
      ];

      contributorService.getTopContributors.mockResolvedValue(mockContributors);

      await topContributors(mockReq, mockRes);

      expect(contributorService.getTopContributors).toHaveBeenCalledTimes(1);
      expect(mockRes.json).toHaveBeenCalledWith(mockContributors);
    });

    it('should handle errors when fetching contributors', async () => {
      contributorService.getTopContributors.mockRejectedValue(new Error('Database error'));

      await topContributors(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to fetch top contributors'
      });
    });
  });

  describe('topReviewers', () => {
    it('should return top reviewers', async () => {
      const mockReviewers = [
        createTestContributor({ username: 'reviewer1', reviewCount: 15 }),
        createTestContributor({ username: 'reviewer2', reviewCount: 8 })
      ];

      contributorService.getTopReviewers.mockResolvedValue(mockReviewers);

      await topReviewers(mockReq, mockRes);

      expect(contributorService.getTopReviewers).toHaveBeenCalledTimes(1);
      expect(mockRes.json).toHaveBeenCalledWith(mockReviewers);
    });

    it('should handle errors when fetching reviewers', async () => {
      contributorService.getTopReviewers.mockRejectedValue(new Error('Database error'));

      await topReviewers(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to fetch top reviewers'
      });
    });
  });

  describe('login (AuthController)', () => {
    it('should return JWT token for valid credentials', async () => {
      mockReq.body = {
        username: 'testadmin',
        password: 'testpassword'
      };

      await login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalled();
      
      // Verify that a token was returned
      const jsonCall = mockRes.json.mock.calls[0][0];
      expect(jsonCall.token).toBeDefined();
      expect(typeof jsonCall.token).toBe('string');
    });

    it('should return 401 for invalid credentials', async () => {
      mockReq.body = {
        username: 'testadmin',
        password: 'wrongpassword'
      };

      await login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Invalid credentials'
      });
    });

    it('should return 400 for missing credentials', async () => {
      mockReq.body = {
        username: 'testadmin'
        // Missing password
      };

      await login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Username and password are required'
      });
    });

    it('should return 400 for empty request body', async () => {
      mockReq.body = {};

      await login(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Username and password are required'
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      // Simulate an unexpected error in the service
      getTopContributors.mockImplementation(() => {
        throw new TypeError('Unexpected error');
      });

      await topContributors(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to fetch top contributors'
      });
    });
  });
});