/**
 * Test harness for public/arcade.js.
 *
 * arcade.js is a browser IIFE with no exports and no build step, so it is loaded here the
 * way the page loads it -- by evaluating the real file against a jsdom window. Nothing is
 * stubbed out of the module itself; only the browser services it depends on are supplied.
 *
 * The markup is extracted from views/leaderboard.ejs rather than retyped, so these tests
 * fail if the view and the script ever disagree about an element id.
 *
 * Two things jsdom cannot give us, and how they are handled:
 *
 *   Layout. Every element measures 0x0, so computeLayout would fall back to its default
 *   width and the cabinet could not be measured at all. The harness defines clientWidth /
 *   clientHeight on the two mounts, which is the one place it stands in for the browser.
 *
 *   Canvas. There is no 2D context, so getContext returns a recorder. It captures every
 *   coordinate drawn, which is what lets the tests assert how much of the screen the
 *   playfield covers without reaching into arcade.js internals.
 *
 * requestAnimationFrame is queued rather than scheduled: call step(ms) to advance exactly
 * one frame with an exact dt. Game timing is therefore deterministic.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..', '..');
const ARCADE_JS = join(APP, 'public', 'arcade.js');
const LEADERBOARD_EJS = join(APP, 'views', 'leaderboard.ejs');

/** Pull the arcade section and the cabinet dialog straight out of the view. */
export function arcadeMarkup() {
    const src = readFileSync(LEADERBOARD_EJS, 'utf8');
    const section = src.match(/<section class="arcade-header"[\s\S]*?<\/section>/);
    const dialog = src.match(/<dialog id="arcade-cabinet"[\s\S]*?<\/dialog>/);
    if (!section) throw new Error('arcade <section> not found in leaderboard.ejs');
    if (!dialog) throw new Error('cabinet <dialog> not found in leaderboard.ejs');
    return section[0] + '\n' + dialog[0];
}

/**
 * Snapshot the paint state alongside the geometry. Without this, brightness is
 * structurally unobservable and any test about the contribution ramp is a tautology.
 */
function paint(rec, op) {
    op.fillStyle = rec.fillStyle;
    op.strokeStyle = rec.strokeStyle;
    op.globalAlpha = rec.globalAlpha;
    return op;
}

/** A 2D context that records what was drawn instead of rasterising it. */
function makeRecorder(ops) {
    const noop = () => {};
    const rec = {
    // state
        fillStyle: '#000', strokeStyle: '#000', font: '', globalAlpha: 1,
        lineWidth: 1, lineCap: 'butt', textAlign: 'start', textBaseline: 'alphabetic',
        imageSmoothingEnabled: true,
        // no-ops that carry no geometry
        save: noop, restore: noop, beginPath: noop, closePath: noop, fill: noop,
        stroke: noop, setLineDash: noop, setTransform: noop, clearRect: noop,
        drawImage: noop,
        // geometry we care about
        fillRect(x, y, w, h) { ops.push(paint(rec, { op: 'fillRect', x, y, w, h })); },
        arc(x, y, r) { ops.push(paint(rec, { op: 'arc', x: x - r, y: y - r, w: r * 2, h: r * 2 })); },
        arcTo(x1, y1, x2, y2) { ops.push(paint(rec, { op: 'arcTo', x: Math.min(x1, x2), y: Math.min(y1, y2), w: 0, h: 0 })); },
        moveTo(x, y) { ops.push(paint(rec, { op: 'moveTo', x, y, w: 0, h: 0 })); },
        lineTo(x, y) { ops.push(paint(rec, { op: 'lineTo', x, y, w: 0, h: 0 })); },
        fillText(text, x, y) { ops.push(paint(rec, { op: 'fillText', text: String(text), x, y, w: 0, h: 0 })); }
    };
    return rec;
}

function sizeStub(el, width, height) {
    Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => width });
    Object.defineProperty(el, 'clientHeight', { configurable: true, get: () => height });
}

/**
 * Boot arcade.js against the current jsdom document.
 *
 * @param {object} [opts]
 * @param {number} [opts.bannerWidth=1000]  width reported by #arcade-graph
 * @param {number} [opts.tube=[800,600]]    width/height reported by #cab-screen
 * @param {Array}  [opts.cells]             grid API payload, or null to force the fallback
 * @param {number} [opts.gridStatus=200]    HTTP status the grid endpoint returns
 * @param {boolean}[opts.breakStorage=false] make every localStorage access throw
 * @param {string} [opts.game]               pin the game instead of picking at random
 * @param {boolean}[opts.reducedMotion=false] report prefers-reduced-motion: reduce
 */
export async function mountArcade(opts = {}) {
    const bannerWidth = opts.bannerWidth ?? 1000;
    const [tubeW, tubeH] = opts.tube ?? [800, 600];
    const gridStatus = opts.gridStatus ?? 200;

    const win = globalThis.window;
    const doc = win.document;

    // --- browser services arcade.js expects -----------------------------------
    const motionListeners = [];
    win.matchMedia = (q) => ({
        media: String(q),
        matches: String(q).includes('prefers-reduced-motion') ? !!opts.reducedMotion : false,
        addEventListener: (_t, fn) => { motionListeners.push(fn); },
        removeEventListener() {}
    });

    const ops = [];
    win.HTMLCanvasElement.prototype.getContext = function () {
        if (!this.__rec) this.__rec = makeRecorder(ops);
        return this.__rec;
    };

    // A real browser lays a canvas out at its inline style width once one is set, and
    // `.arcade-canvas { width: 100% }` loses to that inline value. That is precisely what
    // the old pinned-width bug fed on: computeLayout set style.width and then read
    // clientWidth back. jsdom reports 0 for everything, which would make the bug
    // unreproducible, so model the browser here instead.
    const selfSized = (styleProp) => ({
        configurable: true,
        get() {
            const own = parseInt(this.style[styleProp], 10);
            if (Number.isFinite(own)) return own;
            const parent = this.parentElement;
            return parent ? parent[styleProp === 'width' ? 'clientWidth' : 'clientHeight'] : 0;
        }
    });
    Object.defineProperty(win.HTMLCanvasElement.prototype, 'clientWidth', selfSized('width'));
    Object.defineProperty(win.HTMLCanvasElement.prototype, 'clientHeight', selfSized('height'));

    // Queue frames instead of scheduling them, so tests drive the clock.
    let now = 0, nextId = 1;
    const frames = new Map();
    win.requestAnimationFrame = (cb) => { const id = nextId++; frames.set(id, cb); return id; };
    win.cancelAnimationFrame = (id) => { frames.delete(id); };
    // boot() defers itself; run it on the macrotask queue rather than when idle.
    win.requestIdleCallback = (cb) => win.setTimeout(cb, 0);

    const fetchCalls = [];
    win.fetch = globalThis.fetch = (url) => {
        fetchCalls.push(String(url));
        if (gridStatus !== 200) return Promise.resolve({ ok: false, status: gridStatus });
        return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ cells: opts.cells ?? defaultCells(), maxCount: 6 })
        });
    };

    // Both are feature-detected by arcade.js, so give it the real shape.
    const observed = [];
    class Obs {
        constructor(cb) { this.cb = cb; }
        observe(el) { observed.push(el); this.el = el; this.cb([{ isIntersecting: true, target: el }], this); }
        unobserve() {}
        disconnect() {}
    }
    win.IntersectionObserver = Obs;
    const resizeCbs = [];
    win.ResizeObserver = class { constructor(cb) { resizeCbs.push(cb); } observe() {} unobserve() {} disconnect() {} };

    // jsdom (bundled with Jest 29) has no <dialog> behaviour. Without this, arcade.js takes
    // its documented no-showModal fallback and the cabinet is never exercised.
    const dlgProto = win.HTMLDialogElement.prototype;
    if (typeof dlgProto.showModal !== 'function') {
        dlgProto.showModal = function () { this.setAttribute('open', ''); };
        dlgProto.close = function () {
            if (!this.hasAttribute('open')) return;
            this.removeAttribute('open');
            this.dispatchEvent(new win.Event('close'));
        };
        Object.defineProperty(dlgProto, 'open', {
            configurable: true,
            get() { return this.hasAttribute('open'); },
            set(v) { v ? this.setAttribute('open', '') : this.removeAttribute('open'); }
        });
    }

    // Each mount gets its own store, so a game pinned in one test cannot leak into the next.
    // The blocked variant throws from its METHODS rather than from a getter on window: a
    // throwing property getter also breaks jsdom's own teardown, which is not what we are
    // testing.
    const store = new Map();
    // boot() calls pickRandom() unless a game id is stored, so without this every mount
    // draws a different game. Harmless for most assertions, but it makes anything that
    // reads colour non-deterministic.
    if (opts.game) store.set('arcade-game', opts.game);
    const blocked = () => { throw new Error('SecurityError: storage is blocked'); };
    Object.defineProperty(win, 'localStorage', {
        configurable: true,
        writable: true,
        value: opts.breakStorage
            ? { getItem: blocked, setItem: blocked, removeItem: blocked, clear: blocked, key: blocked, length: 0 }
            : {
                getItem: (k) => (store.has(k) ? store.get(k) : null),
                setItem: (k, v) => { store.set(k, String(v)); },
                removeItem: (k) => { store.delete(k); },
                clear: () => store.clear(),
                key: (i) => [...store.keys()][i] ?? null,
                get length() { return store.size; }
            }
    });

    // --- the page -------------------------------------------------------------
    doc.body.innerHTML = arcadeMarkup() +
    '<input id="search-input"><select id="sort-select"><option>a</option></select>';

    sizeStub(doc.getElementById('arcade-graph'), bannerWidth, 0);
    sizeStub(doc.getElementById('cab-screen'), tubeW, tubeH);

    // --- run the real file ----------------------------------------------------
    const src = readFileSync(ARCADE_JS, 'utf8');

    new win.Function(src).call(win);

    const flush = async () => {
        for (let i = 0; i < 8; i++) await new Promise((r) => win.setTimeout(r, 0));
    };
    await flush();

    /** Advance exactly one queued frame by `ms`. */
    const step = (ms = 16) => {
        now += ms;
        const due = [...frames.values()];
        frames.clear();
        due.forEach((cb) => cb(now));
    };
    /** Advance `n` frames. */
    const run = (n = 10, ms = 16) => { for (let i = 0; i < n; i++) step(ms); };

    return {
        win, doc, ops, flush, step, run, fetchCalls, resizeCbs,
        /** Fire a prefers-reduced-motion change, as the OS setting being toggled would. */
        setReducedMotion: (v) => motionListeners.forEach((fn) => fn({ matches: !!v })),
        get frameCount() { return frames.size; },
        el: (id) => doc.getElementById(id),
        canvas: () => doc.querySelector('canvas'),
        clearOps: () => { ops.length = 0; },
        /** Bounding box of everything drawn since the last clearOps, in CSS px. */
        bbox: () => bboxOf(ops),
        sizeStub
    };
}

export function bboxOf(ops) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const o of ops) {
        if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) continue;
        minX = Math.min(minX, o.x);
        minY = Math.min(minY, o.y);
        maxX = Math.max(maxX, o.x + (o.w || 0));
        maxY = Math.max(maxY, o.y + (o.h || 0));
    }
    if (minX === Infinity) return null;
    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * A year of plausible daily counts: busy weekdays, quiet weekends, some zero days.
 *
 * Anchored to TODAY, never to a fixed date. buildLevels() walks back COLS * ROWS days
 * from `new Date()`, so a hard-coded end date stops covering the grid the moment the
 * clock passes it -- the most recent cells find no entry, fall back to a count of 0, and
 * an "every day is busy" fixture starts painting the unlit colour. That is not
 * hypothetical: this file shipped pinned to 2026-09-16 and the ramp tests failed the next
 * morning.
 *
 * The range runs two days past today because buildLevels builds local-midnight dates and
 * then keys them with toISOString() (see ARCADE_REVIEW 1.12), so east of UTC its last
 * cell can be tomorrow's UTC date. The slack absorbs that either way.
 */
export function defaultCells(days = 420) {
    const out = [];
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    end.setUTCDate(end.getUTCDate() + 2);
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(end);
        d.setUTCDate(d.getUTCDate() - i);
        const dow = d.getUTCDay();
        const base = dow === 0 || dow === 6 ? 0 : (i % 5);
        out.push({ date: d.toISOString().slice(0, 10), count: base });
    }
    return out;
}
