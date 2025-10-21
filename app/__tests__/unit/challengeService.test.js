// @ts-nocheck
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import {
    createChallenge,
    getActiveChallenges,
    getChallengeById,
    joinChallenge,
    updateChallengeProgress,
    completeChallenge,
    getUserChallenges,
    generateWeeklyChallenges,
    checkExpiredChallenges,
    getChallengeLeaderboard
} from '../../services/challengeService.js';
import { prisma, createTestContributor } from '../setup.js';

// Note: Socket emitter and logger are not mocked in this test file
// These services will use their real implementations during tests

describe('ChallengeService', () => {
    beforeEach(async () => {
        await prisma.challenge.deleteMany({});
        await prisma.contributor.deleteMany({});
    });

    describe.skip('createChallenge', () => {
        it('should create a new challenge successfully', async () => {
            const challengeData = {
                title: 'Test Challenge',
                description: 'Complete 5 PRs',
                type: 'pr-merge',
                target: 5,
                reward: 250,
                status: 'active',
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                difficulty: 'medium',
                category: 'individual'
            };

            const challenge = await createChallenge(challengeData);

            expect(challenge).toBeDefined();
            expect(challenge.title).toBe('Test Challenge');
            expect(challenge.type).toBe('pr-merge');
            expect(challenge.target).toBe(5);
            expect(challenge.reward).toBe(250);

            const saved = await Challenge.findById(challenge._id);
            expect(saved).toBeDefined();
        });

        it('should throw error for invalid challenge data', async () => {
            const invalidData = {
                // Missing required fields
                title: 'Incomplete Challenge'
            };

            await expect(createChallenge(invalidData)).rejects.toThrow();
        });
    });

    describe.skip('getActiveChallenges', () => {
        it('should return only active challenges with future end dates', async () => {
            const now = new Date();
            const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            const past = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

            await Challenge.create([
                {
                    title: 'Active Challenge 1',
                    description: 'Test',
                    type: 'pr-merge',
                    target: 5,
                    reward: 100,
                    status: 'active',
                    startDate: now,
                    endDate: future,
                    difficulty: 'easy',
                    category: 'individual'
                },
                {
                    title: 'Expired Challenge',
                    description: 'Test',
                    type: 'pr-merge',
                    target: 5,
                    reward: 100,
                    status: 'active',
                    startDate: past,
                    endDate: past,
                    difficulty: 'easy',
                    category: 'individual'
                },
                {
                    title: 'Inactive Challenge',
                    description: 'Test',
                    type: 'pr-merge',
                    target: 5,
                    reward: 100,
                    status: 'expired',
                    startDate: now,
                    endDate: future,
                    difficulty: 'easy',
                    category: 'individual'
                }
            ]);

            const active = await getActiveChallenges();

            expect(active).toHaveLength(1);
            expect(active[0].title).toBe('Active Challenge 1');
        });

        it('should return challenges sorted by start date descending', async () => {
            const now = new Date();
            const older = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

            await Challenge.create([
                {
                    title: 'Newer Challenge',
                    description: 'Test',
                    type: 'pr-merge',
                    target: 5,
                    reward: 100,
                    status: 'active',
                    startDate: now,
                    endDate: future,
                    difficulty: 'easy',
                    category: 'individual'
                },
                {
                    title: 'Older Challenge',
                    description: 'Test',
                    type: 'pr-merge',
                    target: 5,
                    reward: 100,
                    status: 'active',
                    startDate: older,
                    endDate: future,
                    difficulty: 'easy',
                    category: 'individual'
                }
            ]);

            const challenges = await getActiveChallenges();

            expect(challenges[0].title).toBe('Newer Challenge');
            expect(challenges[1].title).toBe('Older Challenge');
        });
    });

    describe.skip('getChallengeById', () => {
        it('should return challenge for valid ID', async () => {
            const challenge = await Challenge.create({
                title: 'Find Me',
                description: 'Test',
                type: 'pr-merge',
                target: 5,
                reward: 100,
                status: 'active',
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                difficulty: 'easy',
                category: 'individual'
            });

            const found = await getChallengeById(challenge._id);

            expect(found).toBeDefined();
            expect(found.title).toBe('Find Me');
        });

        it('should throw error for non-existent challenge', async () => {
            const fakeId = '507f1f77bcf86cd799439011';

            await expect(getChallengeById(fakeId)).rejects.toThrow('Challenge not found');
        });
    });

    describe.skip('joinChallenge', () => {
        it('should allow contributor to join active challenge', async () => {
            const contributor = await Contributor.create(
                createTestContributor({ username: 'joiner' })
            );

            const challenge = await Challenge.create({
                title: 'Join Me',
                description: 'Test',
                type: 'pr-merge',
                target: 5,
                reward: 250,
                status: 'active',
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                difficulty: 'medium',
                category: 'individual'
            });

            const result = await joinChallenge('joiner', challenge._id);

            expect(result.challenge).toBeDefined();
            expect(result.contributor).toBeDefined();

            // Verify challenge has participant
            const updatedChallenge = await Challenge.findById(challenge._id);
            expect(updatedChallenge.participants).toHaveLength(1);
            expect(updatedChallenge.participants[0].username).toBe('joiner');
            expect(updatedChallenge.participants[0].progress).toBe(0);

            // Verify contributor has active challenge
            const updatedContributor = await Contributor.findOne({ username: 'joiner' });
            expect(updatedContributor.activeChallenges).toHaveLength(1);
            expect(updatedContributor.activeChallenges[0].target).toBe(5);
        });

        it('should throw error if contributor does not exist', async () => {
            const challenge = await Challenge.create({
                title: 'Join Me',
                description: 'Test',
                type: 'pr-merge',
                target: 5,
                reward: 250,
                status: 'active',
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                difficulty: 'medium',
                category: 'individual'
            });

            await expect(joinChallenge('nonexistent', challenge._id)).rejects.toThrow(
                'Contributor not found'
            );
        });

        it('should throw error if already joined', async () => {
            const contributor = await Contributor.create(
                createTestContributor({ username: 'alreadyJoined' })
            );

            const challenge = await Challenge.create({
                title: 'Already Joined',
                description: 'Test',
                type: 'pr-merge',
                target: 5,
                reward: 250,
                status: 'active',
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                difficulty: 'medium',
                category: 'individual'
            });

            await joinChallenge('alreadyJoined', challenge._id);

            await expect(joinChallenge('alreadyJoined', challenge._id)).rejects.toThrow(
                'Already joined this challenge'
            );
        });

        it('should throw error if challenge is not active', async () => {
            const contributor = await Contributor.create(
                createTestContributor({ username: 'lateJoiner' })
            );

            const challenge = await Challenge.create({
                title: 'Expired',
                description: 'Test',
                type: 'pr-merge',
                target: 5,
                reward: 250,
                status: 'expired',
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                difficulty: 'medium',
                category: 'individual'
            });

            await expect(joinChallenge('lateJoiner', challenge._id)).rejects.toThrow(
                'Challenge is not active'
            );
        });
    });

    describe.skip('updateChallengeProgress', () => {
        it('should update progress for participant', async () => {
            const contributor = await Contributor.create(
                createTestContributor({ username: 'progressor' })
            );

            const challenge = await Challenge.create({
                title: 'Progress Test',
                description: 'Test',
                type: 'pr-merge',
                target: 10,
                reward: 250,
                status: 'active',
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                difficulty: 'medium',
                category: 'individual',
                participants: [{
                    username: 'progressor',
                    progress: 5,
                    completed: false,
                    joinedAt: new Date()
                }]
            });

            contributor.activeChallenges.push({
                challengeId: challenge._id,
                progress: 5,
                target: 10,
                joined: new Date()
            });
            await contributor.save();

            const result = await updateChallengeProgress('progressor', challenge._id, 2);

            expect(result.progress).toBe(7);
            expect(result.target).toBe(10);
            expect(result.completed).toBe(false);

            const updatedChallenge = await Challenge.findById(challenge._id);
            expect(updatedChallenge.participants[0].progress).toBe(7);
        });

        it('should mark challenge as completed when target reached', async () => {
            const contributor = await Contributor.create(
                createTestContributor({
                    username: 'completer',
                    totalPoints: 100
                })
            );

            const challenge = await Challenge.create({
                title: 'Complete Me',
                description: 'Test',
                type: 'pr-merge',
                target: 10,
                reward: 250,
                status: 'active',
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                difficulty: 'medium',
                category: 'individual',
                participants: [{
                    username: 'completer',
                    progress: 9,
                    completed: false,
                    joinedAt: new Date()
                }]
            });

            contributor.activeChallenges.push({
                challengeId: challenge._id,
                progress: 9,
                target: 10,
                joined: new Date()
            });
            await contributor.save();

            await updateChallengeProgress('completer', challenge._id, 1);

            const updatedChallenge = await Challenge.findById(challenge._id);
            expect(updatedChallenge.participants[0].progress).toBe(10);
            expect(updatedChallenge.participants[0].completed).toBe(true);

            // Check that contributor received points
            const updatedContributor = await Contributor.findOne({ username: 'completer' });
            expect(updatedContributor.totalPoints).toBe(350); // 100 + 250
            expect(updatedContributor.activeChallenges).toHaveLength(0);
            expect(updatedContributor.completedChallenges).toHaveLength(1);
        });

        it('should return null for non-existent challenge or contributor', async () => {
            const result = await updateChallengeProgress('nonexistent', 'fakeid', 1);

            expect(result).toBeNull();
        });
    });

    describe.skip('completeChallenge', () => {
        it('should award points and move challenge to completed', async () => {
            const contributor = await Contributor.create(
                createTestContributor({
                    username: 'winner',
                    totalPoints: 500
                })
            );

            const challenge = await Challenge.create({
                title: 'Completed Challenge',
                description: 'Test',
                type: 'pr-merge',
                target: 10,
                reward: 300,
                status: 'active',
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                difficulty: 'hard',
                category: 'individual'
            });

            contributor.activeChallenges.push({
                challengeId: challenge._id,
                progress: 10,
                target: 10,
                joined: new Date()
            });
            await contributor.save();

            const result = await completeChallenge('winner', challenge._id);

            expect(result.reward).toBe(300);
            expect(result.totalPoints).toBe(800); // 500 + 300

            const updatedContributor = await Contributor.findOne({ username: 'winner' });
            expect(updatedContributor.totalPoints).toBe(800);
            expect(updatedContributor.activeChallenges).toHaveLength(0);
            expect(updatedContributor.completedChallenges).toHaveLength(1);
            expect(updatedContributor.pointsHistory).toHaveLength(1);
            expect(updatedContributor.pointsHistory[0].reason).toBe('Challenge Completed');
        });

        it('should throw error for non-existent challenge', async () => {
            await Contributor.create(
                createTestContributor({ username: 'user' })
            );

            await expect(completeChallenge('user', 'fakeid')).rejects.toThrow();
        });
    });

    describe.skip('getUserChallenges', () => {
        it('should return user's active and completed challenges', async () => {
            const challenge1 = await Challenge.create({
                title: 'Active Challenge',
                description: 'Test',
                type: 'pr-merge',
                target: 5,
                reward: 100,
                status: 'active',
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                difficulty: 'easy',
                category: 'individual'
            });

            const challenge2 = await Challenge.create({
                title: 'Completed Challenge',
                description: 'Test',
                type: 'review',
                target: 10,
                reward: 200,
                status: 'expired',
                startDate: new Date(),
                endDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
                difficulty: 'medium',
                category: 'individual'
            });

            const contributor = await Contributor.create(
                createTestContributor({
                    username: 'challengeUser',
                    activeChallenges: [{
                        challengeId: challenge1._id,
                        progress: 3,
                        target: 5,
                        joined: new Date()
                    }],
                    completedChallenges: [{
                        challengeId: challenge2._id,
                        completedAt: new Date(),
                        reward: 200
                    }]
                })
            );

            const result = await getUserChallenges('challengeUser');

            expect(result.username).toBe('challengeUser');
            expect(result.activeChallenges).toHaveLength(1);
            expect(result.completedChallenges).toHaveLength(1);
            expect(result.totalCompleted).toBe(1);
        });

        it('should throw error for non-existent contributor', async () => {
            await expect(getUserChallenges('nonexistent')).rejects.toThrow(
                'Contributor not found'
            );
        });
    });

    describe.skip('generateWeeklyChallenges', () => {
        it('should generate 3 random challenges', async () => {
            const challenges = await generateWeeklyChallenges();

            expect(challenges).toHaveLength(3);
            expect(challenges[0]).toHaveProperty('title');
            expect(challenges[0]).toHaveProperty('type');
            expect(challenges[0]).toHaveProperty('target');
            expect(challenges[0]).toHaveProperty('reward');
            expect(challenges[0].status).toBe('active');
        });

        it('should set start and end dates correctly', async () => {
            const challenges = await generateWeeklyChallenges();

            const now = new Date();
            const challenge = challenges[0];

            expect(challenge.startDate).toBeDefined();
            expect(challenge.endDate).toBeDefined();

            const duration = challenge.endDate - challenge.startDate;
            const expectedDuration = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

            expect(duration).toBe(expectedDuration);
        });

        it('should generate challenges with different types', async () => {
            const challenges = await generateWeeklyChallenges();

            const types = challenges.map(c => c.type);
            const uniqueTypes = [...new Set(types)];

            // Should have at least 2 different types (due to randomness, might be 3)
            expect(uniqueTypes.length).toBeGreaterThanOrEqual(2);
        });
    });

    describe.skip('checkExpiredChallenges', () => {
        it('should mark expired active challenges as expired', async () => {
            const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

            await Challenge.create([
                {
                    title: 'Expired Challenge 1',
                    description: 'Test',
                    type: 'pr-merge',
                    target: 5,
                    reward: 100,
                    status: 'active',
                    startDate: past,
                    endDate: past,
                    difficulty: 'easy',
                    category: 'individual'
                },
                {
                    title: 'Expired Challenge 2',
                    description: 'Test',
                    type: 'review',
                    target: 10,
                    reward: 200,
                    status: 'active',
                    startDate: past,
                    endDate: past,
                    difficulty: 'medium',
                    category: 'individual'
                }
            ]);

            const count = await checkExpiredChallenges();

            expect(count).toBe(2);

            const challenges = await Challenge.find({ status: 'expired' });
            expect(challenges).toHaveLength(2);
        });

        it('should not affect active challenges with future end dates', async () => {
            const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

            await Challenge.create({
                title: 'Active Challenge',
                description: 'Test',
                type: 'pr-merge',
                target: 5,
                reward: 100,
                status: 'active',
                startDate: new Date(),
                endDate: future,
                difficulty: 'easy',
                category: 'individual'
            });

            const count = await checkExpiredChallenges();

            expect(count).toBe(0);

            const active = await Challenge.find({ status: 'active' });
            expect(active).toHaveLength(1);
        });
    });

    describe.skip('getChallengeLeaderboard', () => {
        it('should return sorted leaderboard by progress', async () => {
            const challenge = await Challenge.create({
                title: 'Leaderboard Challenge',
                description: 'Test',
                type: 'pr-merge',
                target: 10,
                reward: 250,
                status: 'active',
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                difficulty: 'medium',
                category: 'individual',
                participants: [
                    { username: 'user1', progress: 8, completed: false, joinedAt: new Date() },
                    { username: 'user2', progress: 10, completed: true, joinedAt: new Date() },
                    { username: 'user3', progress: 5, completed: false, joinedAt: new Date() },
                    { username: 'user4', progress: 7, completed: false, joinedAt: new Date() }
                ]
            });

            const result = await getChallengeLeaderboard(challenge._id);

            expect(result.challengeId).toBeDefined();
            expect(result.title).toBe('Leaderboard Challenge');
            expect(result.target).toBe(10);
            expect(result.leaderboard).toHaveLength(4);

            // Check sorting
            expect(result.leaderboard[0].username).toBe('user2');
            expect(result.leaderboard[0].progress).toBe(10);
            expect(result.leaderboard[1].username).toBe('user1');
            expect(result.leaderboard[1].progress).toBe(8);
        });

        it('should limit leaderboard to top 20', async () => {
            const participants = Array.from({ length: 25 }, (_, i) => ({
                username: `user${i}`,
                progress: i + 1,
                completed: false,
                joinedAt: new Date()
            }));

            const challenge = await Challenge.create({
                title: 'Large Challenge',
                description: 'Test',
                type: 'pr-merge',
                target: 100,
                reward: 500,
                status: 'active',
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                difficulty: 'hard',
                category: 'individual',
                participants
            });

            const result = await getChallengeLeaderboard(challenge._id);

            expect(result.leaderboard).toHaveLength(20);
        });

        it('should throw error for non-existent challenge', async () => {
            await expect(getChallengeLeaderboard('fakeid')).rejects.toThrow(
                'Challenge not found'
            );
        });
    });

    describe.skip('Edge Cases', () => {
        it('should handle challenges with zero participants', async () => {
            const challenge = await Challenge.create({
                title: 'Empty Challenge',
                description: 'Test',
                type: 'pr-merge',
                target: 5,
                reward: 100,
                status: 'active',
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                difficulty: 'easy',
                category: 'individual'
            });

            const result = await getChallengeLeaderboard(challenge._id);

            expect(result.leaderboard).toHaveLength(0);
        });

        it('should handle progress updates beyond target', async () => {
            const contributor = await Contributor.create(
                createTestContributor({
                    username: 'overachiever',
                    totalPoints: 0
                })
            );

            const challenge = await Challenge.create({
                title: 'Exceed Target',
                description: 'Test',
                type: 'pr-merge',
                target: 5,
                reward: 100,
                status: 'active',
                startDate: new Date(),
                endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                difficulty: 'easy',
                category: 'individual',
                participants: [{
                    username: 'overachiever',
                    progress: 4,
                    completed: false,
                    joinedAt: new Date()
                }]
            });

            contributor.activeChallenges.push({
                challengeId: challenge._id,
                progress: 4,
                target: 5,
                joined: new Date()
            });
            await contributor.save();

            // Add progress that exceeds target
            await updateChallengeProgress('overachiever', challenge._id, 3);

            const updatedChallenge = await Challenge.findById(challenge._id);
            expect(updatedChallenge.participants[0].progress).toBe(7); // Exceeds target
            expect(updatedChallenge.participants[0].completed).toBe(true);
        });
    });
});
