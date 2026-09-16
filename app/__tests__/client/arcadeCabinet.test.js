/**
 * The arcade cabinet: the coin-to-play sequence, the playfield reshape that lets the game
 * fill a 4:3 tube, and the round trip back to the banner.
 *
 * The reshape cases are the important ones. The cabinet rewraps the contribution graph
 * from 53x7 into 24x16, which means COLS and ROWS change at runtime -- and that broke two
 * things that these tests now pin down.
 */

import { describe, test, expect } from '@jest/globals';
import { mountArcade } from './arcadeHarness.js';

const GAMES = ['pacman', 'snake', 'breakout', 'galaga', 'puzzlebobble'];

/** Open the cabinet, drop a coin, press START and wait out the power-on sweep. */
async function startGame(a, id) {
    a.el('arcade-play').click();
    if (id) {
        const sel = a.el('cab-select');
        sel.value = id;
        sel.dispatchEvent(new a.win.Event('change'));
    }
    a.el('cab-coin').click();
    a.el('cab-start').click();
    await new Promise((r) => a.win.setTimeout(r, 400));   // 350ms power-on
    a.run(4);
}

/** The HUD is drawn on the canvas, so read it back out of the recorded draw calls. */
function hudText(a) {
    return a.ops.filter((o) => o.op === 'fillText').map((o) => o.text);
}

function scoreFromHud(a) {
    const hit = hudText(a).find((t) => t.startsWith('SCORE '));
    return hit ? parseInt(hit.slice(6), 10) : null;
}

describe('opening and closing the cabinet', () => {
    test('Play moves the live canvas into the CRT and leaves the banner empty', async () => {
        const a = await mountArcade();
        const canvas = a.doc.querySelector('#arcade-graph canvas');

        a.el('arcade-play').click();

        expect(a.el('arcade-cabinet').open).toBe(true);
        expect(a.doc.querySelector('#cab-screen canvas')).toBe(canvas);   // the same node, moved
        expect(a.doc.querySelector('#arcade-graph canvas')).toBeNull();
        // One canvas in the document, which is the point: one rAF loop, one game.
        expect(a.doc.querySelectorAll('canvas').length).toBe(1);
    });

    test('the Play button advertises the dialog rather than a pressed state', async () => {
        const a = await mountArcade();
        const btn = a.el('arcade-play');

        expect(btn.getAttribute('aria-haspopup')).toBe('dialog');
        expect(btn.hasAttribute('aria-pressed')).toBe(false);
    });

    test('closing returns the canvas to the banner, at the banner width, in attract mode', async () => {
        const a = await mountArcade({ bannerWidth: 1000 });
        const opener = a.el('arcade-play');
        opener.focus();
        await startGame(a, 'pacman');

        a.el('arcade-cabinet').close();

        const canvas = a.doc.querySelector('#arcade-graph canvas');
        expect(canvas).not.toBeNull();
        expect(a.doc.querySelector('#cab-screen canvas')).toBeNull();
        expect(parseInt(canvas.style.width, 10)).toBe(1000);
        expect(parseInt(canvas.style.height, 10)).toBeLessThan(250);     // back to the strip
        expect(canvas.getAttribute('aria-hidden')).toBe('true');         // attract again
        expect(a.doc.activeElement).toBe(opener);                        // focus handed back
    });

    test('the close button gets you back to the leaderboard', async () => {
        const a = await mountArcade();
        await startGame(a, 'pacman');

        a.el('cab-close').click();

        expect(a.el('arcade-cabinet').open).toBe(false);
        expect(a.doc.querySelector('#arcade-graph canvas')).not.toBeNull();
    });

    test('clicking the backdrop closes it', async () => {
        const a = await mountArcade();
        const dlg = a.el('arcade-cabinet');
        await startGame(a, 'snake');

        // The listener only fires for a click whose target IS the dialog, i.e. the
        // backdrop area around the cabinet body.
        dlg.dispatchEvent(new a.win.MouseEvent('click', { bubbles: true }));

        expect(dlg.open).toBe(false);
        expect(a.doc.querySelector('#arcade-graph canvas')).not.toBeNull();
    });

    test('clicking inside the cabinet does not close it', async () => {
        const a = await mountArcade();
        const dlg = a.el('arcade-cabinet');
        await startGame(a, 'snake');

        a.doc.querySelector('.cab-body').dispatchEvent(new a.win.MouseEvent('click', { bubbles: true }));

        expect(dlg.open).toBe(true);
        expect(a.doc.querySelector('#cab-screen canvas')).not.toBeNull();
    });

    // Escape is deliberately absent here: jsdom has no <dialog>, so the harness polyfills
    // showModal/close and the browser's Escape-to-cancel default action does not exist to
    // be exercised. That path is verified by hand -- see "Getting back to the leaderboard"
    // in docs/ARCADE_REVIEW.md.

    test('the attract loop keeps running after the round trip', async () => {
        const a = await mountArcade();
        await startGame(a, 'snake');
        a.el('arcade-cabinet').close();
        a.run(2);

        a.clearOps();
        a.run(3);
        expect(a.ops.length).toBeGreaterThan(50);
    });
});

describe('the coin sequence', () => {
    test('the screen shows INSERT COIN until a credit is spent', async () => {
        const a = await mountArcade();
        a.el('arcade-play').click();

        const screen = a.el('cab-screen');
        expect(screen.className).toContain('cab-screen--off');
        expect(a.el('cab-credits').textContent).toBe('CREDITS 0');
    });

    test('a coin buys a credit; START spends it and starts the game', async () => {
        const a = await mountArcade();
        a.el('arcade-play').click();

        a.el('cab-coin').click();
        expect(a.el('cab-credits').textContent).toBe('CREDITS 1');

        a.el('cab-start').click();
        expect(a.el('cab-credits').textContent).toBe('CREDITS 0');
        await new Promise((r) => a.win.setTimeout(r, 400));
        a.run(2);

        expect(a.el('cab-screen').className).not.toContain('cab-screen--off');
        expect(a.doc.querySelector('canvas').getAttribute('role')).toBe('application');
    });

    test('START with no credit does not start anything', async () => {
        const a = await mountArcade();
        a.el('arcade-play').click();

        a.el('cab-start').click();
        await new Promise((r) => a.win.setTimeout(r, 400));

        expect(a.el('cab-credits').textContent).toBe('CREDITS 0');
        expect(a.el('cab-screen').className).toContain('cab-screen--off');
        expect(a.doc.querySelector('canvas').getAttribute('role')).not.toBe('application');
    });

    test('the playing canvas is focusable and describes itself', async () => {
        const a = await mountArcade();
        await startGame(a, 'pacman');

        const canvas = a.doc.querySelector('canvas');
        expect(canvas.tabIndex).toBe(0);
        expect(canvas.hasAttribute('aria-hidden')).toBe(false);
        expect(canvas.getAttribute('role')).toBe('application');
        expect(canvas.getAttribute('aria-label')).toMatch(/Pac-Man/);
        expect(canvas.getAttribute('aria-label')).toMatch(/Escape/);
    });
});

describe('the cabinet game picker', () => {
    // A modal <dialog> blocks the page, so the banner's picker is unreachable while the
    // cabinet is open. Without one inside, you had to close the cabinet to change game.
    test('lists every game, and no Random entry', async () => {
        const a = await mountArcade();
        a.el('arcade-play').click();

        expect([...a.el('cab-select').options].map((o) => o.value)).toEqual(GAMES);
    });

    test('switching game updates the marquee and the banner picker together', async () => {
        const a = await mountArcade();
        a.el('arcade-play').click();

        const sel = a.el('cab-select');
        sel.value = 'galaga';
        sel.dispatchEvent(new a.win.Event('change'));

        expect(a.el('cab-marquee').textContent).toMatch(/Galaga/);
        expect(a.el('arcade-select').value).toBe('galaga');
    });

    test('the marquee names the game that is actually loaded on open', async () => {
        const a = await mountArcade();
        const banner = a.el('arcade-select');
        banner.value = 'breakout';
        banner.dispatchEvent(new a.win.Event('change'));

        a.el('arcade-play').click();

        expect(a.el('cab-marquee').textContent).toMatch(/Breakout/);
        expect(a.el('cab-select').value).toBe('breakout');
    });
});

describe('the playfield fills the tube (the reshape)', () => {
    // The banner grid is 53x7, about 7.6:1. Dropped into a 4:3 cabinet as-is it is a thin
    // ribbon, and scaling cannot fix it because the grid's height follows its width. The
    // cabinet rewraps the same days into 24x16 instead.
    test.each(GAMES)('%s covers most of the CRT in both directions', async (id) => {
        const a = await mountArcade({ tube: [800, 600] });
        await startGame(a, id);

        a.clearOps();
        a.run(2);
        const box = a.bbox();

        expect(box).not.toBeNull();
        expect(box.width / 800).toBeGreaterThan(0.85);
        // The pre-reshape ribbon covered about 17% of the height. Anything near that is a
        // regression back to the banner aspect.
        expect(box.height / 600).toBeGreaterThan(0.75);
    });

    test('the banner still draws a short wide strip, unchanged', async () => {
        const a = await mountArcade({ bannerWidth: 1000 });
        a.clearOps();
        a.run(2);
        const box = a.bbox();

        expect(box.width / 1000).toBeGreaterThan(0.85);
        expect(box.height).toBeLessThan(200);
        expect(box.width / box.height).toBeGreaterThan(4);   // still a ribbon, by design
    });

    test('the reshape needs no second request for the grid', async () => {
        const a = await mountArcade();
        const before = a.fetchCalls.length;

        await startGame(a, 'pacman');
        a.el('arcade-cabinet').close();
        await startGame(a, 'snake');

        // The raw day counts are cached, so reshaping rewraps them in place.
        expect(a.fetchCalls.length).toBe(before);
    });

    test('the canvas matches the CRT box exactly, in both orientations of tube', async () => {
        for (const [w, h] of [[800, 600], [400, 300]]) {
            const a = await mountArcade({ tube: [w, h] });
            a.el('arcade-play').click();
            const canvas = a.doc.querySelector('#cab-screen canvas');
            expect(parseInt(canvas.style.width, 10)).toBe(w);
            expect(parseInt(canvas.style.height, 10)).toBe(h);
        }
    });
});

describe('the reshape does not corrupt game state', () => {
    // PacMan() closes over START = { c: GH_COL, r: ROWS - 1 } at CONSTRUCTION time. After
    // narrowing to 24 columns the captured column 26 indexed past the pellet grid and threw
    // "Cannot set properties of undefined". attach() now rebuilds the game object rather
    // than re-initialising it.
    test.each(GAMES)('%s survives banner -> cabinet -> banner without throwing', async (id) => {
        const a = await mountArcade();
        const errors = [];
        a.win.addEventListener('error', (e) => errors.push(e.message));

        const banner = a.el('arcade-select');
        banner.value = id;
        banner.dispatchEvent(new a.win.Event('change'));
        a.run(5);

        await startGame(a, id);
        a.run(40);

        a.el('arcade-cabinet').close();
        a.run(40);

        // A second trip, because the first reshape is the one that used to break.
        await startGame(a, id);
        a.run(40);

        expect(errors).toEqual([]);
        expect(a.doc.querySelector('canvas')).not.toBeNull();
    });

    test('every game can be selected in turn inside one cabinet session', async () => {
        const a = await mountArcade();
        a.el('arcade-play').click();
        const sel = a.el('cab-select');

        for (const id of GAMES) {
            sel.value = id;
            sel.dispatchEvent(new a.win.Event('change'));
            a.el('cab-coin').click();
            a.el('cab-start').click();
            await new Promise((r) => a.win.setTimeout(r, 400));
            a.run(20);
            expect(a.el('cab-marquee').textContent.length).toBeGreaterThan(0);
        }
        expect(a.doc.querySelectorAll('canvas').length).toBe(1);
    });
});

describe('the cabinet HUD', () => {
    test('reports score, level and lives inside the tube, not over the playfield', async () => {
        const a = await mountArcade({ tube: [800, 600] });
        await startGame(a, 'pacman');

        a.clearOps();
        a.run(2);
        const text = hudText(a);

        // Level and lives share one right-aligned string, e.g. "LV 1   LIVES 3".
        expect(text.some((t) => t.startsWith('SCORE '))).toBe(true);
        expect(text.join(' ')).toMatch(/LV \d/);
        expect(text.join(' ')).toMatch(/LIVES \d/);
        // Lives as a number, not repeated heart glyphs a screen reader spells out.
        expect(text.join(' ')).not.toMatch(/♥/);

        for (const o of a.ops.filter((x) => x.op === 'fillText')) {
            expect(o.x).toBeGreaterThanOrEqual(0);
            expect(o.y).toBeGreaterThanOrEqual(0);
            expect(o.y).toBeLessThanOrEqual(600);
        }
    });

    // On the banner the player's actor sits in the apron below the grid. In the cabinet that
    // band is the HUD's, so the actor has to move onto the last playfield row -- otherwise
    // the paddle is drawn straight through "ESC TO EXIT". Breakout's draw also kept its own
    // copy of that baseline and disagreed with its own collision line.
    test.each(['breakout', 'galaga', 'puzzlebobble'])(
        '%s draws its player clear of the exit hint',
        async (id) => {
            const a = await mountArcade({ tube: [800, 600] });
            await startGame(a, id);

            a.clearOps();
            a.run(2);

            const hint = a.ops.find((o) => o.op === 'fillText' && o.text === 'ESC TO EXIT');
            expect(hint).toBeDefined();

            const lowestDrawn = Math.max(
                ...a.ops.filter((o) => o.op !== 'fillText' && Number.isFinite(o.y))
                    .map((o) => o.y + (o.h || 0))
            );
            // fillText y is the text's top edge here (textBaseline is 'top').
            expect(lowestDrawn).toBeLessThanOrEqual(hint.y);
        }
    );

    test('the DOM score stays empty while the cabinet draws its own HUD', async () => {
        const a = await mountArcade();
        await startGame(a, 'breakout');
        a.run(5);

        expect(a.el('arcade-score').textContent).toBe('');
    });

    // The resize handler used to call game.init(), a full state wipe, on any resize event.
    test('a resize that changes nothing does not reset the score', async () => {
        const a = await mountArcade({ tube: [800, 600] });
        await startGame(a, 'breakout');
        a.run(200, 16);                       // play long enough to bank some points

        a.clearOps();
        a.run(2);
        const before = scoreFromHud(a);
        expect(before).toBeGreaterThan(0);

        a.win.dispatchEvent(new a.win.Event('resize'));
        await new Promise((r) => a.win.setTimeout(r, 250));

        a.clearOps();
        a.run(2);
        expect(scoreFromHud(a)).toBeGreaterThanOrEqual(before);
    });
});

describe('the control panel is real input', () => {
    test('a d-pad press steers, and releasing clears it', async () => {
        const a = await mountArcade();
        await startGame(a, 'snake');

        const left = a.el('cab-pad-left');
        left.dispatchEvent(new a.win.Event('pointerdown', { bubbles: true, cancelable: true }));

        expect(left.className).toContain('is-down');
        expect(a.el('cab-stick').getAttribute('data-dir')).toBe('left');

        left.dispatchEvent(new a.win.Event('pointerup', { bubbles: true }));
        expect(left.className).not.toContain('is-down');
        expect(a.el('cab-stick').hasAttribute('data-dir')).toBe(false);
    });

    test('the fire button reports its pressed state', async () => {
        const a = await mountArcade();
        await startGame(a, 'galaga');

        const fire = a.el('cab-fire');
        fire.dispatchEvent(new a.win.Event('pointerdown', { bubbles: true, cancelable: true }));
        expect(fire.className).toContain('is-down');
        fire.dispatchEvent(new a.win.Event('pointerup', { bubbles: true }));
        expect(fire.className).not.toContain('is-down');
    });
});

describe('view and script agree', () => {
    // mountArcade lifts the markup out of leaderboard.ejs, so this fails if the view drops
    // or renames an element the script reaches for by id.
    test.each([
        'arcade-graph', 'arcade-play', 'arcade-select', 'arcade-score',
        'arcade-cabinet', 'cab-screen', 'cab-marquee', 'cab-coin', 'cab-start',
        'cab-close', 'cab-credits', 'cab-stick', 'cab-fire', 'cab-select',
        'cab-pad-left', 'cab-pad-right', 'cab-pad-up', 'cab-pad-down'
    ])('leaderboard.ejs still provides #%s', async (id) => {
        const a = await mountArcade();
        expect(a.el(id)).not.toBeNull();
    });
});
