import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import Contributor from '../../models/contributor.js';
import QuarterSettings from '../../models/quarterSettings.js';
import QuarterlyWinner from '../../models/quarterlyWinner.js';
import { createTestContributor } from '../setup.js';

// Import routes
import contributorRoutes from '../../routes/contributorRoutes.js';

// Create test app
const app = express();
app.use(express.json());
app.use('/api', contributorRoutes);

describe('Quarterly API Endpoints', () => {
    beforeEach(async () => {
        await Contributor.deleteMany({});
        await QuarterSettings.deleteMany({});
        await QuarterlyWinner.deleteMany({});

        // Create default quarter config
        await QuarterSettings.create({
            _id: 'quarter-config',
            systemType: 'calendar',
            q1StartMonth: 1
        });
    });

    describe('GET /api/leaderboard/all-time', () => {
        it('should return all-time leaderboard sorted by total points', async () => {
            await Contributor.create([
                createTestContributor({
                    username: 'topuser',
                    totalPoints: 500,
                    prCount: 40,
                    reviewCount: 20
                }),
                createTestContributor({
                    username: 'seconduser',
                    totalPoints: 300,
                    prCount: 25,
                    reviewCount: 10
                }),
                createTestContributor({
                    username: 'thirduser',
                    totalPoints: 150,
                    prCount: 10,
                    reviewCount: 10
                })
            ]);

            const response = await request(app)
                .get('/api/leaderboard/all-time')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveLength(3);

            // Verify sorting by totalPoints descending
            expect(response.body.data[0].username).toBe('topuser');
            expect(response.body.data[0].totalPoints).toBe(500);
            expect(response.body.data[1].username).toBe('seconduser');
            expect(response.body.data[2].username).toBe('thirduser');
        });

        it('should include rank in response', async () => {
            await Contributor.create([
                createTestContributor({
                    username: 'first',
                    totalPoints: 1000
                }),
                createTestContributor({
                    username: 'second',
                    totalPoints: 500
                })
            ]);

            const response = await request(app)
                .get('/api/leaderboard/all-time')
                .expect(200);

            expect(response.body.data[0].rank).toBe(1);
            expect(response.body.data[1].rank).toBe(2);
        });

        it('should return empty array if no contributors', async () => {
            const response = await request(app)
                .get('/api/leaderboard/all-time')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toEqual([]);
        });
    });

    describe('GET /api/leaderboard/quarterly', () => {
        it('should return current quarter leaderboard sorted by quarterly points', async () => {
            await Contributor.create([
                createTestContributor({
                    username: 'user1',
                    totalPoints: 1000,
                    quarterlyStats: {
                        currentQuarter: '2025-Q1',
                        prsThisQuarter: 10,
                        reviewsThisQuarter: 5,
                        pointsThisQuarter: 125,
                        quarterStartDate: new Date('2025-01-01'),
                        quarterEndDate: new Date('2025-03-31')
                    }
                }),
                createTestContributor({
                    username: 'user2',
                    totalPoints: 500,
                    quarterlyStats: {
                        currentQuarter: '2025-Q1',
                        prsThisQuarter: 15,
                        reviewsThisQuarter: 8,
                        pointsThisQuarter: 190,
                        quarterStartDate: new Date('2025-01-01'),
                        quarterEndDate: new Date('2025-03-31')
                    }
                }),
                createTestContributor({
                    username: 'user3',
                    totalPoints: 300,
                    quarterlyStats: {
                        currentQuarter: '2025-Q1',
                        prsThisQuarter: 5,
                        reviewsThisQuarter: 3,
                        pointsThisQuarter: 65,
                        quarterStartDate: new Date('2025-01-01'),
                        quarterEndDate: new Date('2025-03-31')
                    }
                })
            ]);

            const response = await request(app)
                .get('/api/leaderboard/quarterly')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveLength(3);

            // Verify sorting by pointsThisQuarter descending
            expect(response.body.data[0].username).toBe('user2');
            expect(response.body.data[0].pointsThisQuarter).toBe(190);
            expect(response.body.data[1].username).toBe('user1');
            expect(response.body.data[1].pointsThisQuarter).toBe(125);
            expect(response.body.data[2].username).toBe('user3');
        });

        it('should include quarter info in response', async () => {
            await Contributor.create(
                createTestContributor({
                    username: 'testuser',
                    quarterlyStats: {
                        currentQuarter: '2025-Q1',
                        pointsThisQuarter: 100,
                        quarterStartDate: new Date('2025-01-01'),
                        quarterEndDate: new Date('2025-03-31')
                    }
                })
            );

            const response = await request(app)
                .get('/api/leaderboard/quarterly')
                .expect(200);

            expect(response.body.quarter).toBeDefined();
            expect(response.body.quarterStart).toBeDefined();
            expect(response.body.quarterEnd).toBeDefined();
        });

        it('should only include contributors with quarterly points > 0', async () => {
            await Contributor.create([
                createTestContributor({
                    username: 'active',
                    quarterlyStats: {
                        currentQuarter: '2025-Q1',
                        pointsThisQuarter: 50
                    }
                }),
                createTestContributor({
                    username: 'inactive',
                    quarterlyStats: {
                        currentQuarter: '2025-Q1',
                        pointsThisQuarter: 0
                    }
                })
            ]);

            const response = await request(app)
                .get('/api/leaderboard/quarterly')
                .expect(200);

            expect(response.body.data).toHaveLength(1);
            expect(response.body.data[0].username).toBe('active');
        });
    });

    describe('GET /api/leaderboard/quarterly/:quarter', () => {
        it('should return specific quarter leaderboard from Hall of Fame', async () => {
            await QuarterlyWinner.create({
                quarter: '2024-Q4',
                year: 2024,
                quarterNumber: 4,
                quarterStart: new Date('2024-10-01'),
                quarterEnd: new Date('2024-12-31'),
                winner: {
                    username: 'champion',
                    avatarUrl: 'https://github.com/champion.png',
                    prsThisQuarter: 20,
                    reviewsThisQuarter: 15,
                    pointsThisQuarter: 275
                },
                top3: [
                    {
                        rank: 1,
                        username: 'champion',
                        avatarUrl: 'https://github.com/champion.png',
                        prsThisQuarter: 20,
                        reviewsThisQuarter: 15,
                        pointsThisQuarter: 275
                    },
                    {
                        rank: 2,
                        username: 'second',
                        avatarUrl: 'https://github.com/second.png',
                        prsThisQuarter: 15,
                        reviewsThisQuarter: 10,
                        pointsThisQuarter: 200
                    },
                    {
                        rank: 3,
                        username: 'third',
                        avatarUrl: 'https://github.com/third.png',
                        prsThisQuarter: 10,
                        reviewsThisQuarter: 8,
                        pointsThisQuarter: 140
                    }
                ],
                totalParticipants: 15
            });

            const response = await request(app)
                .get('/api/leaderboard/quarterly/2024-Q4')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.quarter).toBe('2024-Q4');
            expect(response.body.data).toHaveLength(3);
            expect(response.body.data[0].username).toBe('champion');
            expect(response.body.totalParticipants).toBe(15);
        });

        it('should return 404 if quarter not found', async () => {
            const response = await request(app)
                .get('/api/leaderboard/quarterly/2020-Q1')
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('not found');
        });

        it('should validate quarter format', async () => {
            const response = await request(app)
                .get('/api/leaderboard/quarterly/invalid')
                .expect(400);

            expect(response.body.success).toBe(false);
        });
    });

    describe('GET /api/leaderboard/hall-of-fame', () => {
        it('should return all archived quarterly winners', async () => {
            await QuarterlyWinner.create([
                {
                    quarter: '2025-Q1',
                    year: 2025,
                    quarterNumber: 1,
                    quarterStart: new Date('2025-01-01'),
                    quarterEnd: new Date('2025-03-31'),
                    winner: {
                        username: 'user1',
                        pointsThisQuarter: 300
                    },
                    top3: [],
                    totalParticipants: 10
                },
                {
                    quarter: '2024-Q4',
                    year: 2024,
                    quarterNumber: 4,
                    quarterStart: new Date('2024-10-01'),
                    quarterEnd: new Date('2024-12-31'),
                    winner: {
                        username: 'user2',
                        pointsThisQuarter: 250
                    },
                    top3: [],
                    totalParticipants: 12
                },
                {
                    quarter: '2024-Q3',
                    year: 2024,
                    quarterNumber: 3,
                    quarterStart: new Date('2024-07-01'),
                    quarterEnd: new Date('2024-09-30'),
                    winner: {
                        username: 'user3',
                        pointsThisQuarter: 280
                    },
                    top3: [],
                    totalParticipants: 8
                }
            ]);

            const response = await request(app)
                .get('/api/leaderboard/hall-of-fame')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toHaveLength(3);

            // Verify sorted by quarter descending (newest first)
            expect(response.body.data[0].quarter).toBe('2025-Q1');
            expect(response.body.data[1].quarter).toBe('2024-Q4');
            expect(response.body.data[2].quarter).toBe('2024-Q3');
        });

        it('should include top 3 and participant count', async () => {
            await QuarterlyWinner.create({
                quarter: '2025-Q1',
                year: 2025,
                quarterNumber: 1,
                quarterStart: new Date('2025-01-01'),
                quarterEnd: new Date('2025-03-31'),
                winner: {
                    username: 'champion',
                    pointsThisQuarter: 300
                },
                top3: [
                    { rank: 1, username: 'champion', pointsThisQuarter: 300 },
                    { rank: 2, username: 'second', pointsThisQuarter: 200 },
                    { rank: 3, username: 'third', pointsThisQuarter: 150 }
                ],
                totalParticipants: 25
            });

            const response = await request(app)
                .get('/api/leaderboard/hall-of-fame')
                .expect(200);

            expect(response.body.data[0].top3).toHaveLength(3);
            expect(response.body.data[0].totalParticipants).toBe(25);
        });

        it('should return empty array if no winners archived', async () => {
            const response = await request(app)
                .get('/api/leaderboard/hall-of-fame')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toEqual([]);
        });
    });

    describe('GET /api/admin/quarter-config', () => {
        it('should return current quarter configuration', async () => {
            await QuarterSettings.findOneAndUpdate(
                { _id: 'quarter-config' },
                {
                    systemType: 'fiscal-us',
                    q1StartMonth: 10
                },
                { upsert: true }
            );

            const response = await request(app)
                .get('/api/admin/quarter-config')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.config.systemType).toBe('fiscal-us');
            expect(response.body.config.q1StartMonth).toBe(10);
            expect(response.body.currentQuarter).toBeDefined();
        });

        it('should return default config if none exists', async () => {
            await QuarterSettings.deleteMany({});

            const response = await request(app)
                .get('/api/admin/quarter-config')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.config.systemType).toBe('calendar');
            expect(response.body.config.q1StartMonth).toBe(1);
        });
    });

    describe('POST /api/admin/quarter-config', () => {
        it('should update quarter configuration', async () => {
            const response = await request(app)
                .post('/api/admin/quarter-config')
                .send({
                    systemType: 'academic',
                    q1StartMonth: 9
                })
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.config.systemType).toBe('academic');
            expect(response.body.config.q1StartMonth).toBe(9);

            // Verify saved to database
            const config = await QuarterSettings.findById('quarter-config');
            expect(config.systemType).toBe('academic');
            expect(config.q1StartMonth).toBe(9);
        });

        it('should validate system type', async () => {
            const response = await request(app)
                .post('/api/admin/quarter-config')
                .send({
                    systemType: 'invalid',
                    q1StartMonth: 1
                })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('Invalid system type');
        });

        it('should validate q1StartMonth range', async () => {
            const response = await request(app)
                .post('/api/admin/quarter-config')
                .send({
                    systemType: 'calendar',
                    q1StartMonth: 13
                })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.message).toContain('must be between 1 and 12');
        });

        it('should trigger quarter reset if quarter changed', async () => {
            // beforeEach already creates default config with calendar/January
            // Create contributors with current stats
            await Contributor.create(
                createTestContributor({
                    username: 'testuser',
                    quarterlyStats: {
                        currentQuarter: '2025-Q1',
                        pointsThisQuarter: 100
                    }
                })
            );

            // Change to fiscal year (Q1 in October)
            const response = await request(app)
                .post('/api/admin/quarter-config')
                .send({
                    systemType: 'fiscal-us',
                    q1StartMonth: 10
                })
                .expect(200);

            expect(response.body.quarterChanged).toBeDefined();
        });
    });
});
