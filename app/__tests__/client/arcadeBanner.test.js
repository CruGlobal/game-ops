/**
 * The arcade banner: boot, layout, input and accessibility.
 *
 * Every case here is a regression test for a defect that shipped, or for an invariant the
 * cabinet now depends on. See docs/ARCADE_REVIEW.md for the reproductions.
 */

import { describe, test, expect } from '@jest/globals';
import { mountArcade, defaultCells } from './arcadeHarness.js';

describe('arcade banner boot', () => {
    test('mounts a canvas sized to its container and starts in attract mode', async () => {
        const a = await mountArcade({ bannerWidth: 1000 });

        const canvas = a.doc.querySelector('#arcade-graph canvas');
        expect(canvas).not.toBeNull();
        expect(parseInt(canvas.style.width, 10)).toBe(1000);
        // The strip is short: 7 rows plus the apron, nowhere near square.
        expect(parseInt(canvas.style.height, 10)).toBeLessThan(250);
        expect(a.el('arcade-graph').className).not.toContain('arcade-graph--failed');
    });

    test('requests the contribution grid and renders once it arrives', async () => {
        const a = await mountArcade();

        expect(a.fetchCalls.some((u) => u.includes('/api/contributions/grid'))).toBe(true);
        a.clearOps();
        a.run(3);
        expect(a.ops.length).toBeGreaterThan(50);   // a grid's worth of cells, not a blank frame
    });

    test('falls back to a synthetic grid when the API fails, rather than hiding the banner', async () => {
        const a = await mountArcade({ gridStatus: 500 });

        expect(a.doc.querySelector('#arcade-graph canvas')).not.toBeNull();
        expect(a.el('arcade-graph').className).not.toContain('arcade-graph--failed');
        a.clearOps();
        a.run(3);
        expect(a.ops.length).toBeGreaterThan(50);
    });

    test('offers every game in the picker, labelled, with no markup injection', async () => {
        const a = await mountArcade();
        const sel = a.el('arcade-select');

        expect([...sel.options].map((o) => o.value))
            .toEqual(['random', 'pacman', 'snake', 'breakout', 'galaga', 'puzzlebobble']);
        // Built with createElement/textContent, so the label is text, not parsed HTML.
        expect(sel.options[1].childElementCount).toBe(0);
        expect(sel.options[1].textContent).toContain('Pac-Man');
    });
});

describe('layout (regression: the canvas used to pin its own width)', () => {
    // computeLayout read canvas.clientWidth AFTER setting canvas.style.width, so every later
    // call read back its own last value. The banner froze at its first-paint width and
    // overflowed its card when the window shrank.
    test('re-measures from the mount, so the canvas follows a resize', async () => {
        const a = await mountArcade({ bannerWidth: 1000 });
        const canvas = a.doc.querySelector('#arcade-graph canvas');
        expect(parseInt(canvas.style.width, 10)).toBe(1000);

        a.sizeStub(a.el('arcade-graph'), 600, 0);
        a.win.dispatchEvent(new a.win.Event('resize'));
        await new Promise((r) => a.win.setTimeout(r, 250));   // 200ms debounce

        expect(parseInt(canvas.style.width, 10)).toBe(600);
    });

    // The wipe-on-resize regression is asserted against a running score in
    // arcadeCabinet.test.js, where the HUD makes the score readable.
    test('a resize that changes nothing leaves the canvas alone', async () => {
        const a = await mountArcade({ bannerWidth: 1000 });
        const canvas = a.doc.querySelector('#arcade-graph canvas');
        const before = [canvas.style.width, canvas.style.height, canvas.width, canvas.height];

        a.win.dispatchEvent(new a.win.Event('resize'));
        await new Promise((r) => a.win.setTimeout(r, 250));

        expect([canvas.style.width, canvas.style.height, canvas.width, canvas.height]).toEqual(before);
    });
});

describe('storage (regression: an unguarded read hid the whole banner)', () => {
    // localStorage throws outright in a storage-blocked browser. boot() caught it and added
    // arcade-graph--failed, which is display:none, so the arcade silently disappeared.
    test('survives a browser where localStorage throws', async () => {
        const a = await mountArcade({ breakStorage: true });

        expect(a.doc.querySelector('#arcade-graph canvas')).not.toBeNull();
        expect(a.el('arcade-graph').className).not.toContain('arcade-graph--failed');
        expect([...a.el('arcade-select').options].length).toBeGreaterThan(1);
    });
});

describe('accessibility', () => {
    test('the attract-mode canvas is decoration: no tab stop, not in the a11y tree', async () => {
        const a = await mountArcade();
        const canvas = a.doc.querySelector('canvas');

        expect(canvas.tabIndex).toBe(-1);
        expect(canvas.getAttribute('aria-hidden')).toBe('true');
        expect(canvas.getAttribute('role')).toBeNull();
    });

    // #arcade-score is aria-live, and it used to be rewritten on every frame, which a
    // screen reader announces every time.
    test('the score region is only written when its text actually changes', async () => {
        const a = await mountArcade();
        const score = a.el('arcade-score');

        let writes = 0;
        const proto = Object.getOwnPropertyDescriptor(a.win.Node.prototype, 'textContent');
        Object.defineProperty(score, 'textContent', {
            configurable: true,
            get() { return proto.get.call(this); },
            set(v) { writes++; proto.set.call(this, v); }
        });

        // The very first frame initialises the region from null to the empty string. Every
        // frame after that must leave it alone -- before the fix this was one write per frame,
        // so 40 frames meant 40 announcements.
        a.run(1);
        const afterInit = writes;
        expect(afterInit).toBeLessThanOrEqual(1);

        a.run(40);
        expect(writes).toBe(afterInit);
        expect(score.textContent).toBe('');
    });

    test('the score region is written once when a value first appears, not per frame', async () => {
        const a = await mountArcade();
        a.el('arcade-play').click();
        if (a.el('arcade-cabinet').open) {
            a.el('cab-coin').click();
            a.el('cab-start').click();
            await new Promise((r) => a.win.setTimeout(r, 400));
        }
        a.run(5);

        const score = a.el('arcade-score');
        let writes = 0;
        const proto = Object.getOwnPropertyDescriptor(a.win.Node.prototype, 'textContent');
        Object.defineProperty(score, 'textContent', {
            configurable: true,
            get() { return proto.get.call(this); },
            set(v) { writes++; proto.set.call(this, v); }
        });

        // 30 frames in which the score does not change must not re-announce it.
        a.run(30, 4);
        expect(writes).toBeLessThanOrEqual(1);
    });
});

describe('play-mode input (regression: WASD was stolen from the page)', () => {
    // The keydown listener is on window and preventDefault'ed any direction key without
    // checking the target, so with Play active, typing "dashboard" into the leaderboard
    // search box silently dropped the d, a and s.
    async function inPlayMode() {
        const a = await mountArcade();
        a.el('arcade-play').click();
        // The cabinet opens on Play; coin up and start so a game is actually running.
        if (a.el('arcade-cabinet').open) {
            a.el('cab-coin').click();
            a.el('cab-start').click();
            await new Promise((r) => a.win.setTimeout(r, 400));
        }
        a.run(3);
        return a;
    }

    test.each(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowLeft', 'ArrowRight'])(
        '%s typed into a text input reaches the input',
        async (code) => {
            const a = await inPlayMode();
            const input = a.el('search-input');
            input.focus();

            const ev = new a.win.KeyboardEvent('keydown', { code, bubbles: true, cancelable: true });
            input.dispatchEvent(ev);

            expect(ev.defaultPrevented).toBe(false);
        }
    );

    test('arrow keys in a <select> reach the select', async () => {
        const a = await inPlayMode();
        const sel = a.el('sort-select');
        const ev = new a.win.KeyboardEvent('keydown', { code: 'ArrowDown', bubbles: true, cancelable: true });
        sel.dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(false);
    });

    test('but the same key still steers the game when nothing is focused', async () => {
        const a = await inPlayMode();
        const ev = new a.win.KeyboardEvent('keydown', { code: 'ArrowUp', bubbles: true, cancelable: true });
        a.win.dispatchEvent(ev);
        expect(ev.defaultPrevented).toBe(true);
    });
});

describe('grid data', () => {
    /*
     * Breakout is pinned because it paints the contribution grid plainly -- ramp colour by
     * level, with the brick mask only changing alpha -- so the cell colours are the only
     * ones on screen besides the paddle and ball. Pac-Man draws a maze instead and never
     * shows the ramp at all, and the others mix in sprite palettes.
     *
     * jsdom sets none of the CSS custom properties, so readPalette() falls back to its
     * hard-coded defaults and the ramp is these five values.
     */
    const RAMP = ['#f0efef', '#bfe3ea', '#79c9d6', '#2ba6bd', '#007890'];
    const UNLIT = RAMP[0];
    const FULL = RAMP[4];

    async function fillsFor(counts) {
        const a = await mountArcade({
            game: 'breakout',
            cells: defaultCells().map((c, i) => ({ ...c, count: counts(i) }))
        });
        a.clearOps();
        a.run(1);
        return new Set(a.ops.map((o) => o.fillStyle).filter(Boolean));
    }

    test('a grid of empty days paints only the unlit end of the ramp', async () => {
        const quiet = await fillsFor(() => 0);

        expect(quiet.has(UNLIT)).toBe(true);
        expect(quiet.has(FULL)).toBe(false);
    });

    test('a grid of busy days paints the full end, and never the unlit colour', async () => {
        const busy = await fillsFor(() => 6);

        expect(busy.has(FULL)).toBe(true);
        expect(busy.has(UNLIT)).toBe(false);
    });

    test('a spread of counts reaches the middle of the ramp', async () => {
        const varied = await fillsFor((i) => i % 5);

        // Neither all-zero nor all-six can produce these, so their presence is the data
        // being read rather than a constant.
        const middle = RAMP.slice(1, 4).filter((c) => varied.has(c));
        expect(middle.length).toBeGreaterThanOrEqual(2);
    });
});
