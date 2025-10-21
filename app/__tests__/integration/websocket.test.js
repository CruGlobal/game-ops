import { describe, it, expect, beforeAll, afterAll, afterEach, jest } from '@jest/globals';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
// Removed Mongoose model imports (migrated to Prisma elsewhere)
import { createTestContributor } from '../setup.js';

describe('WebSocket Integration Tests', () => {
    let httpServer;
    let ioServer;
    let serverSocket;
    let clientSocket;
    const TEST_PORT = 3001;

    beforeAll((done) => {
        // Create HTTP server and Socket.IO server
        httpServer = createServer();
        ioServer = new SocketIOServer(httpServer, {
            cors: {
                origin: '*',
                methods: ['GET', 'POST']
            }
        });

        // Set up server-side Socket.IO event handlers
        ioServer.on('connection', (socket) => {
            serverSocket = socket;

            // Echo test events
            socket.on('test-event', (data) => {
                socket.emit('test-response', data);
            });

            // Simulate leaderboard update
            socket.on('request-leaderboard', () => {
                socket.emit('leaderboard-update', {
                    timestamp: new Date(),
                    topContributors: []
                });
            });

            // Simulate PR update
            socket.on('new-pr', (data) => {
                socket.broadcast.emit('pr-update', {
                    username: data.username,
                    prCount: data.prCount
                });
            });

            // Room join/leave handlers to support room tests
            socket.on('join-room', (room) => {
                try {
                    socket.join(room);
                } catch (e) {
                    // no-op in tests
                }
            });

            socket.on('leave-room', (room) => {
                try {
                    socket.leave(room);
                } catch (e) {
                    // no-op in tests
                }
            });
        });

        httpServer.listen(TEST_PORT, () => {
            done();
        });
    });

    afterAll(() => {
        ioServer.close();
        httpServer.close();
    });

    afterEach(() => {
        if (clientSocket && clientSocket.connected) {
            clientSocket.disconnect();
        }
    });

    describe('Connection Tests', () => {
        it('should establish WebSocket connection', (done) => {
            clientSocket = ioClient(`http://localhost:${TEST_PORT}`);

            clientSocket.on('connect', () => {
                expect(clientSocket.connected).toBe(true);
                done();
            });
        });

        it('should handle disconnection', (done) => {
            clientSocket = ioClient(`http://localhost:${TEST_PORT}`);

            clientSocket.on('connect', () => {
                clientSocket.disconnect();
            });

            clientSocket.on('disconnect', () => {
                expect(clientSocket.connected).toBe(false);
                done();
            });
        });

        it.skip('should reconnect after disconnection', (done) => {
            clientSocket = ioClient(`http://localhost:${TEST_PORT}`, {
                reconnection: true,
                reconnectionDelay: 100
            });

            let connectCount = 0;

            clientSocket.on('connect', () => {
                connectCount++;

                if (connectCount === 1) {
                    // First connection - disconnect
                    clientSocket.disconnect();
                } else if (connectCount === 2) {
                    // Reconnected
                    expect(clientSocket.connected).toBe(true);
                    done();
                }
            });
        });
    });

    describe('Event Emission Tests', () => {
        beforeEach((done) => {
            clientSocket = ioClient(`http://localhost:${TEST_PORT}`);
            clientSocket.on('connect', done);
        });

        it('should send and receive test event', (done) => {
            const testData = { message: 'Hello Server' };

            clientSocket.emit('test-event', testData);

            clientSocket.on('test-response', (data) => {
                expect(data).toEqual(testData);
                done();
            });
        });

        it('should request and receive leaderboard update', (done) => {
            clientSocket.emit('request-leaderboard');

            clientSocket.on('leaderboard-update', (data) => {
                expect(data).toHaveProperty('timestamp');
                expect(data).toHaveProperty('topContributors');
                expect(Array.isArray(data.topContributors)).toBe(true);
                done();
            });
        });
    });

    describe('Real-time Update Tests', () => {
        let client1;
        let client2;

        beforeEach((done) => {
            let connectedCount = 0;
            const checkConnected = () => {
                connectedCount++;
                if (connectedCount === 2) done();
            };

            client1 = ioClient(`http://localhost:${TEST_PORT}`);
            client2 = ioClient(`http://localhost:${TEST_PORT}`);

            client1.on('connect', checkConnected);
            client2.on('connect', checkConnected);
        });

        afterEach(() => {
            if (client1?.connected) client1.disconnect();
            if (client2?.connected) client2.disconnect();
        });

        it('should broadcast PR update to other clients', (done) => {
            const prData = {
                username: 'testuser',
                prCount: 5
            };

            // Client 2 listens for PR updates
            client2.on('pr-update', (data) => {
                expect(data.username).toBe('testuser');
                expect(data.prCount).toBe(5);
                done();
            });

            // Client 1 emits new PR
            setTimeout(() => {
                client1.emit('new-pr', prData);
            }, 100);
        });

        it('should not receive own broadcasts', (done) => {
            const prData = {
                username: 'selftest',
                prCount: 3
            };

            let receivedUpdate = false;

            // Client 1 listens for its own broadcast
            client1.on('pr-update', () => {
                receivedUpdate = true;
            });

            // Client 1 emits new PR
            client1.emit('new-pr', prData);

            // Wait and verify client1 didn't receive its own broadcast
            setTimeout(() => {
                expect(receivedUpdate).toBe(false);
                done();
            }, 200);
        });
    });

    describe('Badge Award Events', () => {
        beforeEach((done) => {
            clientSocket = ioClient(`http://localhost:${TEST_PORT}`);
            clientSocket.on('connect', done);
        });

        it('should receive badge awarded event', (done) => {
            const badgeData = {
                username: 'achiever',
                badge: '10 PR badge',
                badgeImage: '10_pr_badge.png'
            };

            clientSocket.on('badge-awarded', (data) => {
                expect(data.username).toBe('achiever');
                expect(data.badge).toBe('10 PR badge');
                expect(data.badgeImage).toBe('10_pr_badge.png');
                done();
            });

            // Simulate server emitting badge event
            setTimeout(() => {
                ioServer.emit('badge-awarded', badgeData);
            }, 50);
        });

        it('should receive multiple badge events in sequence', (done) => {
            const badges = [
                { username: 'user1', badge: '1st PR badge' },
                { username: 'user2', badge: '10 PR badge' },
                { username: 'user3', badge: '50 PR badge' }
            ];

            const receivedBadges = [];

            clientSocket.on('badge-awarded', (data) => {
                receivedBadges.push(data);

                if (receivedBadges.length === 3) {
                    expect(receivedBadges).toHaveLength(3);
                    expect(receivedBadges[0].username).toBe('user1');
                    expect(receivedBadges[1].username).toBe('user2');
                    expect(receivedBadges[2].username).toBe('user3');
                    done();
                }
            });

            // Emit badges sequentially
            badges.forEach((badge, index) => {
                setTimeout(() => {
                    ioServer.emit('badge-awarded', badge);
                }, 50 * (index + 1));
            });
        });
    });

    describe('Streak Events', () => {
        beforeEach((done) => {
            clientSocket = ioClient(`http://localhost:${TEST_PORT}`);
            clientSocket.on('connect', done);
        });

        it('should receive streak update event', (done) => {
            const streakData = {
                username: 'streaker',
                currentStreak: 15,
                longestStreak: 20
            };

            clientSocket.on('streak-update', (data) => {
                expect(data.username).toBe('streaker');
                expect(data.currentStreak).toBe(15);
                expect(data.longestStreak).toBe(20);
                done();
            });

            setTimeout(() => {
                ioServer.emit('streak-update', streakData);
            }, 50);
        });

        it('should receive streak broken event', (done) => {
            const streakData = {
                username: 'unfortunate',
                oldStreak: 30,
                currentStreak: 1
            };

            clientSocket.on('streak-broken', (data) => {
                expect(data.username).toBe('unfortunate');
                expect(data.oldStreak).toBe(30);
                expect(data.currentStreak).toBe(1);
                done();
            });

            setTimeout(() => {
                ioServer.emit('streak-broken', streakData);
            }, 50);
        });
    });

    describe('Challenge Events', () => {
        beforeEach((done) => {
            clientSocket = ioClient(`http://localhost:${TEST_PORT}`);
            clientSocket.on('connect', done);
        });

        it('should receive challenge progress update', (done) => {
            const progressData = {
                username: 'challenger',
                challengeId: 'challenge123',
                challengeName: 'Sprint Master',
                progress: 3,
                target: 5,
                percentComplete: 60
            };

            clientSocket.on('challenge-progress', (data) => {
                expect(data.username).toBe('challenger');
                expect(data.progress).toBe(3);
                expect(data.target).toBe(5);
                expect(data.percentComplete).toBe(60);
                done();
            });

            setTimeout(() => {
                ioServer.emit('challenge-progress', progressData);
            }, 50);
        });

        it('should receive challenge completed event', (done) => {
            const completionData = {
                username: 'winner',
                challengeId: 'challenge456',
                challengeName: 'Review Champion',
                reward: 250,
                totalPoints: 1500
            };

            clientSocket.on('challenge-completed', (data) => {
                expect(data.username).toBe('winner');
                expect(data.challengeName).toBe('Review Champion');
                expect(data.reward).toBe(250);
                expect(data.totalPoints).toBe(1500);
                done();
            });

            setTimeout(() => {
                ioServer.emit('challenge-completed', completionData);
            }, 50);
        });
    });

    describe('Error Handling', () => {
        beforeEach((done) => {
            clientSocket = ioClient(`http://localhost:${TEST_PORT}`);
            clientSocket.on('connect', done);
        });

        it('should handle connection errors gracefully', (done) => {
            const errorClient = ioClient('http://localhost:9999', {
                reconnection: false,
                timeout: 1000
            });

            errorClient.on('connect_error', (error) => {
                expect(error).toBeDefined();
                errorClient.close();
                done();
            });
        });

        it('should receive error events from server', (done) => {
            const errorData = {
                message: 'Test error',
                code: 'TEST_ERROR'
            };

            clientSocket.on('error-event', (data) => {
                expect(data.message).toBe('Test error');
                expect(data.code).toBe('TEST_ERROR');
                done();
            });

            setTimeout(() => {
                ioServer.emit('error-event', errorData);
            }, 50);
        });
    });

    describe('Room and Namespace Tests', () => {
        beforeEach((done) => {
            clientSocket = ioClient(`http://localhost:${TEST_PORT}`);
            clientSocket.on('connect', done);
        });

        it('should join and leave rooms', (done) => {
            clientSocket.emit('join-room', 'test-room');

            setTimeout(() => {
                // Verify socket joined room
                const socketRooms = Array.from(serverSocket.rooms);
                expect(socketRooms.includes('test-room')).toBe(true);

                clientSocket.emit('leave-room', 'test-room');

                setTimeout(() => {
                    const updatedRooms = Array.from(serverSocket.rooms);
                    expect(updatedRooms.includes('test-room')).toBe(false);
                    done();
                }, 50);
            }, 50);
        });
    });

    describe('Performance Tests', () => {
        beforeEach((done) => {
            clientSocket = ioClient(`http://localhost:${TEST_PORT}`);
            clientSocket.on('connect', done);
        });

        it('should handle rapid sequential events', (done) => {
            const eventCount = 50;
            let receivedCount = 0;

            clientSocket.on('rapid-event', () => {
                receivedCount++;
                if (receivedCount === eventCount) {
                    expect(receivedCount).toBe(eventCount);
                    done();
                }
            });

            for (let i = 0; i < eventCount; i++) {
                ioServer.emit('rapid-event', { id: i });
            }
        });

        it('should measure event round-trip time', (done) => {
            const startTime = Date.now();

            clientSocket.emit('test-event', { timestamp: startTime });

            clientSocket.on('test-response', (data) => {
                const endTime = Date.now();
                const roundTripTime = endTime - data.timestamp;

                expect(roundTripTime).toBeLessThan(100); // Should be fast
                done();
            });
        });
    });

    describe('Data Integrity Tests', () => {
        beforeEach((done) => {
            clientSocket = ioClient(`http://localhost:${TEST_PORT}`);
            clientSocket.on('connect', done);
        });

        it('should preserve data structure in events', (done) => {
            const complexData = {
                user: {
                    username: 'testuser',
                    stats: {
                        prs: 10,
                        reviews: 5
                    }
                },
                badges: ['1st PR', '10 PR'],
                timestamp: new Date().toISOString()
            };

            clientSocket.emit('test-event', complexData);

            clientSocket.on('test-response', (data) => {
                expect(data).toEqual(complexData);
                expect(data.user.stats.prs).toBe(10);
                expect(Array.isArray(data.badges)).toBe(true);
                done();
            });
        });

        it('should handle large payloads', (done) => {
            const largeArray = Array.from({ length: 1000 }, (_, i) => ({
                id: i,
                name: `User ${i}`,
                score: Math.random() * 1000
            }));

            clientSocket.emit('test-event', { users: largeArray });

            clientSocket.on('test-response', (data) => {
                expect(data.users).toHaveLength(1000);
                expect(data.users[0].id).toBe(0);
                expect(data.users[999].id).toBe(999);
                done();
            });
        });
    });
});
