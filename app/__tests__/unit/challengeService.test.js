// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
    createChallenge,
    getActiveChallenges,
    getChallengeById,
    joinChallenge,
    updateChallengeProgress,
    setChallengeProgressAbsolute,
    completeChallenge,
    getUserChallenges,
    generateWeeklyChallenges,
    checkExpiredChallenges,
    getChallengeLeaderboard,
    updateChallenge,
    duplicateChallenge,
    bulkUpdateChallenges,
    bulkDeleteChallenges,
    findMissingChallengeAwards,
    reconcileMissingChallengeAwards
} from '../../services/challengeService.js';
import { countWorkingDays } from '../../utils/holidays.js';
import { prisma, createTestContributor } from '../setup.js';

// Note: Socket emitter and logger are not mocked in this test file
// These services will use their real implementations during tests

describe('ChallengeService', () => {
    beforeEach(async () => {
        await prisma.completedChallenge.deleteMany({});
        await prisma.challengeParticipant.deleteMany({});
        await prisma.challenge.deleteMany({});
        await prisma.processedReview.deleteMany({});
        await prisma.processedPR.deleteMany({});
        await prisma.achievement.deleteMany({});
        await prisma.pointHistory.deleteMany({});
        await prisma.review.deleteMany({});
        await prisma.contribution.deleteMany({});
        await prisma.contributor.deleteMany({});
    });

    describe('createChallenge', () => {
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

            const saved = await prisma.challenge.findUnique({ where: { id: challenge.id } });
            expect(saved).toBeDefined();
        });

        it('should throw error for invalid challenge data', async () => {
            const invalidData = {
                // Missing required fields
                title: 'Incomplete Challenge'
            };

            await expect(createChallenge(invalidData)).rejects.toThrow();
        });

        it('clamps a streak target to what a week can hold', async () => {
            // A streak counts the workdays in the current week, so a target above that
            // is unreachable — and asking for it is asking someone to work more than a
            // five-day week. Every creator (admin UI, MCP, the Monday cron) lands here.
            const challenge = await createChallenge({
                title: '30-Day Streak',
                description: 'The ultimate test of consistency',
                type: 'streak',
                target: 30,
                reward: 500,
                status: 'active',
                startDate: new Date(2026, 5, 1),
                endDate: new Date(2026, 6, 15),
                difficulty: 'hard',
                category: 'individual'
            });

            expect(challenge.target).toBe(5);
        });

        it('clamps a streak target to a holiday week ceiling', async () => {
            // Mon Jun 29 2026 to Mon Jul 6: Fri Jul 3 is the observed July 4 holiday.
            const challenge = await createChallenge({
                title: 'Holiday Week Streak',
                description: 'Contribute every workday',
                type: 'streak',
                target: 5,
                reward: 300,
                status: 'active',
                startDate: new Date(2026, 5, 29),
                endDate: new Date(2026, 6, 6),
                difficulty: 'hard',
                category: 'individual'
            });

            expect(challenge.target).toBe(4);
        });

        it('leaves a reachable streak target alone, and never touches other types', async () => {
            const streak = await createChallenge({
                title: 'Three Days',
                description: 'Contribute on three workdays',
                type: 'streak',
                target: 3,
                reward: 150,
                status: 'active',
                startDate: new Date(2026, 5, 1),
                endDate: new Date(2026, 5, 8),
                difficulty: 'easy',
                category: 'individual'
            });
            expect(streak.target).toBe(3);

            const points = await createChallenge({
                title: 'Point Hunter',
                description: 'Earn 500 points',
                type: 'points',
                target: 500,
                reward: 150,
                status: 'active',
                startDate: new Date(2026, 5, 1),
                endDate: new Date(2026, 5, 8),
                difficulty: 'easy',
                category: 'individual'
            });
            expect(points.target).toBe(500);
        });
    });

    describe('getActiveChallenges', () => {
        it('should return only active challenges with future end dates', async () => {
            const now = new Date();
            const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
            const past = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);

            await prisma.challenge.createMany({
                data: [
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
                ]
            });

            const active = await getActiveChallenges();

            expect(active).toHaveLength(1);
            expect(active[0].title).toBe('Active Challenge 1');
        });

        it('should return challenges sorted by start date descending', async () => {
            const now = new Date();
            const older = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            const future = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

            await prisma.challenge.createMany({
                data: [
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
                ]
            });

            const challenges = await getActiveChallenges();

            expect(challenges[0].title).toBe('Newer Challenge');
            expect(challenges[1].title).toBe('Older Challenge');
        });
    });

    describe('getChallengeById', () => {
        it('should return challenge for valid ID', async () => {
            const challenge = await prisma.challenge.create({
                data: {
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
                }
            });

            const found = await getChallengeById(challenge.id);

            expect(found).toBeDefined();
            expect(found.title).toBe('Find Me');
        });

        it('should throw error for non-existent challenge', async () => {
            const fakeId = 'clnonexistent123';

            await expect(getChallengeById(fakeId)).rejects.toThrow('Challenge not found');
        });
    });

    describe('joinChallenge', () => {
        it('should allow contributor to join active challenge', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({ username: 'joiner' })
            });

            const challenge = await prisma.challenge.create({
                data: {
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
                }
            });

            const result = await joinChallenge('joiner', challenge.id);

            expect(result.challenge).toBeDefined();
            expect(result.contributor).toBeDefined();

            // Verify challenge has participant
            const participants = await prisma.challengeParticipant.findMany({
                where: { challengeId: challenge.id },
                include: { contributor: true }
            });
            expect(participants).toHaveLength(1);
            expect(participants[0].contributor.username).toBe('joiner');
            expect(participants[0].progress).toBe(0);

            // Verify contributor has active challenge (via relation)
            const updatedContributor = await prisma.contributor.findUnique({ 
                where: { username: 'joiner' },
                include: { activeChallenges: true }
            });
            expect(updatedContributor.activeChallenges).toHaveLength(1);
            expect(updatedContributor.activeChallenges[0].challengeId).toBe(challenge.id);
        });

        it('should throw error if contributor does not exist', async () => {
            const challenge = await prisma.challenge.create({
                data: {
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
                }
            });

            await expect(joinChallenge('nonexistent', challenge.id)).rejects.toThrow(
                'Contributor not found'
            );
        });

        it('should throw error if already joined', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({ username: 'alreadyJoined' })
            });

            const challenge = await prisma.challenge.create({
                data: {
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
                }
            });

            await joinChallenge('alreadyJoined', challenge.id);

            await expect(joinChallenge('alreadyJoined', challenge.id)).rejects.toThrow(
                'Already joined this challenge'
            );
        });

        it('should throw error if challenge is not active', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({ username: 'lateJoiner' })
            });

            const challenge = await prisma.challenge.create({
                data: {
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
                }
            });

            await expect(joinChallenge('lateJoiner', challenge.id)).rejects.toThrow(
                'Challenge is not active'
            );
        });
    });

    describe('updateChallengeProgress', () => {
        it('should update progress for participant', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({ username: 'progressor' })
            });

            const challenge = await prisma.challenge.create({
                data: {
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
                    participants: {
                        create: {
                            contributorId: contributor.id,
                            progress: 5,
                            completed: false,
                            joinedAt: new Date()
                        }
                    }
                }
            });

            const result = await updateChallengeProgress('progressor', challenge.id, 2);

            expect(result.progress).toBe(7);
            expect(result.target).toBe(10);
            expect(result.completed).toBe(false);

            const participant = await prisma.challengeParticipant.findUnique({
                where: {
                    challengeId_contributorId: {
                        challengeId: challenge.id,
                        contributorId: contributor.id
                    }
                }
            });
            expect(participant.progress).toBe(7);
        });

        it('should mark challenge as completed when target reached', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username: 'completer',
                    totalPoints: 100
                })
            });

            const challenge = await prisma.challenge.create({
                data: {
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
                    participants: {
                        create: {
                            contributorId: contributor.id,
                            progress: 9,
                            completed: false,
                            joinedAt: new Date()
                        }
                    }
                }
            });

            await updateChallengeProgress('completer', challenge.id, 1);

            const participant = await prisma.challengeParticipant.findUnique({
                where: {
                    challengeId_contributorId: {
                        challengeId: challenge.id,
                        contributorId: contributor.id
                    }
                }
            });
            expect(participant.progress).toBe(10);
            expect(participant.completed).toBe(true);

            // Check that contributor received points
            const updatedContributor = await prisma.contributor.findUnique({ 
                where: { username: 'completer' },
                include: { completedChallenges: true }
            });
            expect(Number(updatedContributor.totalPoints)).toBe(350); // 100 + 250
            expect(updatedContributor.completedChallenges).toHaveLength(1);
        });

        it('should return null for non-existent challenge or contributor', async () => {
            const result = await updateChallengeProgress('nonexistent', 'fakeid', 1);

            expect(result).toBeNull();
        });
    });

    describe('completeChallenge', () => {
        it('should award points and move challenge to completed', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username: 'winner',
                    totalPoints: 500
                })
            });

            const challenge = await prisma.challenge.create({
                data: {
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
                }
            });

            const result = await completeChallenge('winner', challenge.id);

            expect(result.reward).toBe(300);
            expect(result.totalPoints).toBe(800); // 500 + 300

            const updatedContributor = await prisma.contributor.findUnique({ 
                where: { username: 'winner' },
                include: { pointsHistory: true, completedChallenges: true }
            });
            expect(Number(updatedContributor.totalPoints)).toBe(800);
            expect(updatedContributor.completedChallenges).toHaveLength(1);
            expect(updatedContributor.pointsHistory).toHaveLength(1);
            expect(updatedContributor.pointsHistory[0].reason).toBe('Challenge Completed');
        });

        it('should throw error for non-existent challenge', async () => {
            await prisma.contributor.create({
                data: createTestContributor({ username: 'user' })
            });

            await expect(completeChallenge('user', 'fakeid')).rejects.toThrow();
        });

        it('should not pay twice for the same participation', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username: 'doublepay',
                    totalPoints: BigInt(0),
                    allTimePoints: BigInt(0)
                })
            });

            const challenge = await prisma.challenge.create({
                data: {
                    title: 'Sprint Master',
                    description: 'Test',
                    type: 'pr-merge',
                    target: 5,
                    reward: 250,
                    status: 'active',
                    startDate: new Date(),
                    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    difficulty: 'medium',
                    category: 'individual',
                    participants: {
                        create: {
                            contributorId: contributor.id,
                            progress: 5,
                            completed: true,
                            joinedAt: new Date()
                        }
                    }
                }
            });

            await completeChallenge('doublepay', challenge.id);
            const second = await completeChallenge('doublepay', challenge.id);

            expect(second.alreadyAwarded).toBe(true);

            const completed = await prisma.completedChallenge.count({
                where: { challengeId: challenge.id }
            });
            expect(completed).toBe(1);

            const after = await prisma.contributor.findUnique({
                where: { id: contributor.id }
            });
            expect(after.totalPoints).toBe(BigInt(250));
        });
    });

    describe('getUserChallenges', () => {
        it('should return user\'s active and completed challenges', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({ username: 'challengeUser' })
            });

            const challenge1 = await prisma.challenge.create({
                data: {
                    title: 'Active Challenge',
                    description: 'Test',
                    type: 'pr-merge',
                    target: 5,
                    reward: 100,
                    status: 'active',
                    startDate: new Date(),
                    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    difficulty: 'easy',
                    category: 'individual',
                    participants: {
                        create: {
                            contributorId: contributor.id,
                            progress: 3,
                            joinedAt: new Date()
                        }
                    }
                }
            });

            const challenge2 = await prisma.challenge.create({
                data: {
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
                }
            });

            await prisma.completedChallenge.create({
                data: {
                    contributorId: contributor.id,
                    challengeId: challenge2.id,
                    reward: 200
                }
            });

            const result = await getUserChallenges('challengeUser');

            expect(result.username).toBe('challengeUser');
            expect(result.activeChallenges).toHaveLength(1);
            expect(result.completedChallenges).toHaveLength(1);
            expect(result.totalCompleted).toBe(1);
        });

        it('should return empty data for non-existent contributor', async () => {
            const result = await getUserChallenges('nonexistent');
            expect(result.username).toBe('nonexistent');
            expect(result.activeChallenges).toHaveLength(0);
            expect(result.completedChallenges).toHaveLength(0);
            expect(result.expiredIncomplete).toHaveLength(0);
            expect(result.totalCompleted).toBe(0);
        });

        it('should not report a completed participation as expired incomplete', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({ username: 'exceeder' })
            });

            // Mirrors production: completing a challenge sets completed=true on the
            // participant row and adds a CompletedChallenge; the participant row is kept,
            // and progress keeps accruing past the target until the window closes.
            const challenge = await prisma.challenge.create({
                data: {
                    title: 'Point Hunter',
                    description: 'Test',
                    type: 'points',
                    target: 500,
                    reward: 150,
                    status: 'expired',
                    startDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
                    endDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    difficulty: 'easy',
                    category: 'individual',
                    participants: {
                        create: {
                            contributorId: contributor.id,
                            progress: 550,
                            completed: true,
                            joinedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
                        }
                    }
                }
            });

            await prisma.completedChallenge.create({
                data: {
                    contributorId: contributor.id,
                    challengeId: challenge.id,
                    reward: 150
                }
            });

            const result = await getUserChallenges('exceeder');

            expect(result.expiredIncomplete).toHaveLength(0);
            expect(result.completedChallenges).toHaveLength(1);
            expect(result.totalCompleted).toBe(1);
        });

        it('should not report a completed participation as an active challenge', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({ username: 'earlyFinisher' })
            });

            // Completed mid-window: the challenge is still active but the participant
            // is done, so it belongs in completedChallenges only.
            const challenge = await prisma.challenge.create({
                data: {
                    title: 'Sprint Master',
                    description: 'Test',
                    type: 'pr-merge',
                    target: 5,
                    reward: 250,
                    status: 'active',
                    startDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
                    endDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
                    difficulty: 'medium',
                    category: 'individual',
                    participants: {
                        create: {
                            contributorId: contributor.id,
                            progress: 10,
                            completed: true,
                            joinedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
                        }
                    }
                }
            });

            await prisma.completedChallenge.create({
                data: {
                    contributorId: contributor.id,
                    challengeId: challenge.id,
                    reward: 250
                }
            });

            const result = await getUserChallenges('earlyFinisher');

            expect(result.activeChallenges).toHaveLength(0);
            expect(result.expiredIncomplete).toHaveLength(0);
            expect(result.completedChallenges).toHaveLength(1);
        });
    });

    describe('generateWeeklyChallenges', () => {
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

        describe('streak challenge target', () => {
            // Math.random() === 0 makes the Fisher-Yates shuffle deterministic and
            // always leaves the streak template in the selected three.
            beforeEach(() => {
                jest.spyOn(Math, 'random').mockReturnValue(0);
            });

            afterEach(() => {
                jest.restoreAllMocks();
            });

            const streakOf = challenges => challenges.find(c => c.type === 'streak');

            it('targets only the workdays its own window contains', async () => {
                const challenges = await generateWeeklyChallenges();
                const streak = streakOf(challenges);

                expect(streak).toBeDefined();
                // Streaks only advance on working days, so a target above the
                // window's workday count is unreachable for anyone starting fresh.
                expect(streak.target).toBe(countWorkingDays(streak.startDate, streak.endDate));
            });

            it('never sets a target a fresh contributor cannot reach in one week', async () => {
                const challenges = await generateWeeklyChallenges();
                const streak = streakOf(challenges);

                // A 7-day window holds at most 5 weekdays, fewer on holiday weeks.
                expect(streak.target).toBeLessThanOrEqual(5);
                expect(streak.target).toBeGreaterThanOrEqual(4);
            });

            it('describes the target in workdays, not calendar days', async () => {
                const challenges = await generateWeeklyChallenges();
                const streak = streakOf(challenges);

                expect(streak.description).toContain(String(streak.target));
                expect(streak.description).toMatch(/workday/i);
                // The old copy read as a 7-day calendar streak, which invited
                // weekend work the streak engine never credits.
                expect(streak.description).not.toMatch(/7-day/i);
            });
        });
    });

    describe('checkExpiredChallenges', () => {
        it('should mark expired active challenges as expired', async () => {
            const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

            await prisma.challenge.createMany({
                data: [
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
                ]
            });

            const count = await checkExpiredChallenges();

            expect(count).toBe(2);

            const challenges = await prisma.challenge.findMany({ 
                where: { status: 'expired' } 
            });
            expect(challenges).toHaveLength(2);
        });

        it('should not affect active challenges with future end dates', async () => {
            const future = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

            await prisma.challenge.create({
                data: {
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
                }
            });

            const count = await checkExpiredChallenges();

            expect(count).toBe(0);

            const active = await prisma.challenge.findMany({ 
                where: { status: 'active' } 
            });
            expect(active).toHaveLength(1);
        });
    });

    describe('getChallengeLeaderboard', () => {
        it('should return sorted leaderboard by progress', async () => {
            // Create contributors first
            const users = await Promise.all([
                prisma.contributor.create({ data: createTestContributor({ username: 'user1' }) }),
                prisma.contributor.create({ data: createTestContributor({ username: 'user2' }) }),
                prisma.contributor.create({ data: createTestContributor({ username: 'user3' }) }),
                prisma.contributor.create({ data: createTestContributor({ username: 'user4' }) })
            ]);

            const challenge = await prisma.challenge.create({
                data: {
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
                    participants: {
                        create: [
                            { contributorId: users[0].id, progress: 8, completed: false, joinedAt: new Date() },
                            { contributorId: users[1].id, progress: 10, completed: true, joinedAt: new Date() },
                            { contributorId: users[2].id, progress: 5, completed: false, joinedAt: new Date() },
                            { contributorId: users[3].id, progress: 7, completed: false, joinedAt: new Date() }
                        ]
                    }
                }
            });

            const result = await getChallengeLeaderboard(challenge.id);

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
            // Create 25 contributors
            const users = await Promise.all(
                Array.from({ length: 25 }, (_, i) =>
                    prisma.contributor.create({ 
                        data: createTestContributor({ username: `user${i}` }) 
                    })
                )
            );

            const challenge = await prisma.challenge.create({
                data: {
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
                    participants: {
                        create: users.map((user, i) => ({
                            contributorId: user.id,
                            progress: i + 1,
                            completed: false,
                            joinedAt: new Date()
                        }))
                    }
                }
            });

            const result = await getChallengeLeaderboard(challenge.id);

            expect(result.leaderboard).toHaveLength(20);
        });

        it('should throw error for non-existent challenge', async () => {
            await expect(getChallengeLeaderboard('fakeid')).rejects.toThrow(
                'Challenge not found'
            );
        });
    });

    describe('updateChallenge', () => {
        it('should update allowed fields', async () => {
            const challenge = await prisma.challenge.create({
                data: {
                    title: 'Original Title',
                    description: 'Original Description',
                    type: 'pr-merge',
                    target: 5,
                    reward: 100,
                    status: 'active',
                    startDate: new Date(),
                    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    difficulty: 'easy',
                    category: 'individual'
                }
            });

            const updated = await updateChallenge(challenge.id, {
                title: 'Updated Title',
                description: 'Updated Description',
                target: 10,
                reward: 200,
                difficulty: 'hard'
            });

            expect(updated.title).toBe('Updated Title');
            expect(updated.description).toBe('Updated Description');
            expect(updated.target).toBe(10);
            expect(updated.reward).toBe(200);
            expect(updated.difficulty).toBe('hard');
        });

        it('should throw error for non-existent challenge', async () => {
            await expect(updateChallenge('nonexistent', { title: 'New' }))
                .rejects.toThrow();
        });

        it('should block type change when participants exist', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({ username: 'typeBlocker' })
            });

            const challenge = await prisma.challenge.create({
                data: {
                    title: 'Has Participants',
                    description: 'Test',
                    type: 'pr-merge',
                    target: 5,
                    reward: 100,
                    status: 'active',
                    startDate: new Date(),
                    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    difficulty: 'easy',
                    category: 'individual',
                    participants: {
                        create: {
                            contributorId: contributor.id,
                            progress: 3,
                            completed: false,
                            joinedAt: new Date()
                        }
                    }
                }
            });

            await expect(updateChallenge(challenge.id, { type: 'review' }))
                .rejects.toThrow('Cannot change challenge type when participants exist');
        });

        it('should block target reduction below max participant progress', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({ username: 'targetBlocker' })
            });

            const challenge = await prisma.challenge.create({
                data: {
                    title: 'Target Block',
                    description: 'Test',
                    type: 'pr-merge',
                    target: 10,
                    reward: 100,
                    status: 'active',
                    startDate: new Date(),
                    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    difficulty: 'easy',
                    category: 'individual',
                    participants: {
                        create: {
                            contributorId: contributor.id,
                            progress: 7,
                            completed: false,
                            joinedAt: new Date()
                        }
                    }
                }
            });

            await expect(updateChallenge(challenge.id, { target: 5 }))
                .rejects.toThrow('Cannot reduce target below current maximum participant progress');
        });

        it('should allow type change without participants', async () => {
            const challenge = await prisma.challenge.create({
                data: {
                    title: 'No Participants',
                    description: 'Test',
                    type: 'pr-merge',
                    target: 5,
                    reward: 100,
                    status: 'active',
                    startDate: new Date(),
                    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    difficulty: 'easy',
                    category: 'individual'
                }
            });

            const updated = await updateChallenge(challenge.id, { type: 'review' });
            expect(updated.type).toBe('review');
        });

        it('should validate end date after start date', async () => {
            const challenge = await prisma.challenge.create({
                data: {
                    title: 'Date Validation',
                    description: 'Test',
                    type: 'pr-merge',
                    target: 5,
                    reward: 100,
                    status: 'active',
                    startDate: new Date('2025-01-10'),
                    endDate: new Date('2025-01-20'),
                    difficulty: 'easy',
                    category: 'individual'
                }
            });

            await expect(updateChallenge(challenge.id, {
                startDate: '2025-01-15',
                endDate: '2025-01-10'
            })).rejects.toThrow('End date must be after start date');
        });
    });

    describe('duplicateChallenge', () => {
        it('should copy fields and set new dates', async () => {
            const challenge = await prisma.challenge.create({
                data: {
                    title: 'Original',
                    description: 'Desc',
                    type: 'pr-merge',
                    target: 5,
                    reward: 100,
                    status: 'active',
                    startDate: new Date('2025-01-01'),
                    endDate: new Date('2025-01-08'),
                    difficulty: 'easy',
                    category: 'individual'
                }
            });

            const dup = await duplicateChallenge(challenge.id);

            expect(dup.title).toBe('Original (Copy)');
            expect(dup.description).toBe('Desc');
            expect(dup.type).toBe('pr-merge');
            expect(dup.target).toBe(5);
            expect(dup.reward).toBe(100);
            expect(dup.status).toBe('active');
            expect(dup.difficulty).toBe('easy');
            expect(dup.id).not.toBe(challenge.id);

            // Duration preserved (7 days)
            const duration = dup.endDate - dup.startDate;
            expect(duration).toBe(7 * 24 * 60 * 60 * 1000);
        });

        it('should not carry over participant progress from the original', async () => {
            // A duplicated challenge is a fresh active challenge: handleChallengeCreated
            // auto-enrolls all contributors (so nobody is excluded), exactly like any
            // other new challenge. The invariant under test is that the original's
            // participant STATE (progress / completion) is not copied — each participant
            // on the duplicate starts clean.
            const contributor = await prisma.contributor.create({
                data: createTestContributor({ username: 'dupParticipant' })
            });

            const challenge = await prisma.challenge.create({
                data: {
                    title: 'With Participants',
                    description: 'Test',
                    type: 'pr-merge',
                    target: 5,
                    reward: 100,
                    status: 'active',
                    startDate: new Date('2026-01-01'),
                    endDate: new Date('2026-01-08'),
                    difficulty: 'easy',
                    category: 'individual',
                    participants: {
                        create: {
                            contributorId: contributor.id,
                            progress: 3,
                            completed: false,
                            joinedAt: new Date('2026-01-02')
                        }
                    }
                }
            });

            const dup = await duplicateChallenge(challenge.id);

            // Original is untouched
            const originalParticipants = await prisma.challengeParticipant.findMany({
                where: { challengeId: challenge.id }
            });
            expect(originalParticipants).toHaveLength(1);
            expect(originalParticipants[0].progress).toBe(3);

            // Duplicate's participants are all fresh — no progress/completion carried over
            const dupParticipants = await prisma.challengeParticipant.findMany({
                where: { challengeId: dup.id }
            });
            for (const p of dupParticipants) {
                expect(p.progress).toBe(0);
                expect(p.completed).toBe(false);
            }
        });

        it('should increment copy number in title', async () => {
            const challenge = await prisma.challenge.create({
                data: {
                    title: 'Test (Copy)',
                    description: 'Test',
                    type: 'pr-merge',
                    target: 5,
                    reward: 100,
                    status: 'active',
                    startDate: new Date(),
                    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    difficulty: 'easy',
                    category: 'individual'
                }
            });

            const dup = await duplicateChallenge(challenge.id);
            expect(dup.title).toBe('Test (Copy 2)');
        });

        it('should throw error for non-existent challenge', async () => {
            await expect(duplicateChallenge('nonexistent'))
                .rejects.toThrow();
        });
    });

    describe('bulkUpdateChallenges', () => {
        it('should bulk activate challenges', async () => {
            const challenges = await Promise.all([
                prisma.challenge.create({
                    data: {
                        title: 'Bulk 1', description: 'Test', type: 'pr-merge',
                        target: 5, reward: 100, status: 'expired',
                        startDate: new Date(), endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                        difficulty: 'easy', category: 'individual'
                    }
                }),
                prisma.challenge.create({
                    data: {
                        title: 'Bulk 2', description: 'Test', type: 'review',
                        target: 10, reward: 200, status: 'expired',
                        startDate: new Date(), endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                        difficulty: 'medium', category: 'individual'
                    }
                })
            ]);

            const result = await bulkUpdateChallenges(
                challenges.map(c => c.id), 'activate'
            );

            expect(result.updated).toBe(2);

            const updated = await prisma.challenge.findMany({
                where: { id: { in: challenges.map(c => c.id) } }
            });
            expect(updated.every(c => c.status === 'active')).toBe(true);
        });

        it('should throw error for invalid action', async () => {
            await expect(bulkUpdateChallenges(['id1'], 'invalid'))
                .rejects.toThrow('Invalid action');
        });

        it('should throw error for empty ids array', async () => {
            await expect(bulkUpdateChallenges([], 'activate'))
                .rejects.toThrow('No challenge IDs provided');
        });
    });

    describe('bulkDeleteChallenges', () => {
        it('should bulk delete challenges', async () => {
            const challenges = await Promise.all([
                prisma.challenge.create({
                    data: {
                        title: 'Delete 1', description: 'Test', type: 'pr-merge',
                        target: 5, reward: 100, status: 'active',
                        startDate: new Date(), endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                        difficulty: 'easy', category: 'individual'
                    }
                }),
                prisma.challenge.create({
                    data: {
                        title: 'Delete 2', description: 'Test', type: 'review',
                        target: 10, reward: 200, status: 'active',
                        startDate: new Date(), endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                        difficulty: 'medium', category: 'individual'
                    }
                })
            ]);

            const result = await bulkDeleteChallenges(challenges.map(c => c.id));

            expect(result.deleted).toBe(2);

            const remaining = await prisma.challenge.findMany({
                where: { id: { in: challenges.map(c => c.id) } }
            });
            expect(remaining).toHaveLength(0);
        });

        it('should cascade delete participants', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({ username: 'cascadeUser' })
            });

            const challenge = await prisma.challenge.create({
                data: {
                    title: 'Cascade Delete',
                    description: 'Test',
                    type: 'pr-merge',
                    target: 5,
                    reward: 100,
                    status: 'active',
                    startDate: new Date(),
                    endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                    difficulty: 'easy',
                    category: 'individual',
                    participants: {
                        create: {
                            contributorId: contributor.id,
                            progress: 3,
                            completed: false,
                            joinedAt: new Date()
                        }
                    }
                }
            });

            await bulkDeleteChallenges([challenge.id]);

            const participants = await prisma.challengeParticipant.findMany({
                where: { challengeId: challenge.id }
            });
            expect(participants).toHaveLength(0);
        });
    });

    describe('Edge Cases', () => {
        it('should handle challenges with zero participants', async () => {
            const challenge = await prisma.challenge.create({
                data: {
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
                }
            });

            const result = await getChallengeLeaderboard(challenge.id);

            expect(result.leaderboard).toHaveLength(0);
        });

        it('should handle progress updates beyond target', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username: 'overachiever',
                    totalPoints: 0
                })
            });

            const challenge = await prisma.challenge.create({
                data: {
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
                    participants: {
                        create: {
                            contributorId: contributor.id,
                            progress: 4,
                            completed: false,
                            joinedAt: new Date()
                        }
                    }
                }
            });

            // Add progress that exceeds target
            await updateChallengeProgress('overachiever', challenge.id, 3);

            const participant = await prisma.challengeParticipant.findUnique({
                where: {
                    challengeId_contributorId: {
                        challengeId: challenge.id,
                        contributorId: contributor.id
                    }
                }
            });
            expect(participant.progress).toBe(7); // Exceeds target
            expect(participant.completed).toBe(true);
        });
    });

    describe('challenge window enforcement', () => {
        const DAY = 24 * 60 * 60 * 1000;

        const seedWindow = async (username, { endsIn, progress = 4, target = 5 }) => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username,
                    totalPoints: BigInt(0),
                    allTimePoints: BigInt(0)
                })
            });

            const challenge = await prisma.challenge.create({
                data: {
                    title: 'Sprint Master',
                    description: 'Test',
                    type: 'pr-merge',
                    target,
                    reward: 250,
                    status: 'active',
                    startDate: new Date(Date.now() + endsIn - 7 * DAY),
                    endDate: new Date(Date.now() + endsIn),
                    difficulty: 'medium',
                    category: 'individual',
                    participants: {
                        create: {
                            contributorId: contributor.id,
                            progress,
                            completed: false,
                            joinedAt: new Date(Date.now() + endsIn - 7 * DAY)
                        }
                    }
                }
            });

            return { contributor, challenge };
        };

        const readParticipant = (challengeId, contributorId) =>
            prisma.challengeParticipant.findUnique({
                where: {
                    challengeId_contributorId: { challengeId, contributorId }
                }
            });

        it('should ignore progress for activity after the challenge ended', async () => {
            const { contributor, challenge } = await seedWindow('lateprs', {
                endsIn: -7 * DAY
            });

            await updateChallengeProgress('lateprs', challenge.id, 1, new Date());

            const participant = await readParticipant(challenge.id, contributor.id);
            expect(participant.progress).toBe(4);
            expect(participant.completed).toBe(false);
        });

        it('should not award a target crossed after the challenge ended', async () => {
            const { contributor, challenge } = await seedWindow('latecross', {
                endsIn: -30 * DAY
            });

            await updateChallengeProgress('latecross', challenge.id, 30, new Date());

            const participant = await readParticipant(challenge.id, contributor.id);
            expect(participant.progress).toBe(4);
            expect(participant.completed).toBe(false);

            const awarded = await prisma.completedChallenge.count({
                where: { challengeId: challenge.id }
            });
            expect(awarded).toBe(0);

            const after = await prisma.contributor.findUnique({
                where: { id: contributor.id }
            });
            expect(after.totalPoints).toBe(BigInt(0));
        });

        it('should ignore progress for activity before the challenge started', async () => {
            const { contributor, challenge } = await seedWindow('early', {
                endsIn: 7 * DAY
            });

            await updateChallengeProgress(
                'early',
                challenge.id,
                1,
                new Date(Date.now() - 30 * DAY)
            );

            const participant = await readParticipant(challenge.id, contributor.id);
            expect(participant.progress).toBe(4);
        });

        it('should add progress for activity inside the window', async () => {
            const { contributor, challenge } = await seedWindow('inwindow', {
                endsIn: 2 * DAY
            });

            await updateChallengeProgress('inwindow', challenge.id, 1, new Date());

            const participant = await readParticipant(challenge.id, contributor.id);
            expect(participant.progress).toBe(5);
            expect(participant.completed).toBe(true);
        });

        it('should credit a backfilled contribution that happened inside the window', async () => {
            // run-backfill.js replays historical PRs long after the fact; the window
            // check has to key on when the work happened, not when it was processed.
            const { contributor, challenge } = await seedWindow('backfilled', {
                endsIn: -2 * DAY
            });

            await updateChallengeProgress(
                'backfilled',
                challenge.id,
                1,
                new Date(Date.now() - 3 * DAY)
            );

            const participant = await readParticipant(challenge.id, contributor.id);
            expect(participant.progress).toBe(5);
            expect(participant.completed).toBe(true);
        });

        it('should default to now when no activity date is given', async () => {
            const { contributor, challenge } = await seedWindow('nodate', {
                endsIn: -7 * DAY
            });

            await updateChallengeProgress('nodate', challenge.id, 1);

            const participant = await readParticipant(challenge.id, contributor.id);
            expect(participant.progress).toBe(4);
        });

        it('should ignore an absolute streak update after the challenge ended', async () => {
            const { contributor, challenge } = await seedWindow('latestreak', {
                endsIn: -7 * DAY,
                progress: 3,
                target: 7
            });

            await setChallengeProgressAbsolute('latestreak', challenge.id, 9, new Date());

            const participant = await readParticipant(challenge.id, contributor.id);
            expect(participant.progress).toBe(3);
            expect(participant.completed).toBe(false);
        });
    });

    describe('findMissingChallengeAwards', () => {
        const makeChallenge = async (contributorId, overrides = {}, participant = {}) => {
            return prisma.challenge.create({
                data: {
                    title: 'Point Hunter',
                    description: 'Test',
                    type: 'points',
                    target: 500,
                    reward: 150,
                    status: 'expired',
                    startDate: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
                    endDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                    difficulty: 'easy',
                    category: 'individual',
                    ...overrides,
                    participants: {
                        create: {
                            contributorId,
                            progress: 550,
                            completed: true,
                            joinedAt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
                            ...participant
                        }
                    }
                }
            });
        };

        it('should report a participation flagged completed with no award', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({ username: 'flagged' })
            });
            const challenge = await makeChallenge(contributor.id);

            const missing = await findMissingChallengeAwards();

            expect(missing).toHaveLength(1);
            expect(missing[0]).toMatchObject({
                username: 'flagged',
                challengeId: challenge.id,
                title: 'Point Hunter',
                reward: 150,
                progress: 550,
                target: 500,
                reason: 'flagged-not-awarded'
            });
        });

        it('should report a participation at or beyond target that was never flagged', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({ username: 'unflagged' })
            });
            await makeChallenge(contributor.id, {}, { completed: false, progress: 675 });

            const missing = await findMissingChallengeAwards();

            expect(missing).toHaveLength(1);
            expect(missing[0]).toMatchObject({
                username: 'unflagged',
                reason: 'target-met-not-flagged',
                progress: 675
            });
        });

        it('should ignore a participation that was already awarded', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({ username: 'awarded' })
            });
            const challenge = await makeChallenge(contributor.id);
            await prisma.completedChallenge.create({
                data: {
                    contributorId: contributor.id,
                    challengeId: challenge.id,
                    reward: 150
                }
            });

            const missing = await findMissingChallengeAwards();

            expect(missing).toHaveLength(0);
        });

        it('should ignore a participation that is genuinely short of target', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({ username: 'shortfall' })
            });
            await makeChallenge(contributor.id, {}, { completed: false, progress: 415 });

            const missing = await findMissingChallengeAwards();

            expect(missing).toHaveLength(0);
        });
    });

    describe('reconcileMissingChallengeAwards', () => {
        const seedOrphan = async (username, participant = {}) => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username,
                    totalPoints: BigInt(1000),
                    allTimePoints: BigInt(1000)
                })
            });

            const challenge = await prisma.challenge.create({
                data: {
                    title: 'Sprint Master',
                    description: 'Test',
                    type: 'pr-merge',
                    target: 5,
                    reward: 250,
                    status: 'expired',
                    startDate: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
                    endDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
                    difficulty: 'medium',
                    category: 'individual',
                    participants: {
                        create: {
                            contributorId: contributor.id,
                            progress: 10,
                            completed: true,
                            joinedAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000),
                            ...participant
                        }
                    }
                }
            });

            return { contributor, challenge };
        };

        it('should not write anything in dry-run mode', async () => {
            const { contributor, challenge } = await seedOrphan('dryrun');

            const result = await reconcileMissingChallengeAwards();

            expect(result.applied).toBe(false);
            expect(result.awards).toHaveLength(1);
            expect(result.totalPoints).toBe(250);

            const awarded = await prisma.completedChallenge.count({
                where: { challengeId: challenge.id }
            });
            expect(awarded).toBe(0);

            const after = await prisma.contributor.findUnique({
                where: { id: contributor.id }
            });
            expect(after.totalPoints).toBe(BigInt(1000));
        });

        it('should award the missing points when applied', async () => {
            const { contributor, challenge } = await seedOrphan('applied');

            const result = await reconcileMissingChallengeAwards({ apply: true });

            expect(result.applied).toBe(true);
            expect(result.awards).toHaveLength(1);
            expect(result.totalPoints).toBe(250);

            const completed = await prisma.completedChallenge.findMany({
                where: { challengeId: challenge.id }
            });
            expect(completed).toHaveLength(1);
            expect(completed[0].reward).toBe(250);
            // Backdated to the challenge window, not the day the backfill ran
            expect(completed[0].completedAt.getTime()).toBe(challenge.endDate.getTime());

            const after = await prisma.contributor.findUnique({
                where: { id: contributor.id }
            });
            expect(after.totalPoints).toBe(BigInt(1250));
            expect(after.allTimePoints).toBe(BigInt(1250));

            const history = await prisma.pointHistory.findMany({
                where: { contributorId: contributor.id }
            });
            expect(history).toHaveLength(1);
            expect(history[0].points).toBe(BigInt(250));
            expect(history[0].reason).toBe('Challenge Completed');
            expect(history[0].timestamp.getTime()).toBe(challenge.endDate.getTime());
        });

        it('should withhold an unflagged target-met participation by default', async () => {
            const { contributor, challenge } = await seedOrphan('unflagged', {
                completed: false
            });

            const result = await reconcileMissingChallengeAwards({ apply: true });

            // progress >= target can also be the residue of post-window accrual, which
            // never earned the reward. Paying it out needs an explicit opt-in.
            expect(result.paid).toHaveLength(0);
            expect(result.skipped).toHaveLength(1);
            expect(result.skipped[0].reason).toBe('target-met-not-flagged');

            const awarded = await prisma.completedChallenge.count({
                where: { challengeId: challenge.id }
            });
            expect(awarded).toBe(0);

            const after = await prisma.contributor.findUnique({
                where: { id: contributor.id }
            });
            expect(after.totalPoints).toBe(BigInt(1000));
        });

        it('should set the completed flag when the award was never detected', async () => {
            const { contributor, challenge } = await seedOrphan('neverflagged', {
                completed: false
            });

            await reconcileMissingChallengeAwards({ apply: true, includeUnflagged: true });

            const participant = await prisma.challengeParticipant.findUnique({
                where: {
                    challengeId_contributorId: {
                        challengeId: challenge.id,
                        contributorId: contributor.id
                    }
                }
            });
            expect(participant.completed).toBe(true);
        });

        it('should be idempotent across repeated runs', async () => {
            const { contributor } = await seedOrphan('idempotent');

            await reconcileMissingChallengeAwards({ apply: true });
            const second = await reconcileMissingChallengeAwards({ apply: true });

            expect(second.awards).toHaveLength(0);
            expect(second.totalPoints).toBe(0);

            const after = await prisma.contributor.findUnique({
                where: { id: contributor.id }
            });
            expect(after.totalPoints).toBe(BigInt(1250));

            const history = await prisma.pointHistory.count({
                where: { contributorId: contributor.id }
            });
            expect(history).toBe(1);
        });

        it('should be rejected at the database level on a duplicate award', async () => {
            // The awarded-key set is built outside any transaction, so two overlapping
            // runs - or a run overlapping the live completeChallenge() webhook path -
            // can both see the participation as unpaid. Only a unique constraint can
            // break the tie, so assert it exists rather than relying on interleaving.
            const { contributor, challenge } = await seedOrphan('concurrent');

            await reconcileMissingChallengeAwards({ apply: true });

            await expect(
                prisma.completedChallenge.create({
                    data: {
                        contributorId: contributor.id,
                        challengeId: challenge.id,
                        reward: 250
                    }
                })
            ).rejects.toMatchObject({ code: 'P2002' });

            const completed = await prisma.completedChallenge.count({
                where: { challengeId: challenge.id }
            });
            expect(completed).toBe(1);

            const after = await prisma.contributor.findUnique({
                where: { id: contributor.id }
            });
            expect(after.totalPoints).toBe(BigInt(1250));
        });

        it('should report awards it could not attribute to the current quarter', async () => {
            // seedOrphan's challenge ended 2 days ago, so it is inside the current
            // quarter and quarterly stats can absorb it.
            const { contributor } = await seedOrphan('thisquarter');

            const result = await reconcileMissingChallengeAwards({ apply: true });

            expect(result.quarterlyDeferred).toHaveLength(0);

            const after = await prisma.contributor.findUnique({
                where: { id: contributor.id }
            });
            expect(after.quarterlyStats.pointsThisQuarter).toBe(250);
        });

        it('should defer quarterly attribution for a challenge from a closed quarter', async () => {
            const contributor = await prisma.contributor.create({
                data: createTestContributor({
                    username: 'oldquarter',
                    totalPoints: BigInt(1000),
                    allTimePoints: BigInt(1000)
                })
            });

            const YEAR = 365 * 24 * 60 * 60 * 1000;
            const challenge = await prisma.challenge.create({
                data: {
                    title: 'Point Hunter',
                    description: 'Test',
                    type: 'points',
                    target: 500,
                    reward: 150,
                    status: 'expired',
                    startDate: new Date(Date.now() - YEAR - 7 * 24 * 60 * 60 * 1000),
                    endDate: new Date(Date.now() - YEAR),
                    difficulty: 'easy',
                    category: 'individual',
                    participants: {
                        create: {
                            contributorId: contributor.id,
                            progress: 550,
                            completed: true,
                            joinedAt: new Date(Date.now() - YEAR - 7 * 24 * 60 * 60 * 1000)
                        }
                    }
                }
            });

            const result = await reconcileMissingChallengeAwards({ apply: true });

            // The points are still recovered, but there is no past-quarter bucket to
            // write to, so the caller has to be told rather than left guessing.
            expect(result.paid).toHaveLength(1);
            expect(result.quarterlyDeferred).toHaveLength(1);
            expect(result.quarterlyDeferred[0].challengeId).toBe(challenge.id);

            const after = await prisma.contributor.findUnique({
                where: { id: contributor.id }
            });
            expect(after.totalPoints).toBe(BigInt(1150));
            expect(after.quarterlyStats?.pointsThisQuarter ?? 0).toBe(0);
        });

        it('should scope the run to a single username when asked', async () => {
            await seedOrphan('mine');
            const { contributor: other } = await seedOrphan('theirs');

            const result = await reconcileMissingChallengeAwards({
                apply: true,
                username: 'mine'
            });

            expect(result.awards).toHaveLength(1);
            expect(result.awards[0].username).toBe('mine');

            const untouched = await prisma.contributor.findUnique({
                where: { id: other.id }
            });
            expect(untouched.totalPoints).toBe(BigInt(1000));
        });
    });
});
