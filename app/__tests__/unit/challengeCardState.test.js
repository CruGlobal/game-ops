// @ts-nocheck
import { describe, it, expect, beforeAll } from '@jest/globals';

// challenge-card-state.js is a classic browser script, not an ES module: it
// assigns to globalThis so the page can load it with a plain <script src>.
// Import it for that side effect, then read the function off globalThis.
let challengeCardState;

beforeAll(async () => {
    await import('../../public/challenge-card-state.js');
    challengeCardState = globalThis.challengeCardState;
});

const participant = (username, progress, completed = false) => ({
    contributor: { username },
    progress,
    completed
});

describe('challengeCardState', () => {
    it('should clamp percent at 100 when progress exceeds target', () => {
        const state = challengeCardState(
            { target: 5, reward: 250 },
            [participant('jason', 8, true)],
            'jason'
        );

        expect(state.progress).toBe(8);
        expect(state.target).toBe(5);
        expect(state.percent).toBe(100);
        expect(state.completed).toBe(true);
    });

    it('should report zero progress as an untouched challenge', () => {
        const state = challengeCardState(
            { target: 10 },
            [participant('jason', 0)],
            'jason'
        );

        expect(state.percent).toBe(0);
        expect(state.completed).toBe(false);
        expect(state.hasJoined).toBe(true);
    });

    it('should scale percent proportionally below target', () => {
        const state = challengeCardState(
            { target: 10 },
            [participant('jason', 5)],
            'jason'
        );

        expect(state.percent).toBe(50);
    });

    it('should not divide by zero when the target is missing', () => {
        const state = challengeCardState({}, [participant('jason', 3)], 'jason');

        expect(state.percent).toBe(0);
        expect(state.target).toBe(0);
    });

    it('should report a viewer with no participation as not joined', () => {
        const state = challengeCardState(
            { target: 5 },
            [participant('someone-else', 4)],
            'jason'
        );

        expect(state.hasJoined).toBe(false);
        expect(state.progress).toBe(0);
        expect(state.completed).toBe(false);
    });

    it('should match a participant carrying username at the top level', () => {
        // getActiveChallenges() nests the contributor, but other payloads
        // flatten it; the card matches on either shape.
        const state = challengeCardState(
            { target: 5 },
            [{ username: 'jason', progress: 2, completed: false }],
            'jason'
        );

        expect(state.hasJoined).toBe(true);
        expect(state.progress).toBe(2);
    });

    it('should count only participants with progress as engaged', () => {
        const participants = [
            participant('a', 4),
            participant('b', 0),
            participant('c', 1),
            participant('d', 0)
        ];

        const state = challengeCardState({ target: 5 }, participants, 'a');

        expect(state.engaged).toBe(2);
        expect(state.enrolled).toBe(4);
    });

    it('should report zeroes for an empty participant list', () => {
        const state = challengeCardState({ target: 5 }, [], 'jason');

        expect(state.engaged).toBe(0);
        expect(state.enrolled).toBe(0);
        expect(state.hasJoined).toBe(false);
    });

    it('should clamp percent at 100 for the websocket single-participant shape', () => {
        // updateChallengeProgress() in challenges-client.js calls the helper
        // with a single-entry roster built from the socket payload, not the
        // full participants array. Pin that contract here.
        const state = challengeCardState(
            { target: 5 },
            [{ username: 'jason', progress: 8 }],
            'jason'
        );

        expect(state.percent).toBe(100);
    });
});
