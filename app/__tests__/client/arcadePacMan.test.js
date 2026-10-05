/**
 * Pac-Man's board: which cells carry a dot.
 *
 * Pac-Man paints every cell of the contribution grid first, column by column, each one a
 * roundRect (moveTo + four arcTo). A cell still holding a dot is painted at full alpha in
 * its ramp colour; an empty cell (eaten, or never a dot) is painted at 0.4 alpha. So the
 * board's dots can be read back out of the canvas recorder without reaching into
 * arcade.js internals.
 */

import { describe, test, expect } from '@jest/globals';
import { mountArcade, defaultCells } from './arcadeHarness.js';

const BANNER = { cols: 53, rows: 7 };
const CABINET = { cols: 24, rows: 16 };

/** The ghost house is the 3x2 box centred on the grid; Pac starts on the bottom row below it. */
function geometry({ cols, rows }) {
    const ghCol = Math.floor(cols / 2), ghRow = Math.floor(rows / 2);
    const pen = [];
    for (let c = ghCol - 1; c <= ghCol + 1; c++) for (let r = ghRow - 1; r <= ghRow; r++) pen.push(`${c},${r}`);
    return { pen, start: `${ghCol},${rows - 1}` };
}

/** cell "c,r" -> true if it is drawn as a dot this frame. */
function dots(a, { cols, rows }) {
    const cells = [];
    for (let i = 0; i < a.ops.length - 4 && cells.length < cols * rows; i++) {
        if (a.ops[i].op === 'moveTo' && a.ops[i + 1].op === 'arcTo') { cells.push(a.ops[i]); i += 4; }
    }
    expect(cells.length).toBe(cols * rows);
    const out = new Map();
    cells.forEach((o, i) => out.set(`${Math.floor(i / rows)},${i % rows}`, o.globalAlpha === 1));
    return out;
}

async function banner(counts) {
    const a = await mountArcade({
        game: 'pacman',
        cells: defaultCells().map((c, i) => ({ ...c, count: counts(i) }))
    });
    a.clearOps();
    a.run(1);
    return dots(a, BANNER);
}

async function cabinet(counts) {
    const a = await mountArcade({
        game: 'pacman',
        cells: defaultCells().map((c, i) => ({ ...c, count: counts(i) }))
    });
    a.el('arcade-play').click();
    a.el('cab-coin').click();
    a.el('cab-start').click();
    await new Promise((r) => a.win.setTimeout(r, 400));   // 350ms power-on
    a.clearOps();
    a.run(1);
    return dots(a, CABINET);
}

describe('the ghost house holds no dots', () => {
    /*
     * The ghost house is a dead end with one door, and it is where every ghost starts and
     * where an eaten ghost's eyes go back to. Dots inside it were reachable in principle,
     * but left for last they meant walking into the box the ghosts come back to, and the
     * round only ends when every dot is gone. The arcade game it copies never put dots there.
     */
    test.each([
        ['banner', BANNER, banner],
        ['cabinet', CABINET, cabinet]
    ])('%s: every ghost-house cell is empty on a busy grid', async (_name, grid, load) => {
        const board = await load(() => 6);
        const { pen } = geometry(grid);

        for (const cell of pen) expect([cell, board.get(cell)]).toEqual([cell, false]);
    });

    test.each([
        ['banner', BANNER, banner],
        ['cabinet', CABINET, cabinet]
    ])('%s: every other cell is still a dot, except where Pac starts', async (_name, grid, load) => {
        const board = await load(() => 6);
        const { pen, start } = geometry(grid);

        for (const [cell, isDot] of board) {
            if (pen.includes(cell) || cell === start) continue;
            expect([cell, isDot]).toEqual([cell, true]);
        }
    });

    test('the empty-graph fallback, which dots the whole band, leaves the ghost house out too', async () => {
        const board = await banner(() => 0);
        const { pen } = geometry(BANNER);

        for (const cell of pen) expect([cell, board.get(cell)]).toEqual([cell, false]);
    });
});
