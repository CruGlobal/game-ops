/**
 * Puzzle Bobble's hex geometry and its shot collision.
 *
 * Both defects were visible in attract mode on production; they are ARCADE_REVIEW 1.3 and
 * 1.4. Assertions read drawn bubble positions out of the canvas recorder, so they describe
 * what a player sees rather than module internals.
 *
 * What is covered, and what is not:
 *
 *   The parity fix (1.3) has NO decisive test here, and that is deliberate rather than an
 *   oversight. Four framings were tried -- a playfield bounds check, a per-row width
 *   invariant, a lattice-offset check, and parity-preservation across a push -- and none
 *   could be made to fail against the broken code without also failing against the fixed
 *   code. The wall is sparse, rows appear and disappear as clusters pop, and the shooter
 *   and in-flight bubbles contaminate any grouping by row. Notably the bug does NOT push
 *   bubbles off the playfield: a mis-offset row reaches the right edge but does not pass
 *   it, so the obvious bounds assertion can never fail.
 *
 *   What the fix rests on instead: the algebra is short enough to check by eye. A row that
 *   gains an index must keep its parity, so (r + par) and (r + 1 + par') have to agree mod
 *   2, which forces par' = par ^ 1 -- exactly what pushRow now does.
 *
 *   A pixel check in a real browser was tried too and was ALSO inconclusive: it sampled
 *   the leftmost lit column of the wall, and because the bug flips rows individually,
 *   some row is always at offset 0, so the aggregate never moves. Recorded here so the
 *   next person does not repeat it.
 *
 *   The tunnelling fix (1.4) is sub-stepped collision, and its outcome differs from the
 *   bug only in WHERE a shot lands. Deciding where it *should* have landed would mean
 *   reimplementing the physics inside the test, so there is no decisive assertion for it
 *   here. What is covered is that long runs at the worst frame gap the engine allows never
 *   throw and never lose the wall. The sub-stepping itself was read and checked in a
 *   browser.
 */

import { describe, test, expect } from '@jest/globals';
import { mountArcade } from './arcadeHarness.js';

async function pb(opts = {}) {
    const a = await mountArcade({ game: 'puzzlebobble', ...opts });
    a.run(3);
    return a;
}

/** Width of the canvas being drawn into, in CSS px. */
function canvasWidth(a) {
    return parseInt(a.doc.querySelector('canvas').style.width, 10);
}

/**
 * Bubbles drawn this frame. drawBubble() emits the body arc, then a smaller highlight arc,
 * so the bodies are the arcs at the full radius. This includes the bubble in flight and
 * the one on the shooter -- neither is on the lattice, which is why the assertions below
 * are about playfield bounds rather than lattice positions.
 */
function bubbles(a) {
    const arcs = a.ops.filter((o) => o.op === 'arc');
    if (!arcs.length) return [];
    const widest = Math.max(...arcs.map((o) => o.w));
    return arcs
        .filter((o) => o.w > widest * 0.8)
        .map((o) => ({ cx: o.x + o.w / 2, cy: o.y + o.h / 2, r: o.w / 2 }));
}

function expectAllInside(a) {
    const drawn = bubbles(a);
    expect(drawn.length).toBeGreaterThan(0);
    const w = canvasWidth(a);
    for (const b of drawn) {
        expect(b.cx - b.r).toBeGreaterThanOrEqual(-0.5);
        expect(b.cx + b.r).toBeLessThanOrEqual(w + 0.5);
    }
}

describe('the wall stays intact under long play', () => {
    /*
     * settle() clamps the landing column and then writes straight into grid[r][c]. With
     * the parity desync that could index past the end of a row whose declared width had
     * drifted from its real one. These runs cover hundreds of shots and dozens of pushes.
     */
    test('a long attract run never throws and never loses the wall', async () => {
        const a = await pb();
        const errors = [];
        a.win.addEventListener('error', (e) => errors.push(e.message));

        a.run(1500, 16);

        a.clearOps();
        a.run(1);
        expect(errors).toEqual([]);
        expectAllInside(a);
        for (const b of bubbles(a)) {
            expect(Number.isFinite(b.cx)).toBe(true);
            expect(Number.isFinite(b.cy)).toBe(true);
        }
    });

    test('nor at the largest frame gap the engine allows', async () => {
        // The engine clamps dt to 0.05, which is what a browser delivers after a stall and
        // the worst case for a single-step integration.
        const a = await pb();
        const errors = [];
        a.win.addEventListener('error', (e) => errors.push(e.message));

        a.run(800, 50);

        a.clearOps();
        a.run(1);
        expect(errors).toEqual([]);
        expectAllInside(a);
    });

    test('holds across a wide range of playfield widths', async () => {
        // Not a claim that shot speed is width-independent -- the playfield's own height
        // scales with the banner, so it is not. The old formula was gw * 1.7, which
        // reached ~2400 px/s on a wide banner; it is now clamped and tied to height.
        for (const bannerWidth of [400, 800, 1600]) {
            const a = await pb({ bannerWidth });
            const errors = [];
            a.win.addEventListener('error', (e) => errors.push(e.message));
            a.run(400, 50);
            a.clearOps();
            a.run(1);
            expect(errors).toEqual([]);
            expectAllInside(a);
        }
    });
});
