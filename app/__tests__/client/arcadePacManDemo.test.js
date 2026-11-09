/**
 * Pac-Man's attract-mode autopilot: it has to stay alive and keep the board moving.
 *
 * The banner runs Pac-Man as a demo. A demo death costs no life, it just puts Pac back on
 * its start cell and every ghost back in the pen, so an autopilot that walks into ghosts
 * never ends the round. It replays the same doomed walk instead: on the reported board Pac
 * kept dying on the way to a dot beside the ghost-house door, where every ghost leaves from.
 *
 * Everything is read off the canvas recorder, the same way arcadePacMan.test.js reads the
 * dots, so nothing reaches into arcade.js internals. Pac is the one arc a full cell wide.
 * Pac only ever moves one cell per tick (or across the tunnel), so any longer jump is a
 * reset, either a death or a cleared board.
 */

import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { mountArcade, defaultCells } from './arcadeHarness.js';

const BANNER = { cols: 53, rows: 7 };
// A true 60Hz frame. Actors step on whole frames (update() zeroes its accumulators), so a
// rounded 16ms frame speeds Pac up relative to the ghosts and hides the reported loop.
const FRAME_MS = 1000 / 60;
const GH_COL = Math.floor(BANNER.cols / 2), GH_ROW = Math.floor(BANNER.rows / 2);
// One cell left of the door above the pen's opening: the lane every released ghost walks out along.
const BESIDE_DOOR = { c: GH_COL - 1, r: GH_ROW - 2 };

/** Seeded PRNG, so ghost wandering and fruit placement replay identically every run. */
function seeded(seed) {
    return () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** The grid cells, in draw order (column-major), as their roundRect ops. */
function gridCells(ops, { cols, rows }) {
    const cells = [];
    for (let i = 0; i < ops.length - 4 && cells.length < cols * rows; i++) {
        if (ops[i].op === 'moveTo' && ops[i + 1].op === 'arcTo') { cells.push(ops.slice(i, i + 5)); i += 4; }
    }
    expect(cells.length).toBe(cols * rows);
    return cells;
}

/** One frame, read back: the cell Pac is drawn on. */
function readFrame(ops, grid) {
    const cells = gridCells(ops, grid);
    // roundRect: arcTo #1 lands on the cell's right edge, arcTo #2 on its left edge.
    const size = cells[0][1].x - cells[0][2].x;
    const ox = cells[0][2].x, oy = cells[0][0].y;
    const step = cells[1][0].y - cells[0][0].y;
    const pac = ops.filter((o) => o.op === 'arc' && Math.abs(o.w - size) < 0.01).pop();
    expect(pac).toBeDefined();
    return { c: Math.round((pac.x - ox) / step), r: Math.round((pac.y - oy) / step) };
}

/**
 * Run the banner demo for `seconds` and count deaths and cleared boards.
 *
 * The autopilot always picks a legal move, so Pac only stands still in the 0.7s pause after a
 * death: any 0.4s spent on one cell is a death, wherever it happened. A cleared board puts
 * Pac back on its start cell and sets it off on the first tick, so it shows up as a jump
 * followed by movement. The dot count can't spot it: a one-dot board is cleared and refilled
 * inside a single update, so no frame ever shows it empty.
 * @returns {{ deaths: number, clears: number }}
 */
function watchDemo(a, seconds, grid = BANNER) {
    const frames = [];
    const n = Math.round((seconds * 1000) / FRAME_MS);
    for (let i = 0; i < n; i++) {
        a.clearOps();
        a.step(FRAME_MS);
        frames.push(readFrame(a.ops, grid));
    }
    const settle = Math.round(400 / FRAME_MS);
    const same = (p, q) => p.c === q.c && p.r === q.r;
    let deaths = 0, clears = 0, still = 0;
    for (let i = 1; i < frames.length; i++) {
        const was = frames[i - 1], now = frames[i];
        still = same(was, now) ? still + 1 : 0;
        if (still === settle) deaths++;
        const dc = Math.abs(now.c - was.c), dr = Math.abs(now.r - was.r);
        if (dc + dr <= 1 || (dr === 0 && dc === grid.cols - 1)) continue;
        if (frames.slice(i + 1, i + 1 + settle).some((f) => !same(f, now))) clears++;
    }
    return { deaths, clears };
}

/**
 * A payload that lights exactly the given cells. Dates are worked out the way buildLevels
 * does it (local midnight, keyed by toISOString), so this holds in any time zone.
 */
function cellsLighting(targets, { cols, rows }) {
    const end = new Date(); end.setHours(0, 0, 0, 0);
    const start = new Date(end); start.setDate(start.getDate() - (cols * rows - 1));
    return targets.map(({ c, r }) => {
        const d = new Date(start); d.setDate(start.getDate() + c * rows + r);
        return { date: d.toISOString().slice(0, 10), count: 6 };
    });
}

// The board from the bug report, read off its screenshot: a cluster of dots at the far left
// and one beside the ghost-house door, which is the nearest dot to Pac's start cell.
const REPORTED = [
    [0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [14, 0], [16, 0],
    [0, 1], [1, 1], [8, 1], [9, 1], [10, 1], [14, 1], [16, 1], [BESIDE_DOOR.c, BESIDE_DOOR.r],
    [9, 2], [10, 2], [8, 3], [9, 3], [10, 3], [11, 3], [1, 4], [4, 4], [9, 4],
    [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 6], [8, 6], [9, 6]
].map(([c, r]) => ({ c, r }));

beforeEach(() => {
    jest.spyOn(Math, 'random').mockImplementation(seeded(0xC0FFEE));
});

describe('attract-mode Pac-Man', () => {
    test.each([
        ['the reported board', () => cellsLighting(REPORTED, BANNER)],
        ['a busy board', () => defaultCells().map((c) => ({ ...c, count: 6 }))]
    ])('stays out of the ghosts\' way on %s', async (_name, cells) => {
        const a = await mountArcade({ game: 'pacman', cells: cells() });

        const { deaths } = watchDemo(a, 60);

        expect(deaths).toBeLessThanOrEqual(1);
    });

    test('still goes in for a dot beside the ghost-house door', async () => {
        // Dodging by never going near the ghosts would pass the test above and still stall.
        const a = await mountArcade({ game: 'pacman', cells: cellsLighting([BESIDE_DOOR], BANNER) });

        const { clears } = watchDemo(a, 30);

        expect(clears).toBeGreaterThanOrEqual(2);
    });
});
