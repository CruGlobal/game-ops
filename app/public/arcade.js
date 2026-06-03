/*
 * Self-hosted, playable arcade header for Game Ops.
 *
 * A GitHub-style contribution grid (53 weeks x 7 days), driven by real team
 * activity (GET /api/contributions/grid), is the playfield for one of three
 * retro games — Pac-Man, Snake, Breakout.
 *
 *   - Attract mode (default): the game plays itself as an ambient animation.
 *   - Play mode: press "Play" to take keyboard control (arrows / WASD; mouse or
 *     arrows for the Breakout paddle), with score, lives, win/lose and restart.
 *     Esc returns to attract mode.
 *
 * A different game is picked at random each load; the selector pins one
 * (persisted in localStorage).
 *
 * Self-contained vanilla JS + Canvas — no CDN, no build step, no eval (served
 * same-origin, satisfies CSP `script-src 'self'`). One cooperative
 * requestAnimationFrame loop that pauses when the tab is hidden or the header
 * scrolls out of view, and renders a single static frame under
 * prefers-reduced-motion. It cannot block the main thread.
 */
(function () {
    'use strict';

    var MOUNT = 'arcade-graph';
    var SELECT = 'arcade-select';
    var PLAY_BTN = 'arcade-play';
    var SCORE_EL = 'arcade-score';
    var STORAGE_KEY = 'arcade-game';
    var COLS = 53, ROWS = 7;
    var GH_COL = Math.floor(COLS / 2), GH_ROW = Math.floor(ROWS / 2); // ghost-house centre
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---- palette (from the page's Cru/Cornerstone CSS variables) -------------
    function readPalette() {
        var cs = getComputedStyle(document.documentElement);
        var v = function (n, fb) { var x = cs.getPropertyValue(n).trim(); return x || fb; };
        var accent = v('--accent', '#007890');
        return {
            accent: accent,
            highlight: v('--highlight', '#FFD000'),
            ink: v('--ink', '#1a1a1a'),
            surface: v('--surface', '#ffffff'),
            danger: '#d6453d',
            ramp: [v('--surface-2', '#f0efef'), '#bfe3ea', '#79c9d6', '#2ba6bd', accent]
        };
    }

    // ---- sound (synthesized; no audio files / no copyrighted assets) ---------
    // Retro-style SFX built from oscillators via the WebAudio API. Created lazily
    // on the first Play click (a user gesture, required to start audio). Fully
    // guarded so a missing/!blocked AudioContext never throws.
    var Sfx = (function () {
        var ctx = null, on = false;
        function ensure() {
            if (!ctx) { try { var AC = window.AudioContext || window.webkitAudioContext; ctx = AC ? new AC() : null; } catch (e) { ctx = null; } }
            if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) { /* ignore */ } }
        }
        function tone(freq, dur, type, vol, at) {
            if (!ctx || !on || ctx.state !== 'running') return;
            var t = ctx.currentTime + (at || 0);
            var o = ctx.createOscillator(), g = ctx.createGain();
            o.type = type || 'square';
            o.frequency.setValueAtTime(freq, t);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(vol || 0.12, t + 0.012);
            g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            o.connect(g); g.connect(ctx.destination);
            o.start(t); o.stop(t + dur + 0.02);
        }
        return {
            unlock: function () { ensure(); },               // call on any user gesture to wake the context
            enable: function () { on = true; ensure(); tone(660, 0.09, 'square', 0.12); }, // audible confirmation blip
            disable: function () { on = false; },
            isOn: function () { return on; },
            waka: function (hi) { tone(hi ? 540 : 380, 0.06, 'square', 0.05); },
            power: function () { tone(150, 0.22, 'sawtooth', 0.06); tone(300, 0.22, 'sawtooth', 0.04, 0.1); },
            eatGhost: function () { tone(820, 0.07, 'square', 0.07); tone(1240, 0.1, 'square', 0.06, 0.07); },
            fruit: function () { tone(700, 0.09, 'square', 0.06); tone(1050, 0.11, 'square', 0.05, 0.09); },
            death: function () { for (var i = 0; i < 6; i++) tone(620 - i * 80, 0.12, 'triangle', 0.07, i * 0.1); },
            level: function () { tone(523, 0.1, 'square', 0.06); tone(659, 0.1, 'square', 0.06, 0.1); tone(784, 0.16, 'square', 0.06, 0.2); },
            fright: function () { tone(280, 0.05, 'square', 0.025); }
        };
    })();

    // ---- grid data -----------------------------------------------------------
    function loadLevels() {
        return fetch('/api/contributions/grid?weeks=53', { credentials: 'include' })
            .then(function (r) { if (!r.ok) throw new Error('grid ' + r.status); return r.json(); })
            .then(function (j) { return buildLevels(j.cells || [], j.maxCount || 0); })
            .catch(function () { return synthLevels(); });
    }
    function buildLevels(cells, maxCount) {
        var map = {};
        cells.forEach(function (c) { map[c.date] = c.count; });
        var end = new Date(); end.setHours(0, 0, 0, 0);
        var start = new Date(end); start.setDate(start.getDate() - (COLS * ROWS - 1));
        var q = maxCount > 0 ? maxCount : 1;
        var lv = grid0();
        for (var i = 0; i < COLS * ROWS; i++) {
            var d = new Date(start); d.setDate(start.getDate() + i);
            var cnt = map[d.toISOString().slice(0, 10)] || 0;
            lv[Math.floor(i / ROWS)][i % ROWS] = cnt <= 0 ? 0 : Math.min(4, 1 + Math.floor((cnt / q) * 3.999));
        }
        return lv;
    }
    function synthLevels() {
        var lv = grid0();
        for (var c = 0; c < COLS; c++) for (var r = 0; r < ROWS; r++) {
            var n = Math.abs((Math.sin(c * 12.9898 + r * 78.233) * 43758.5453) % 1);
            lv[c][r] = n > 0.80 ? 4 : n > 0.62 ? 3 : n > 0.44 ? 2 : n > 0.26 ? 1 : 0;
        }
        return lv;
    }
    function grid0() {
        var lv = new Array(COLS);
        for (var c = 0; c < COLS; c++) lv[c] = new Array(ROWS).fill(0);
        return lv;
    }

    // ---- layout / drawing ----------------------------------------------------
    function computeLayout(canvas) {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var cssW = canvas.clientWidth || (canvas.parentElement && canvas.parentElement.clientWidth) || 800;
        var gap = Math.max(1, Math.round(cssW / (COLS * 9)));
        var cell = Math.max(4, Math.min(Math.floor((cssW - (COLS - 1) * gap) / COLS), 18));
        var gw = COLS * cell + (COLS - 1) * gap;
        var gh = ROWS * cell + (ROWS - 1) * gap;
        var ox = Math.floor((cssW - gw) / 2), oy = 5, cssH = gh + 20; // bottom room for the Breakout paddle
        canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
        canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
        var ctx = canvas.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        return { ctx: ctx, cell: cell, gap: gap, ox: ox, oy: oy, gw: gw, gh: gh, cssW: cssW, cssH: cssH, step: cell + gap };
    }
    function cellXY(L, c, r) { return { x: L.ox + c * L.step, y: L.oy + r * L.step }; }
    function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }
    function drawGrid(L, colors, levels, dim) {
        var ctx = L.ctx;
        ctx.clearRect(0, 0, L.cssW, L.cssH);
        var rad = Math.max(1, L.cell * 0.22);
        for (var c = 0; c < COLS; c++) for (var r = 0; r < ROWS; r++) {
            var p = cellXY(L, c, r);
            var a = dim ? dim(c, r) : 1;
            if (a <= 0.02) a = 0.1;
            ctx.globalAlpha = a;
            ctx.fillStyle = colors.ramp[levels[c][r]];
            roundRect(ctx, p.x, p.y, L.cell, L.cell, rad); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
    function inBounds(c, r) { return c >= 0 && c < COLS && r >= 0 && r < ROWS; }

    // ---- maze (for Pac-Man) --------------------------------------------------
    // Walls live on cell edges: vW[c][r] = wall between (c,r) and (c+1,r);
    // hW[c][r] = wall between (c,r) and (c,r+1). Generated as a perfect maze
    // (randomized DFS = fully connected) then opened up by removing extra walls
    // for a looser, looping, Pac-Man-style layout.
    // Small seeded PRNG so the maze is deterministic — the layout is identical
    // every load (gameplay randomness, e.g. ghost wandering, still uses Math.random).
    function makeRng(seed) {
        return function () {
            seed = (seed + 0x6D2B79F5) | 0;
            var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    // Stamp a central ghost house: a 2-row x 3-col box with a single opening at
    // the top centre. All four ghosts spawn inside and leave through the opening.
    function stampGhostHouse(vW, hW) {
        var c = GH_COL, top = GH_ROW - 1, bot = GH_ROW;
        // ceiling (between top-1 and top): walls except the centre door
        hW[c - 1][top - 1] = true; hW[c + 1][top - 1] = true; hW[c][top - 1] = false;
        // floor (between bot and bot+1)
        hW[c - 1][bot] = true; hW[c][bot] = true; hW[c + 1][bot] = true;
        // side walls (both rows)
        vW[c - 2][top] = true; vW[c - 2][bot] = true;
        vW[c + 1][top] = true; vW[c + 1][bot] = true;
        // open interior — verticals within both rows
        vW[c - 1][top] = false; vW[c][top] = false;
        vW[c - 1][bot] = false; vW[c][bot] = false;
        // open interior — horizontals between the two pen rows
        hW[c - 1][top] = false; hW[c][top] = false; hW[c + 1][top] = false;
        // door cell (c, top-1) connects up into the maze
        if (top - 2 >= 0) hW[c][top - 2] = false;
    }

    function genMaze() {
        var rng = makeRng(0x9E3779B1); // fixed seed -> same maze always
        var vW = [], hW = [], vis = [], c, r;
        for (c = 0; c < COLS; c++) { vW[c] = new Array(ROWS).fill(true); hW[c] = new Array(ROWS).fill(true); vis[c] = new Array(ROWS).fill(false); }
        var stack = [{ c: 0, r: 0 }]; vis[0][0] = true;
        while (stack.length) {
            var cur = stack[stack.length - 1], nb = [];
            if (cur.c < COLS - 1 && !vis[cur.c + 1][cur.r]) nb.push({ c: cur.c + 1, r: cur.r, e: 'v', ec: cur.c, er: cur.r });
            if (cur.c > 0 && !vis[cur.c - 1][cur.r]) nb.push({ c: cur.c - 1, r: cur.r, e: 'v', ec: cur.c - 1, er: cur.r });
            if (cur.r < ROWS - 1 && !vis[cur.c][cur.r + 1]) nb.push({ c: cur.c, r: cur.r + 1, e: 'h', ec: cur.c, er: cur.r });
            if (cur.r > 0 && !vis[cur.c][cur.r - 1]) nb.push({ c: cur.c, r: cur.r - 1, e: 'h', ec: cur.c, er: cur.r - 1 });
            if (!nb.length) { stack.pop(); continue; }
            var n = nb[Math.floor(rng() * nb.length)];
            if (n.e === 'v') vW[n.ec][n.er] = false; else hW[n.ec][n.er] = false;
            vis[n.c][n.r] = true; stack.push({ c: n.c, r: n.r });
        }
        // Open the maze up — fewer walls = easier, but compact (keeps structure).
        for (c = 0; c < COLS - 1; c++) for (r = 0; r < ROWS; r++) if (vW[c][r] && rng() < 0.72) vW[c][r] = false;
        for (c = 0; c < COLS; c++) for (r = 0; r < ROWS - 1; r++) if (hW[c][r] && rng() < 0.72) hW[c][r] = false;
        stampGhostHouse(vW, hW);
        return { vW: vW, hW: hW };
    }
    function canMove(m, c, r, dx, dy) {
        if (!inBounds(c + dx, r + dy)) return false;
        if (dx === 1) return !m.vW[c][r];
        if (dx === -1) return !m.vW[c - 1][r];
        if (dy === 1) return !m.hW[c][r];
        if (dy === -1) return !m.hW[c][r - 1];
        return false;
    }
    function drawMaze(L, colors, m) {
        var ctx = L.ctx, c, r;
        ctx.strokeStyle = colors.ink;
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(1.5, L.gap); // thin lines, like the reference
        for (c = 0; c < COLS - 1; c++) for (r = 0; r < ROWS; r++) if (m.vW[c][r]) {
            var x = L.ox + c * L.step + L.cell + L.gap / 2, y0 = L.oy + r * L.step, y1 = y0 + L.cell;
            ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
        }
        for (c = 0; c < COLS; c++) for (r = 0; r < ROWS - 1; r++) if (m.hW[c][r]) {
            var y = L.oy + r * L.step + L.cell + L.gap / 2, x0 = L.ox + c * L.step, x1 = x0 + L.cell;
            ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
        }
    }

    // Classic Pac-Man ghost. gmode: 'normal' | 'frightened' | 'flash' | 'eyes'.
    //   normal    — colored domed body + white eyes, pupils look toward `dir`
    //   frightened— blue body, dotty eyes + zig mouth (edible)
    //   flash     — white body (fright about to end)
    //   eyes      — eyes only, no body (eaten, returning to the pen)
    function drawGhost(ctx, x, y, s, color, dir, gmode) {
        var gx = x + s * 0.1, gy = y + s * 0.08, w = s * 0.8, h = s * 0.84;
        var rad = w / 2, cx = gx + rad, top = gy + rad;
        var er = Math.max(1.5, s * 0.15), ey = gy + h * 0.42;
        var e1 = gx + w * 0.33, e2 = gx + w * 0.67;

        if (gmode !== 'eyes') {
            ctx.fillStyle = gmode === 'frightened' ? '#2453ff' : gmode === 'flash' ? '#e9edf5' : color;
            ctx.beginPath();
            ctx.arc(cx, top, rad, Math.PI, 0);          // dome
            ctx.lineTo(gx + w, gy + h);                  // right side
            var feet = 3, fw = w / feet;
            for (var i = 0; i < feet; i++) {             // scalloped bottom (right -> left)
                ctx.lineTo(gx + w - (i + 0.5) * fw, gy + h - fw * 0.55);
                ctx.lineTo(gx + w - (i + 1) * fw, gy + h);
            }
            ctx.lineTo(gx, top);
            ctx.closePath(); ctx.fill();
        }

        if (gmode === 'frightened' || gmode === 'flash') {
            // scared face: two small eyes + a zig-zag mouth
            var ec = gmode === 'flash' ? '#d23' : '#fff';
            ctx.fillStyle = ec;
            ctx.beginPath(); ctx.arc(e1, ey, Math.max(1, er * 0.5), 0, 7); ctx.fill();
            ctx.beginPath(); ctx.arc(e2, ey, Math.max(1, er * 0.5), 0, 7); ctx.fill();
            ctx.strokeStyle = ec; ctx.lineWidth = Math.max(1, s * 0.06);
            ctx.beginPath();
            var my = gy + h * 0.7;
            ctx.moveTo(gx + w * 0.2, my);
            ctx.lineTo(gx + w * 0.35, my - s * 0.1);
            ctx.lineTo(gx + w * 0.5, my);
            ctx.lineTo(gx + w * 0.65, my - s * 0.1);
            ctx.lineTo(gx + w * 0.8, my);
            ctx.stroke();
            return;
        }

        // normal + eyes: white sclera + pupils looking toward dir
        ctx.fillStyle = '#ffffff';
        ctx.beginPath(); ctx.arc(e1, ey, er, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(e2, ey, er, 0, 7); ctx.fill();
        var px = (dir && dir.x ? dir.x : 0) * er * 0.45, py = (dir && dir.y ? dir.y : 0.2) * er * 0.45;
        var pr = Math.max(1, er * 0.55);
        ctx.fillStyle = '#1b2a6b';
        ctx.beginPath(); ctx.arc(e1 + px, ey + py, pr, 0, 7); ctx.fill();
        ctx.beginPath(); ctx.arc(e2 + px, ey + py, pr, 0, 7); ctx.fill();
    }

    // ===========================================================================
    // Games. Each: init(env, opts) / update(dt, ctrl) / draw() / status / score.
    //   env  = { L, colors, levels }
    //   opts = { mode: 'attract' | 'play' }
    //   ctrl = { mode, dir:{x,y}, held:{left,right,up,down} }
    //   status: 'running' | 'won' | 'lost'
    // Games consume the grid as cells/bricks/pellets; in attract mode an AI plays.
    // ===========================================================================

    function fullMask() { var m = new Array(COLS); for (var c = 0; c < COLS; c++) m[c] = new Array(ROWS).fill(true); return m; }

    // ---- Pac-Man -------------------------------------------------------------
    function PacMan() {
        var env, mode, maze, pellets, energizers, fruit, pac, dir, want, ghosts;
        var lives, score, status, level, acc, gacc, restTimer, clock;
        var frightTimer, frightScore, modePhase, modeTimer, fruitSpawned, startPellets, wakaHi;
        var BASE_TICK = 0.14, BASE_GTICK = 0.18, TICK, GTICK;
        var START = { c: GH_COL, r: ROWS - 1 };             // lowest point, below the pen
        var DOOR = { c: GH_COL, r: GH_ROW - 2 };           // exit cell above the box opening
        var PEN = { c: GH_COL, r: GH_ROW - 1 };             // inside the box (eyes return here)
        var GCOL = ['#d6453d', '#f78fd0', '#27c0e0', '#e08a3c']; // blinky, pinky, inky, clyde
        var CORNERS = [{ c: COLS - 1, r: 0 }, { c: 0, r: 0 }, { c: COLS - 1, r: ROWS - 1 }, { c: 0, r: ROWS - 1 }];

        function countPellets() { var n = 0; for (var c = 0; c < COLS; c++) for (var r = 0; r < ROWS; r++) if (pellets[c][r]) n++; return n; }

        function placeEnergizers() {
            // four power pellets spread across the board (corners-ish, on the grid)
            energizers = {};
            var spots = [{ c: 2, r: 1 }, { c: COLS - 3, r: 1 }, { c: 2, r: ROWS - 2 }, { c: COLS - 3, r: ROWS - 2 }];
            spots.forEach(function (s) { energizers[s.c + ',' + s.r] = true; pellets[s.c][s.r] = true; });
        }
        function isEnergizer(c, r) { return energizers[c + ',' + r] === true; }

        function spawnGhosts() {
            // all four start inside the box, released one at a time
            ghosts = [
                { c: GH_COL - 1, r: GH_ROW - 1, dir: { x: 0, y: -1 }, kind: 0, state: 'pen', release: 0.3, fright: false },
                { c: GH_COL + 1, r: GH_ROW - 1, dir: { x: 0, y: -1 }, kind: 1, state: 'pen', release: 1.3, fright: false },
                { c: GH_COL - 1, r: GH_ROW, dir: { x: 0, y: -1 }, kind: 2, state: 'pen', release: 2.3, fright: false },
                { c: GH_COL + 1, r: GH_ROW, dir: { x: 0, y: -1 }, kind: 3, state: 'pen', release: 3.3, fright: false }
            ];
        }
        function applyLevelSpeed() {
            TICK = Math.max(0.075, BASE_TICK - (level - 1) * 0.012);
            GTICK = Math.max(0.1, BASE_GTICK - (level - 1) * 0.012);
        }
        function newBoard() {
            maze = genMaze();
            pellets = fullMask();
            pac = { c: START.c, r: START.r }; dir = { x: 1, y: 0 }; want = { x: 1, y: 0 };
            pellets[pac.c][pac.r] = false;
            placeEnergizers();
            spawnGhosts();
            fruit = null; fruitSpawned = false;
            acc = 0; gacc = 0; restTimer = 0; clock = 0;
            frightTimer = 0; frightScore = 200;
            modePhase = 'scatter'; modeTimer = 0;
            startPellets = countPellets();
            applyLevelSpeed();
        }
        function reset(full) {
            if (full) { score = 0; lives = 3; level = 1; status = 'running'; }
            newBoard();
        }
        function nextLevel() {
            level++;
            if (mode === 'play') Sfx.level();
            newBoard();
        }
        function softReset() { // after losing a life: keep board, reset actors
            pac = { c: START.c, r: START.r }; dir = { x: 0, y: -1 }; want = dir; restTimer = 0.7;
            spawnGhosts(); frightTimer = 0; modePhase = 'scatter'; modeTimer = 0;
            for (var i = 0; i < 4; i++) ghosts[i].release = clock + 0.3 + i * 0.9;
        }

        function validMoves(c, r, exclude) {
            var dirs = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }], out = [];
            dirs.forEach(function (d) {
                if (exclude && d.x === -exclude.x && d.y === -exclude.y) return;
                if (canMove(maze, c, r, d.x, d.y)) out.push(d);
            });
            return out;
        }
        function stepToward(g, tc, tr, allowReverse, away) {
            var moves = validMoves(g.c, g.r, allowReverse ? null : g.dir);
            if (!moves.length) moves = validMoves(g.c, g.r, null);
            if (!moves.length) return;
            var best = moves[0], bb = away ? -1 : 1e9;
            moves.forEach(function (m) {
                var d = Math.abs(g.c + m.x - tc) + Math.abs(g.r + m.y - tr) + (away ? Math.random() * 1.5 : 0);
                if (away ? d > bb : d < bb) { bb = d; best = m; }
            });
            g.c += best.x; g.r += best.y; g.dir = best;
        }
        function aiPacDir() {
            var t = null, bd = 1e9, c, r;
            for (c = 0; c < COLS; c++) for (r = 0; r < ROWS; r++) if (pellets[c][r]) {
                var d = Math.abs(c - pac.c) + Math.abs(r - pac.r); if (d < bd) { bd = d; t = { c: c, r: r }; }
            }
            var moves = validMoves(pac.c, pac.r, dir); if (!moves.length) moves = validMoves(pac.c, pac.r, null);
            if (!moves.length) return dir;
            if (!t) return moves[0];
            var best = moves[0], bb = 1e9;
            moves.forEach(function (m) {
                var dist = Math.abs(pac.c + m.x - t.c) + Math.abs(pac.r + m.y - t.r) + Math.random() * 0.5;
                if (dist < bb) { bb = dist; best = m; }
            });
            return best;
        }
        function chaseTarget(g) {
            if (g.kind === 0) return { c: pac.c, r: pac.r };                               // Blinky: direct
            if (g.kind === 1) return { c: pac.c + 4 * dir.x, r: pac.r + 4 * dir.y };        // Pinky: 4 ahead
            if (g.kind === 2) {                                                            // Inky: flank via Blinky
                var b = ghosts[0];
                return { c: pac.c + 2 * dir.x + (pac.c + 2 * dir.x - b.c), r: pac.r + 2 * dir.y + (pac.r + 2 * dir.y - b.r) };
            }
            var dd = Math.abs(g.c - pac.c) + Math.abs(g.r - pac.r);                          // Clyde: shy
            return dd > 8 ? { c: pac.c, r: pac.r } : CORNERS[3];
        }
        function moveGhost(g) {
            if (g.state === 'pen') { if (clock >= g.release) g.state = 'leaving'; else return; }
            if (g.state === 'leaving') { stepToward(g, DOOR.c, DOOR.r, true); if (g.r <= DOOR.r) g.state = 'out'; return; }
            if (g.state === 'eyes') {
                stepToward(g, PEN.c, PEN.r, true);
                if (g.c === PEN.c && g.r === PEN.r) { g.state = 'pen'; g.fright = false; g.release = clock + 0.4; }
                return;
            }
            // out
            if (g.fright) { stepToward(g, pac.c, pac.r, false, true); return; } // flee
            var t = (modePhase === 'scatter') ? CORNERS[g.kind] : chaseTarget(g);
            stepToward(g, t.c, t.r, false);
        }
        function frightenAll() {
            frightTimer = Math.max(3, 7 - (level - 1) * 0.5);
            frightScore = 200;
            ghosts.forEach(function (g) { if (g.state === 'out') { g.fright = true; g.dir = { x: -g.dir.x, y: -g.dir.y }; } });
        }
        function ghostMode(g) {
            if (g.state === 'eyes') return 'eyes';
            if (g.fright) return (frightTimer < 2 && Math.floor(frightTimer * 6) % 2 === 0) ? 'flash' : 'frightened';
            return 'normal';
        }
        function handleCollisions() {
            for (var i = 0; i < ghosts.length; i++) {
                var g = ghosts[i];
                if (g.c !== pac.c || g.r !== pac.r) continue;
                if (g.state === 'eyes') continue;
                if (g.fright) { score += frightScore; frightScore *= 2; g.fright = false; g.state = 'eyes'; if (mode === 'play') Sfx.eatGhost(); }
                else { loseLife(); return; }
            }
        }
        function loseLife() {
            if (mode === 'play') { Sfx.death(); lives--; if (lives <= 0) { status = 'lost'; return; } }
            softReset();
        }
        function maybeFruit() {
            if (fruitSpawned || startPellets === 0) return;
            if (countPellets() <= startPellets * 0.5) {
                // place fruit on a random remaining cell
                var open = [];
                for (var c = 0; c < COLS; c++) for (var r = 0; r < ROWS; r++) if (pellets[c][r] && !isEnergizer(c, r)) open.push({ c: c, r: r });
                if (open.length) { fruit = open[Math.floor(Math.random() * open.length)]; fruit.ttl = 9; fruitSpawned = true; }
            }
        }

        return {
            label: '👻 Pac-Man',
            init: function (e, o) { env = e; mode = o.mode; reset(true); },
            update: function (dt, ctrl) {
                if (status !== 'running') return;
                if (restTimer > 0) { restTimer -= dt; return; }
                if (mode === 'play' && (ctrl.dir.x || ctrl.dir.y)) want = ctrl.dir;
                clock += dt; acc += dt; gacc += dt;

                // scatter/chase phase timer (frozen while frightened)
                if (frightTimer > 0) { frightTimer -= dt; if (frightTimer <= 0) { ghosts.forEach(function (g) { g.fright = false; }); } }
                else {
                    modeTimer += dt;
                    if (modePhase === 'scatter' && modeTimer > 6) { modePhase = 'chase'; modeTimer = 0; }
                    else if (modePhase === 'chase' && modeTimer > 18) { modePhase = 'scatter'; modeTimer = 0; }
                }

                if (fruit) { fruit.ttl -= dt; if (fruit.ttl <= 0) fruit = null; }

                if (acc >= TICK) {
                    acc = 0;
                    var w = mode === 'play' ? want : aiPacDir();
                    if (canMove(maze, pac.c, pac.r, w.x, w.y)) dir = w;
                    if (canMove(maze, pac.c, pac.r, dir.x, dir.y)) { pac.c += dir.x; pac.r += dir.y; }
                    if (pellets[pac.c][pac.r]) {
                        pellets[pac.c][pac.r] = false;
                        if (isEnergizer(pac.c, pac.r)) { energizers[pac.c + ',' + pac.r] = false; score += 50; frightenAll(); if (mode === 'play') Sfx.power(); }
                        else { score += 10; if (mode === 'play') { wakaHi = !wakaHi; Sfx.waka(wakaHi); } }
                        maybeFruit();
                    }
                    if (fruit && pac.c === fruit.c && pac.r === fruit.r) { score += 100 * level; fruit = null; if (mode === 'play') Sfx.fruit(); }
                    handleCollisions();
                    if (status !== 'running') return;
                    if (countPellets() === 0) { if (mode === 'play') nextLevel(); else reset(false); return; }
                }
                if (gacc >= GTICK) { gacc = 0; ghosts.forEach(moveGhost); handleCollisions(); }
            },
            draw: function () {
                var L = env.L, colors = env.colors, ctx = L.ctx, c, r;
                ctx.clearRect(0, 0, L.cssW, L.cssH);
                var rad = Math.max(1, L.cell * 0.22);
                for (c = 0; c < COLS; c++) for (r = 0; r < ROWS; r++) {
                    var cp = cellXY(L, c, r);
                    if (pellets[c][r]) { ctx.globalAlpha = 1; ctx.fillStyle = colors.ramp[env.levels[c][r]]; }
                    else { ctx.globalAlpha = 0.4; ctx.fillStyle = colors.ramp[0]; }
                    roundRect(ctx, cp.x, cp.y, L.cell, L.cell, rad); ctx.fill();
                }
                ctx.globalAlpha = 1;
                drawMaze(L, colors, maze);
                // energizers — pulsing rings on their cells
                var pulse = 0.6 + 0.4 * Math.abs(Math.sin(Date_now() * 0.006));
                ctx.fillStyle = colors.highlight;
                for (var key in energizers) {
                    if (!energizers[key]) continue;
                    var pa = key.split(','), ec = +pa[0], er = +pa[1];
                    if (!pellets[ec][er]) continue;
                    var ep = cellXY(L, ec, er);
                    ctx.globalAlpha = pulse;
                    ctx.beginPath(); ctx.arc(ep.x + L.cell / 2, ep.y + L.cell / 2, L.cell * 0.38, 0, 7); ctx.fill();
                }
                ctx.globalAlpha = 1;
                // fruit
                if (fruit) {
                    var fp = cellXY(L, fruit.c, fruit.r);
                    ctx.fillStyle = '#d6453d';
                    ctx.beginPath(); ctx.arc(fp.x + L.cell / 2, fp.y + L.cell * 0.58, L.cell * 0.34, 0, 7); ctx.fill();
                    ctx.strokeStyle = '#3a7a2c'; ctx.lineWidth = Math.max(1, L.cell * 0.1);
                    ctx.beginPath(); ctx.moveTo(fp.x + L.cell / 2, fp.y + L.cell * 0.24); ctx.lineTo(fp.x + L.cell * 0.68, fp.y + L.cell * 0.1); ctx.stroke();
                }
                ghosts.forEach(function (g) { var gp = cellXY(L, g.c, g.r); drawGhost(ctx, gp.x, gp.y, L.cell, GCOL[g.kind], g.dir, ghostMode(g)); });
                var pp = cellXY(L, pac.c, pac.r), cx = pp.x + L.cell / 2, cy = pp.y + L.cell / 2;
                var a = dir.x > 0 ? 0 : dir.x < 0 ? Math.PI : dir.y > 0 ? Math.PI / 2 : dir.y < 0 ? -Math.PI / 2 : 0;
                var m = 0.25 + Math.abs(Math.sin(Date_now() * 0.012)) * 0.45;
                ctx.fillStyle = colors.highlight;
                ctx.beginPath(); ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, L.cell * 0.5, a + m, a + Math.PI * 2 - m); ctx.closePath(); ctx.fill();
            },
            getStatus: function () { return status; },
            getScore: function () { return score; },
            getLives: function () { return lives; },
            getLevel: function () { return level; }
        };
    }

    // ---- Snake ---------------------------------------------------------------
    function Snake() {
        var env, mode, snake, dir, pend, food, score, status, acc, tick;
        function place() {
            var cand = [];
            for (var c = 0; c < COLS; c++) for (var r = 0; r < ROWS; r++) {
                var on = snake.some(function (s) { return s.c === c && s.r === r; });
                if (!on) cand.push({ c: c, r: r, w: env.levels[c][r] + 1 });
            }
            if (!cand.length) { food = null; return; }
            cand.sort(function (a, b) { return b.w - a.w; });
            var pool = cand.slice(0, Math.max(1, Math.floor(cand.length * 0.3)));
            food = pool[Math.floor(Math.random() * pool.length)];
        }
        function reset() {
            snake = [{ c: 6, r: 3 }, { c: 5, r: 3 }, { c: 4, r: 3 }];
            dir = { x: 1, y: 0 }; pend = dir; score = 0; status = 'running'; acc = 0; tick = 0.13; place();
        }
        function safe(nc, nr) {
            if (!inBounds(nc, nr)) return false;
            for (var i = 0; i < snake.length - 1; i++) if (snake[i].c === nc && snake[i].r === nr) return false;
            return true;
        }
        function aiDir() {
            if (!food) return dir;
            var opts = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
            var best = null, bd = 1e9;
            opts.forEach(function (o) {
                if (o.x === -dir.x && o.y === -dir.y) return;
                var nc = snake[0].c + o.x, nr = snake[0].r + o.y;
                if (!safe(nc, nr)) return;
                var d = Math.abs(nc - food.c) + Math.abs(nr - food.r);
                if (d < bd) { bd = d; best = o; }
            });
            return best || dir;
        }
        return {
            label: '🐍 Snake',
            init: function (e, o) { env = e; mode = o.mode; reset(); },
            update: function (dt, ctrl) {
                if (status !== 'running') return;
                if (mode === 'play') { if (ctrl.dir.x || ctrl.dir.y) { if (!(ctrl.dir.x === -dir.x && ctrl.dir.y === -dir.y)) pend = ctrl.dir; } }
                acc += dt; if (acc < tick) return; acc = 0;
                if (mode === 'attract') pend = aiDir();
                dir = pend;
                var nc = snake[0].c + dir.x, nr = snake[0].r + dir.y;
                if (!safe(nc, nr)) { if (mode === 'play') { status = 'lost'; return; } else { reset(); return; } }
                snake.unshift({ c: nc, r: nr });
                if (food && nc === food.c && nr === food.r) { score += 10; tick = Math.max(0.07, tick - 0.004); place(); if (!food) { if (mode === 'play') status = 'won'; else reset(); } }
                else snake.pop();
            },
            draw: function () {
                var L = env.L, colors = env.colors, ctx = L.ctx;
                drawGrid(L, colors, env.levels, function () { return 0.16; });
                if (food) { var fp = cellXY(L, food.c, food.r); ctx.fillStyle = colors.highlight; roundRect(ctx, fp.x + L.cell * 0.15, fp.y + L.cell * 0.15, L.cell * 0.7, L.cell * 0.7, L.cell * 0.35); ctx.fill(); }
                for (var i = snake.length - 1; i >= 0; i--) {
                    var p = cellXY(L, snake[i].c, snake[i].r);
                    ctx.fillStyle = i === 0 ? colors.accent : colors.ramp[3];
                    ctx.globalAlpha = i === 0 ? 1 : 0.9 - (i / snake.length) * 0.4;
                    roundRect(ctx, p.x + L.cell * 0.08, p.y + L.cell * 0.08, L.cell * 0.84, L.cell * 0.84, L.cell * 0.3); ctx.fill();
                }
                ctx.globalAlpha = 1;
            },
            getStatus: function () { return status; },
            getScore: function () { return score; },
            getLives: function () { return null; }
        };
    }

    // ---- Breakout ------------------------------------------------------------
    function Breakout() {
        var env, mode, bricks, ball, vel, paddle, pw, lives, score, status, remaining;
        function reset(full) {
            var L = env.L;
            bricks = fullMask(); remaining = 0;
            for (var c = 0; c < COLS; c++) for (var r = 0; r < ROWS; r++) { if (env.levels[c][r] === 0 && Math.random() < 0.4) bricks[c][r] = false; if (bricks[c][r]) remaining++; }
            pw = L.cell * 6;
            paddle = L.ox + L.gw / 2;
            ball = { x: paddle, y: L.oy + L.gh + 2 };
            var sp = Math.max(70, L.cssW * 0.2);
            vel = { x: sp * 0.6 * (Math.random() < 0.5 ? 1 : -1), y: -sp };
            if (full) { score = 0; lives = 3; status = 'running'; }
        }
        return {
            label: '🧱 Breakout',
            init: function (e, o) { env = e; mode = o.mode; reset(true); },
            update: function (dt, ctrl) {
                if (status !== 'running') return;
                var L = env.L;
                if (mode === 'play') {
                    var ps = L.cssW * 1.4;
                    if (ctrl.held.left) paddle -= ps * dt;
                    if (ctrl.held.right) paddle += ps * dt;
                    if (ctrl.mouseX != null) paddle = ctrl.mouseX;
                } else { paddle += (ball.x - paddle) * Math.min(1, dt * 6); }
                paddle = Math.max(L.ox + pw / 2, Math.min(L.ox + L.gw - pw / 2, paddle));
                ball.x += vel.x * dt; ball.y += vel.y * dt;
                if (ball.x < L.ox) { ball.x = L.ox; vel.x = Math.abs(vel.x); }
                if (ball.x > L.ox + L.gw) { ball.x = L.ox + L.gw; vel.x = -Math.abs(vel.x); }
                if (ball.y < L.oy) { ball.y = L.oy; vel.y = Math.abs(vel.y); }
                var py = L.oy + L.gh + 2;
                if (ball.y >= py) {
                    if (mode === 'attract' || Math.abs(ball.x - paddle) <= pw / 2) {
                        ball.y = py; vel.y = -Math.abs(vel.y);
                        vel.x += (ball.x - paddle) / (pw / 2) * 30;
                    } else if (ball.y > py + L.cell * 1.5) {
                        if (mode === 'play') { lives--; if (lives <= 0) { status = 'lost'; return; } reset(false); return; }
                    }
                }
                var cc = Math.floor((ball.x - L.ox) / L.step), rr = Math.floor((ball.y - L.oy) / L.step);
                if (inBounds(cc, rr) && bricks[cc][rr]) { bricks[cc][rr] = false; remaining--; vel.y = -vel.y; score += 10; if (remaining <= 0) { if (mode === 'play') status = 'won'; else reset(false); } }
            },
            draw: function () {
                var L = env.L, colors = env.colors, ctx = L.ctx;
                drawGrid(L, colors, env.levels, function (c, r) { return bricks[c][r] ? 1 : 0.1; });
                var ph = Math.max(3, L.cell * 0.45);
                ctx.fillStyle = colors.ink;
                roundRect(ctx, paddle - pw / 2, L.oy + L.gh + 4, pw, ph, ph / 2); ctx.fill();
                ctx.fillStyle = colors.ink;
                ctx.beginPath(); ctx.arc(ball.x, ball.y, Math.max(2, L.cell * 0.3), 0, 7); ctx.fill();
            },
            getStatus: function () { return status; },
            getScore: function () { return score; },
            getLives: function () { return lives; }
        };
    }

    // ---- Galaga --------------------------------------------------------------
    // A compact fixed-shooter on the contribution grid: lit cells in the top rows
    // become an enemy swarm, the player ship defends the bottom. The formation
    // sways side to side and enemies peel off to dive at the ship; clear a wave to
    // advance to a faster one. The ship auto-fires (there is no dedicated fire key
    // wired through); you only steer it (arrows / A-D / mouse). Attract mode flies
    // the ship itself.
    function Galaga() {
        var env, mode, status, score, lives, level;
        var player, pw, shipY, swarm, sway, swayDir, swayAmp;
        var pb, eb;                 // player bullets, enemy bullets
        var fireCd, diveCd, fireTimer, restTimer;
        var pSpd, eSpd, diveSpd, swaySpd;

        function tune() {
            var L = env.L;
            pw = L.cell * 1.8;
            shipY = L.oy + L.gh + 2;
            swayAmp = L.step * 1.4;
            pSpd = L.step * 13;
            eSpd = L.step * (6 + (level - 1) * 0.6);
            diveSpd = L.step * (4.5 + (level - 1) * 0.5);
            swaySpd = L.step * (1.4 + (level - 1) * 0.25);
        }
        function buildSwarm() {
            var L = env.L;
            swarm = [];
            var rows = Math.min(3, ROWS - 2);
            for (var c = 0; c < COLS; c++) for (var r = 0; r < rows; r++) {
                if (env.levels[c][r] > 0) {
                    var p = cellXY(L, c, r);
                    swarm.push(mkEnemy(p.x + L.cell / 2, p.y + L.cell / 2, r));
                }
            }
            // guarantee a playable swarm if the contribution grid is sparse
            for (var i = swarm.length, g = 0; i < 12 && g < 12; g++) {
                var cc = 3 + g * 4, rr = g % rows;
                if (cc >= COLS) break;
                var q = cellXY(L, cc, rr);
                swarm.push(mkEnemy(q.x + L.cell / 2, q.y + L.cell / 2, rr));
                i++;
            }
        }
        // Rank by row, classic Galaga: front row = bee (top score), then green, then blue.
        function mkEnemy(hx, hy, row) {
            var rank = row % 3;
            var sp = rank === 0 ? GA_BEE : rank === 1 ? GA_GREEN : GA_BLUE;
            var pts = rank === 0 ? 30 : rank === 1 ? 20 : 10;
            return { hx: hx, hy: hy, x: 0, y: 0, alive: true, sp: sp, pts: pts, dive: false, t: 0, sx: 0 };
        }
        function newWave() {
            var L = env.L;
            tune();
            player = L.ox + L.gw / 2; pb = []; eb = [];
            sway = 0; swayDir = 1; fireCd = 0; diveCd = 1.4; fireTimer = 0.6; restTimer = 0;
            buildSwarm();
        }
        function reset(full) {
            if (full) { score = 0; lives = 3; level = 1; status = 'running'; }
            newWave();
        }
        function aliveCount() { var n = 0; for (var i = 0; i < swarm.length; i++) if (swarm[i].alive) n++; return n; }
        function ePos(e) { return e.dive ? { x: e.x, y: e.y } : { x: e.hx + sway, y: e.hy }; }
        function startDive() {
            var pool = [];
            for (var i = 0; i < swarm.length; i++) if (swarm[i].alive && !swarm[i].dive) pool.push(swarm[i]);
            if (!pool.length) return;
            var e = pool[Math.floor(Math.random() * pool.length)];
            e.dive = true; e.t = 0; e.x = e.hx + sway; e.y = e.hy; e.sx = e.x;
        }
        function enemyFire() {
            var pool = [];
            for (var i = 0; i < swarm.length; i++) if (swarm[i].alive) pool.push(swarm[i]);
            if (!pool.length) return;
            var e = pool[Math.floor(Math.random() * pool.length)], p = ePos(e);
            eb.push({ x: p.x, y: p.y });
        }
        function hitPlayer() {
            if (mode === 'play') {
                Sfx.death(); lives--; if (lives <= 0) { status = 'lost'; return; }
                pb = []; eb = []; player = env.L.ox + env.L.gw / 2; restTimer = 0.6;
                for (var i = 0; i < swarm.length; i++) swarm[i].dive = false;
            } else { eb = []; }
        }
        function aiTarget() {
            // steer toward the nearest threat: a diver if any, else the lowest enemy
            var best = null, bestScore = -1;
            for (var i = 0; i < swarm.length; i++) {
                var e = swarm[i]; if (!e.alive) continue;
                var p = ePos(e), s = p.y + (e.dive ? 1000 : 0) - Math.abs(p.x - player) * 0.1;
                if (s > bestScore) { bestScore = s; best = p.x; }
            }
            return best == null ? player : best;
        }

        return {
            label: '🚀 Galaga',
            init: function (e, o) { env = e; mode = o.mode; reset(true); },
            update: function (dt, ctrl) {
                if (status !== 'running') return;
                var L = env.L;
                if (restTimer > 0) { restTimer -= dt; return; }

                // ship steering
                if (mode === 'play') {
                    if (ctrl.mouseX != null) player = ctrl.mouseX;
                    else { var ps = L.cssW * 1.3; if (ctrl.held.left) player -= ps * dt; if (ctrl.held.right) player += ps * dt; }
                } else {
                    var tx = aiTarget(); player += Math.max(-L.cssW * dt, Math.min(L.cssW * dt, (tx - player) * Math.min(1, dt * 7)));
                }
                player = Math.max(L.ox + pw / 2, Math.min(L.ox + L.gw - pw / 2, player));

                // formation sway
                sway += swayDir * swaySpd * dt;
                if (sway > swayAmp) { sway = swayAmp; swayDir = -1; }
                else if (sway < -swayAmp) { sway = -swayAmp; swayDir = 1; }

                // auto-fire
                fireCd -= dt;
                if (fireCd <= 0 && pb.length < 4) { pb.push({ x: player, y: shipY }); fireCd = 0.42; if (mode === 'play') Sfx.waka(true); }

                // dives + enemy fire
                diveCd -= dt; if (diveCd <= 0) { startDive(); diveCd = Math.max(0.5, 1.6 - level * 0.1); }
                fireTimer -= dt; if (fireTimer <= 0) { enemyFire(); fireTimer = Math.max(0.35, 0.9 - level * 0.05); }

                // divers
                for (var i = 0; i < swarm.length; i++) {
                    var e = swarm[i]; if (!e.alive || !e.dive) continue;
                    e.t += dt;
                    e.y += diveSpd * dt;
                    e.x = e.sx + Math.sin(e.t * 6) * L.step * 1.2 + (player - e.sx) * Math.min(0.6, e.t * 0.4);
                    if (e.y > shipY + L.cell) { e.dive = false; }      // peeled off — rejoin formation
                    else if (Math.abs(e.x - player) < L.cell * 0.7 && e.y > shipY - L.cell) { hitPlayer(); if (status !== 'running') return; }
                }

                // player bullets travel up
                for (var b = pb.length - 1; b >= 0; b--) {
                    pb[b].y -= pSpd * dt;
                    if (pb[b].y < L.oy - L.cell) { pb.splice(b, 1); continue; }
                    for (var j = 0; j < swarm.length; j++) {
                        var en = swarm[j]; if (!en.alive) continue;
                        var ep = ePos(en);
                        if (Math.abs(ep.x - pb[b].x) < L.cell * 0.55 && Math.abs(ep.y - pb[b].y) < L.cell * 0.55) {
                            en.alive = false; score += en.pts; pb.splice(b, 1);
                            if (mode === 'play') Sfx.eatGhost();
                            break;
                        }
                    }
                }

                // enemy bullets travel down
                for (var k = eb.length - 1; k >= 0; k--) {
                    eb[k].y += eSpd * dt;
                    if (eb[k].y > shipY + L.cell) { eb.splice(k, 1); continue; }
                    if (Math.abs(eb[k].x - player) < pw / 2 && Math.abs(eb[k].y - shipY) < L.cell * 0.6) { eb.splice(k, 1); hitPlayer(); if (status !== 'running') return; }
                }

                if (aliveCount() === 0) {
                    if (mode === 'play') { level++; Sfx.level(); newWave(); } else newWave();
                }
            },
            draw: function () {
                var L = env.L, colors = env.colors, ctx = L.ctx, i;
                drawGrid(L, colors, env.levels, function () { return 0.12; });
                // swarm
                for (i = 0; i < swarm.length; i++) {
                    var e = swarm[i]; if (!e.alive) continue;
                    var p = ePos(e);
                    drawSprite(ctx, p.x, p.y, L.cell * 1.25, e.sp);
                }
                // bullets
                ctx.fillStyle = colors.highlight;
                for (i = 0; i < pb.length; i++) { var w = Math.max(2, L.cell * 0.12); roundRect(ctx, pb[i].x - w / 2, pb[i].y - L.cell * 0.3, w, L.cell * 0.6, w / 2); ctx.fill(); }
                ctx.fillStyle = colors.danger;
                for (i = 0; i < eb.length; i++) { var w2 = Math.max(2, L.cell * 0.12); roundRect(ctx, eb[i].x - w2 / 2, eb[i].y - L.cell * 0.3, w2, L.cell * 0.6, w2 / 2); ctx.fill(); }
                // ship (pixel fighter, nose up, sitting on the bottom line)
                drawSprite(ctx, player, shipY - L.cell * 0.95, L.cell * 2.1, GA_SHIP);
            },
            getStatus: function () { return status; },
            getScore: function () { return score; },
            getLives: function () { return lives; },
            getLevel: function () { return level; }
        };
    }

    // ---- pixel sprites (Galaga) ----------------------------------------------
    // Tiny pixel-art for the player fighter + the three enemy ranks, traced from
    // the classic Galaga/Galaxian arcade sprites: a yellow bee ("fly") and a
    // green and a blue bug. Each is a grid of single-char rows keyed to a palette
    // ('.' = transparent). Rendered once into an offscreen canvas and blitted
    // (no smoothing) so dozens of them are cheap and stay crisp at any size.
    var GA_SHIP = { rows: [
        '......a......', '......a......', '......a......', '.....aaa.....', '.....aaa.....',
        '..bb.aaa.b...', '..bbaaaaab...', 'c...aacaac..c', 'c..aacccaa..c', 'a.caaaaaaac.a',
        'aaaacaaacaaaa', 'aaaccaaacbaaa', 'aa.cc.a.cb.aa', 'a.....a.....a'],
        pal: { a: '#2b3a55', b: '#d11f1f', c: '#ef4d44' } };  // dark slate hull so it reads on the light grid
    var GA_BEE = { rows: [
        'a....b....c', 'a.bbdbdbd.a', '.cdddbdddc.', '.adddbdddc.', '..bbbbbbd..', '....bbb....',
        '.ccadddaac.', '.aaadddcaa.', '.aaadddcca.', '.a..bbb..c.', 'aa..bbb..aa', 'ca..ddd..aa',
        'ca...d...ac', 'ca...a...ac', 'ca.......ac'],
        pal: { a: '#1c5f6b', b: '#ffe11f', c: '#0e2f38', d: '#e3a82e' } };
    var GA_GREEN = { rows: [
        '..a.....a..', 'a..a...a..a', 'a.aaaaaaa.a', 'aaa.aaa.aaa', 'aaaaaaaaaaa', '.aaaaaaaaa.', '..a.....a..', '.a.......a.'],
        pal: { a: '#33c93a' } };
    var GA_BLUE = { rows: [
        '..b.....b..', '...b...b...', '..bbbbbbb..', '.bb.bbb.bb.', 'bbbbbbbbbbb', 'b.bbbbbbb.b', 'b.b.....b.b', '...bb.bb...'],
        pal: { b: '#28a8e6' } };

    function makeSpriteCanvas(sp) {
        var rows = sp.rows, cols = 0, r, c;
        for (r = 0; r < rows.length; r++) cols = Math.max(cols, rows[r].length);
        var px = 4, cv = document.createElement('canvas');
        cv.width = cols * px; cv.height = rows.length * px;
        var g = cv.getContext('2d');
        for (r = 0; r < rows.length; r++) for (c = 0; c < rows[r].length; c++) {
            var ch = rows[r][c]; if (ch === '.' || !sp.pal[ch]) continue;
            g.fillStyle = sp.pal[ch]; g.fillRect(c * px, r * px, px, px);
        }
        return { cv: cv, cols: cols, rows: rows.length };
    }
    // Draw sprite `sp` centered at (cx,cy), scaled so its LARGER dimension fits
    // `box` (keeps tall sprites — e.g. the bee — from overflowing their cell).
    function drawSprite(ctx, cx, cy, box, sp) {
        if (!sp._c) sp._c = makeSpriteCanvas(sp);
        var s = sp._c, px = Math.max(1, box / Math.max(s.cols, s.rows)), w = s.cols * px, h = s.rows * px;
        var prev = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(s.cv, Math.round(cx - w / 2), Math.round(cy - h / 2), Math.round(w), Math.round(h));
        ctx.imageSmoothingEnabled = prev;
    }

    // ---- Puzzle Bobble -------------------------------------------------------
    // A bubble shooter on a hex-packed wall seeded from the contribution grid.
    // The shooter at the bottom auto-launches a bubble along the current aim; a
    // bubble that lands adjacent to two or more of its own color pops the whole
    // matching cluster, and any bubbles left dangling (no path to the ceiling)
    // drop too. Every few shots the ceiling presses down a row. Steer the aim
    // (arrows / A-D / mouse); attract mode aims itself. Clear the wall to win;
    // let it reach the shooter and it's over.
    function PuzzleBobble() {
        var env, mode, status, score;
        var rad, rowH, originX, originY, bcols, shooterX, shooterY, dangerY;
        var grid, cur, next, fly, angle, shotCd, pushCd, shots, COLORS;

        function colsForRow(r) { return bcols - (r % 2); }
        function center(r, c) { return { x: originX + rad + c * 2 * rad + (r % 2) * rad, y: originY + rad + r * rowH }; }
        function ensureRow(r) { while (grid.length <= r) grid.push(new Array(colsForRow(grid.length)).fill(null)); }
        function neighbors(r, c) {
            var odd = r % 2, out = [
                [r, c - 1], [r, c + 1],
                [r - 1, c - (odd ? 0 : 1)], [r - 1, c + (odd ? 1 : 0)],
                [r + 1, c - (odd ? 0 : 1)], [r + 1, c + (odd ? 1 : 0)]
            ];
            return out;
        }
        function at(r, c) { return (grid[r] && c >= 0 && c < grid[r].length) ? grid[r][c] : undefined; }
        function colorsInPlay() {
            var set = {}, list = [];
            for (var r = 0; r < grid.length; r++) for (var c = 0; c < (grid[r] || []).length; c++) { var b = grid[r][c]; if (b && !set[b]) { set[b] = 1; list.push(b); } }
            return list.length ? list : COLORS;
        }
        function randColor() { var p = colorsInPlay(); return p[Math.floor(Math.random() * p.length)]; }

        function seed() {
            var L = env.L, rows = Math.min(3, Math.max(2, Math.floor((dangerY - originY) / rowH) - 1));
            grid = [];
            for (var r = 0; r < rows; r++) {
                var row = new Array(colsForRow(r)).fill(null);
                for (var c = 0; c < row.length; c++) {
                    var gc = Math.min(COLS - 1, Math.floor((c + 0.5) * COLS / bcols)), gr = Math.min(ROWS - 1, r);
                    var lvl = env.levels[gc][gr];
                    var h = Math.abs(Math.sin(c * 12.9898 + r * 78.233) * 43758.5453) % 1;
                    if (lvl > 0 || h < 0.62) row[c] = COLORS[Math.floor((Math.abs(Math.sin((c + 1) * (r + 3) * 7.1)) % 1) * COLORS.length)];
                }
                grid.push(row);
            }
        }
        function tune() {
            var L = env.L;
            rad = Math.max(4, L.cell * 0.72);
            rowH = rad * 1.7;
            originX = L.ox; originY = L.oy;
            shooterX = L.ox + L.gw / 2; shooterY = L.oy + L.gh + 2;
            dangerY = shooterY - rad * 1.6;
            bcols = Math.max(6, Math.floor((L.gw - rad) / (2 * rad)));
        }
        function reset(full) {
            tune();
            COLORS = [env.colors.accent, env.colors.highlight, env.colors.danger, '#27c0e0'];
            seed();
            angle = 0; fly = null; shotCd = 0.5; pushCd = 0; shots = 0;
            cur = randColor(); next = randColor();
            if (full) { score = 0; status = 'running'; }
        }

        function launch() {
            var sp = env.L.gw * 1.7;
            fly = { x: shooterX, y: shooterY - rad, vx: Math.sin(angle) * sp, vy: -Math.cos(angle) * sp, color: cur };
            cur = next; next = randColor();
            shots++;
            if (mode === 'play') Sfx.waka(true);
        }
        function settle() {
            // nearest grid cell to the flown bubble
            var r = Math.max(0, Math.round((fly.y - originY - rad) / rowH));
            ensureRow(r);
            var off = (r % 2) * rad;
            var c = Math.round((fly.x - originX - rad - off) / (2 * rad));
            c = Math.max(0, Math.min(colsForRow(r) - 1, c));
            if (grid[r][c]) {
                // bumped — try the open neighbor closest to where it struck
                var nb = neighbors(r, c), bestD = 1e9, br = r, bc = c, found = false;
                for (var i = 0; i < nb.length; i++) {
                    var nr = nb[i][0], ncc = nb[i][1]; if (nr < 0) continue;
                    ensureRow(nr); if (ncc < 0 || ncc >= colsForRow(nr) || grid[nr][ncc]) continue;
                    var p = center(nr, ncc), d = (p.x - fly.x) * (p.x - fly.x) + (p.y - fly.y) * (p.y - fly.y);
                    if (d < bestD) { bestD = d; br = nr; bc = ncc; found = true; }
                }
                if (!found) { ensureRow(r + 1); for (var s = 0; s < colsForRow(r + 1); s++) if (!grid[r + 1][s]) { br = r + 1; bc = s; found = true; break; } }
                r = br; c = bc;
            }
            grid[r][c] = fly.color;
            var popped = resolve(r, c);
            if (mode === 'play') { if (popped) Sfx.eatGhost(); else Sfx.fright(); }
            fly = null;

            // periodic ceiling press-down
            pushCd++;
            if (pushCd >= 6) { pushCd = 0; pushRow(); }

            if (lost()) { if (mode === 'play') status = 'lost'; else reset(false); return; }
            if (empty()) { score += 200; if (mode === 'play') { Sfx.level(); status = 'won'; } else reset(false); }
        }
        function resolve(r, c) {
            var color = grid[r][c], seen = {}, stack = [[r, c]], cluster = [];
            while (stack.length) {
                var cell = stack.pop(), key = cell[0] + ',' + cell[1];
                if (seen[key]) continue; seen[key] = 1;
                if (at(cell[0], cell[1]) !== color) continue;
                cluster.push(cell);
                var nb = neighbors(cell[0], cell[1]);
                for (var i = 0; i < nb.length; i++) if (nb[i][0] >= 0) stack.push(nb[i]);
            }
            if (cluster.length < 3) return 0;
            for (var j = 0; j < cluster.length; j++) grid[cluster[j][0]][cluster[j][1]] = null;
            score += cluster.length * 10;
            dropFloating();
            return cluster.length;
        }
        function dropFloating() {
            var keep = {}, stack = [];
            for (var c = 0; c < (grid[0] || []).length; c++) if (grid[0][c]) { keep['0,' + c] = 1; stack.push([0, c]); }
            while (stack.length) {
                var cell = stack.pop(), nb = neighbors(cell[0], cell[1]);
                for (var i = 0; i < nb.length; i++) {
                    var nr = nb[i][0], nc = nb[i][1], key = nr + ',' + nc;
                    if (nr < 0 || keep[key]) continue;
                    if (at(nr, nc)) { keep[key] = 1; stack.push([nr, nc]); }
                }
            }
            for (var r = 0; r < grid.length; r++) for (var cc = 0; cc < grid[r].length; cc++) if (grid[r][cc] && !keep[r + ',' + cc]) { grid[r][cc] = null; score += 20; }
        }
        function pushRow() {
            var row = new Array(colsForRow(0)).fill(null);
            for (var c = 0; c < row.length; c++) row[c] = randColor();
            grid.unshift(row);                              // every existing bubble shifts down a row
        }
        function empty() { for (var r = 0; r < grid.length; r++) for (var c = 0; c < grid[r].length; c++) if (grid[r][c]) return false; return true; }
        function lost() {
            for (var r = 0; r < grid.length; r++) for (var c = 0; c < grid[r].length; c++) if (grid[r][c] && center(r, c).y + rad >= dangerY) return true;
            return false;
        }
        function aiAim() {
            // aim straight at the lowest bubble matching the current color
            var tx = null, ty = -1;
            for (var r = grid.length - 1; r >= 0 && tx == null; r--) for (var c = 0; c < grid[r].length; c++) {
                if (grid[r][c] === cur) { var p = center(r, c); if (p.y > ty) { ty = p.y; tx = p.x; } }
            }
            if (tx == null) { angle = (Math.sin(shots * 1.3) * 0.9); return; }
            angle = Math.max(-1.15, Math.min(1.15, Math.atan2(tx - shooterX, shooterY - ty)));
        }

        return {
            label: '🫧 Puzzle Bobble',
            init: function (e, o) { env = e; mode = o.mode; reset(true); },
            update: function (dt, ctrl) {
                if (status !== 'running') return;
                var L = env.L;
                // aim
                if (mode === 'play') {
                    if (ctrl.mouseX != null) angle = Math.max(-1.2, Math.min(1.2, Math.atan2(ctrl.mouseX - shooterX, Math.max(1, shooterY - L.oy))));
                    else { var aSpd = 1.8; if (ctrl.held.left) angle -= aSpd * dt; if (ctrl.held.right) angle += aSpd * dt; angle = Math.max(-1.2, Math.min(1.2, angle)); }
                }
                if (fly) {
                    fly.x += fly.vx * dt; fly.y += fly.vy * dt;
                    if (fly.x < originX + rad) { fly.x = originX + rad; fly.vx = Math.abs(fly.vx); }
                    if (fly.x > originX + L.gw - rad) { fly.x = originX + L.gw - rad; fly.vx = -Math.abs(fly.vx); }
                    var hit = fly.y <= originY + rad;
                    if (!hit) {
                        for (var r = 0; r < grid.length && !hit; r++) for (var c = 0; c < grid[r].length; c++) {
                            if (!grid[r][c]) continue; var p = center(r, c);
                            if ((p.x - fly.x) * (p.x - fly.x) + (p.y - fly.y) * (p.y - fly.y) < (rad * 1.8) * (rad * 1.8)) { hit = true; break; }
                        }
                    }
                    if (hit) settle();
                } else {
                    if (mode === 'attract') aiAim();
                    shotCd -= dt;
                    if (shotCd <= 0) { launch(); shotCd = mode === 'play' ? 0.7 : 1.1; }
                }
            },
            draw: function () {
                var L = env.L, colors = env.colors, ctx = L.ctx, r, c;
                drawGrid(L, colors, env.levels, function () { return 0.1; });
                // wall
                for (r = 0; r < grid.length; r++) for (c = 0; c < grid[r].length; c++) {
                    if (!grid[r][c]) continue; var p = center(r, c);
                    if (p.y - rad > L.cssH) continue;
                    drawBubble(ctx, p.x, p.y, rad, grid[r][c]);
                }
                // danger line
                ctx.strokeStyle = colors.danger; ctx.globalAlpha = 0.35; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
                ctx.beginPath(); ctx.moveTo(originX, dangerY); ctx.lineTo(originX + L.gw, dangerY); ctx.stroke();
                ctx.setLineDash([]); ctx.globalAlpha = 1;
                // aim guide (play only)
                if (mode === 'play' && !fly) {
                    ctx.strokeStyle = colors.ink; ctx.globalAlpha = 0.3; ctx.setLineDash([3, 5]); ctx.lineWidth = 1.5;
                    ctx.beginPath(); ctx.moveTo(shooterX, shooterY - rad);
                    ctx.lineTo(shooterX + Math.sin(angle) * rad * 6, shooterY - rad - Math.cos(angle) * rad * 6); ctx.stroke();
                    ctx.setLineDash([]); ctx.globalAlpha = 1;
                }
                // flying + chambered bubbles
                if (fly) drawBubble(ctx, fly.x, fly.y, rad, fly.color);
                else drawBubble(ctx, shooterX, shooterY - rad, rad, cur);
                drawBubble(ctx, shooterX + rad * 2.2, shooterY - rad * 0.6, rad * 0.7, next);
            },
            getStatus: function () { return status; },
            getScore: function () { return score; },
            getLives: function () { return null; }
        };
    }

    function drawBubble(ctx, x, y, rad, color) {
        ctx.fillStyle = color;
        ctx.beginPath(); ctx.arc(x, y, rad * 0.92, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';                 // glossy highlight
        ctx.beginPath(); ctx.arc(x - rad * 0.28, y - rad * 0.28, rad * 0.28, 0, 7); ctx.fill();
    }

    // Date.now() is blocked in some sandboxes (workflow scripts); in the browser
    // it's fine, but guard anyway for the chomp animation.
    function Date_now() { try { return Date.now(); } catch (e) { return performance.now(); } }

    var REGISTRY = { pacman: PacMan, snake: Snake, breakout: Breakout, galaga: Galaga, puzzlebobble: PuzzleBobble };
    var GAME_IDS = ['pacman', 'snake', 'breakout', 'galaga', 'puzzlebobble'];

    // ===========================================================================
    // Engine
    // ===========================================================================
    function Engine(mount) {
        var canvas = document.createElement('canvas');
        canvas.className = 'arcade-canvas';
        canvas.tabIndex = 0;
        mount.innerHTML = '';
        mount.appendChild(canvas);

        var L = null, colors = readPalette(), levels = null, game = null, gameId = 'pacman';
        var rafId = null, lastTs = 0, visible = true, onScreen = true;
        var mode = 'attract';
        var dir = { x: 0, y: 0 };
        var held = { left: false, right: false, up: false, down: false };
        var mouseX = null;
        var self = this;

        function env() { return { L: L, colors: colors, levels: levels }; }
        function relayout() { L = computeLayout(canvas); if (game && levels) game.init(env(), { mode: mode }); }

        function setScore() {
            var el = document.getElementById(SCORE_EL);
            if (!el) return;
            if (mode !== 'play' || !game) { el.textContent = ''; return; }
            var st = game.getStatus(), lives = game.getLives();
            var hearts = lives == null ? '' : '   ' + new Array(Math.max(0, lives) + 1).join('♥');
            var lvl = game.getLevel ? ('   Lv ' + game.getLevel()) : '';
            if (st === 'won') el.textContent = '🏆 You win!  ' + game.getScore() + '   ·  Space to replay, Esc to exit';
            else if (st === 'lost') el.textContent = '💀 Game over  ' + game.getScore() + '   ·  Space to replay, Esc to exit';
            else el.textContent = 'Score ' + game.getScore() + hearts + lvl + '   ·  Esc to exit';
        }

        function frame(ts) {
            rafId = null;
            if (!game || !levels) return;
            var dt = lastTs ? Math.min(0.05, (ts - lastTs) / 1000) : 0.016;
            lastTs = ts;
            game.update(dt, { mode: mode, dir: dir, held: held, mouseX: mode === 'play' ? mouseX : null });
            game.draw();
            if (mode === 'play' && game.getStatus() !== 'running') drawOverlay(game.getStatus());
            setScore();
            schedule();
        }
        function drawOverlay(st) {
            var ctx = L.ctx;
            ctx.save();
            ctx.globalAlpha = 0.78; ctx.fillStyle = colors.surface;
            ctx.fillRect(0, 0, L.cssW, L.cssH);
            ctx.globalAlpha = 1; ctx.fillStyle = colors.ink;
            ctx.font = '700 16px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(st === 'won' ? '🏆  You win — Space to replay' : '💀  Game over — Space to replay', L.cssW / 2, L.cssH / 2);
            ctx.restore();
        }

        function schedule() { if (rafId == null && visible && onScreen && !reduceMotion) rafId = window.requestAnimationFrame(frame); }
        function pause() { if (rafId != null) { window.cancelAnimationFrame(rafId); rafId = null; } }
        function resume() { lastTs = 0; schedule(); }

        function newGame(id, m) {
            gameId = id; mode = m;
            colors = readPalette();
            game = (REGISTRY[id] || REGISTRY.pacman)();
            dir = { x: 0, y: 0 }; mouseX = null;
            if (L && levels) game.init(env(), { mode: mode });
            if (reduceMotion && game) { game.draw(); setScore(); } else { pause(); resume(); }
        }

        this.start = function (id) { return loadLevels().then(function (lv) { levels = lv; relayout(); newGame(id, 'attract'); }); };
        this.selectGame = function (id) { newGame(id, mode); };
        this.play = function () { Sfx.enable(); newGame(gameId, 'play'); canvas.focus(); updateBtn(); };
        this.stop = function () { Sfx.disable(); newGame(gameId, 'attract'); updateBtn(); };
        this.isPlaying = function () { return mode === 'play'; };
        this.currentId = function () { return gameId; };

        function updateBtn() {
            var b = document.getElementById(PLAY_BTN);
            if (b) { b.textContent = mode === 'play' ? '⏹ Stop' : '▶ Play'; b.setAttribute('aria-pressed', mode === 'play'); }
            var el = document.getElementById(SCORE_EL); if (el && mode !== 'play') el.textContent = '';
        }

        // ---- input -----------------------------------------------------------
        var DIRS = {
            ArrowUp: { x: 0, y: -1 }, KeyW: { x: 0, y: -1 },
            ArrowDown: { x: 0, y: 1 }, KeyS: { x: 0, y: 1 },
            ArrowLeft: { x: -1, y: 0 }, KeyA: { x: -1, y: 0 },
            ArrowRight: { x: 1, y: 0 }, KeyD: { x: 1, y: 0 }
        };
        window.addEventListener('keydown', function (e) {
            if (mode !== 'play') return;
            if (e.code === 'Escape') { self.stop(); return; }
            if ((e.code === 'Space' || e.code === 'Enter') && game.getStatus() !== 'running') { e.preventDefault(); newGame(gameId, 'play'); return; }
            var d = DIRS[e.code];
            if (d) { e.preventDefault(); dir = d; held.left = d.x < 0; held.right = d.x > 0; held.up = d.y < 0; held.down = d.y > 0; }
        });
        window.addEventListener('keyup', function (e) {
            if (mode !== 'play') return;
            var d = DIRS[e.code];
            if (d) { if (d.x < 0) held.left = false; if (d.x > 0) held.right = false; if (d.y < 0) held.up = false; if (d.y > 0) held.down = false; }
        });
        canvas.addEventListener('mousemove', function (e) { if (mode === 'play') { var rect = canvas.getBoundingClientRect(); mouseX = e.clientX - rect.left; } });

        document.addEventListener('visibilitychange', function () { visible = !document.hidden; if (visible) resume(); else pause(); });
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(function (en) { onScreen = en[0].isIntersecting; if (onScreen) resume(); else pause(); }, { threshold: 0 }).observe(mount);
        }
        var rt = null;
        window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { pause(); relayout(); resume(); }, 200); });
    }

    // ===========================================================================
    // Boot + selector + play button
    // ===========================================================================
    function pickRandom() { return GAME_IDS[Math.floor(Math.random() * GAME_IDS.length)]; }
    function chosenId() {
        try {
            var q = new URLSearchParams(window.location.search).get('arcade');
            if (q && GAME_IDS.indexOf(q) !== -1) return q; // deep-link / test override
        } catch (e) { /* ignore */ }
        var s = localStorage.getItem(STORAGE_KEY);
        return (s && s !== 'random' && GAME_IDS.indexOf(s) !== -1) ? s : pickRandom();
    }
    function buildControls(engine) {
        var sel = document.getElementById(SELECT);
        if (sel) {
            var opts = ['<option value="random">🎲 Random</option>'];
            GAME_IDS.forEach(function (id) { opts.push('<option value="' + id + '">' + REGISTRY[id]().label + '</option>'); });
            sel.innerHTML = opts.join('');
            sel.value = localStorage.getItem(STORAGE_KEY) || 'random';
            sel.addEventListener('change', function () {
                localStorage.setItem(STORAGE_KEY, sel.value);
                engine.selectGame(sel.value === 'random' ? pickRandom() : sel.value);
            });
        }
        var btn = document.getElementById(PLAY_BTN);
        if (btn) btn.addEventListener('click', function () { engine.isPlaying() ? engine.stop() : engine.play(); });
        // Wake the audio context on the first user interaction anywhere, so it's
        // already running by the time Play unmutes it (autoplay policy).
        function wake() { Sfx.unlock(); window.removeEventListener('pointerdown', wake); window.removeEventListener('keydown', wake); }
        window.addEventListener('pointerdown', wake);
        window.addEventListener('keydown', wake);
    }
    function boot() {
        var mount = document.getElementById(MOUNT);
        if (!mount) return;
        try {
            var engine = new Engine(mount);
            buildControls(engine);
            engine.start(chosenId()).catch(function (err) { console.error('Arcade failed:', err); mount.classList.add('arcade-graph--failed'); });
        } catch (err) { console.error('Arcade failed:', err); mount.classList.add('arcade-graph--failed'); }
    }
    function deferredBoot() {
        if ('requestIdleCallback' in window) window.requestIdleCallback(boot, { timeout: 2000 });
        else setTimeout(boot, 200);
    }
    if (document.readyState !== 'loading') deferredBoot();
    else document.addEventListener('DOMContentLoaded', deferredBoot);
})();
