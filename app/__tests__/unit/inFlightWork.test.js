import { describe, it, expect } from '@jest/globals';
import { track, drain, pendingCount } from '../../lib/inFlightWork.js';

const later = (ms, value) => new Promise(resolve => setTimeout(() => resolve(value), ms));

describe('in-flight work draining', () => {
    it('waits for tracked work to finish before reporting drained', async () => {
        let finished = false;
        track(later(50).then(() => { finished = true; }));

        expect(pendingCount()).toBe(1);
        const result = await drain(2000);

        expect(result).toEqual({ drained: true, remaining: 0 });
        expect(finished).toBe(true);
        expect(pendingCount()).toBe(0);
    });

    it('reports work still outstanding when the deadline passes', async () => {
        // The grace period is finite — ECS SIGKILLs eventually — so the drain is
        // bounded and says what it could not finish rather than hanging.
        // Held open explicitly rather than with a long timer, so this test cannot leak
        // pending work into the ones after it.
        let release;
        const held = new Promise(resolve => { release = resolve; });
        track(held);

        const result = await drain(60);

        expect(result.drained).toBe(false);
        expect(result.remaining).toBeGreaterThan(0);

        release();
        await held;
        await new Promise(resolve => setImmediate(resolve)); // let the tracker deregister
    });

    it('does not let a rejected task block the drain', async () => {
        track(Promise.reject(new Error('processing blew up')).catch(() => { throw new Error('again'); }));
        await new Promise(resolve => setTimeout(resolve, 10));

        await expect(drain(500)).resolves.toMatchObject({ drained: true });
    });

    it('returns immediately when nothing is in flight', async () => {
        await expect(drain(1000)).resolves.toEqual({ drained: true, remaining: 0 });
    });
});
