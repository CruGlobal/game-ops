# Arcade header review

A review of the arcade banner on the leaderboard page — the five canvas mini-games in
`app/public/arcade.js`, what is broken, what would make them feel better, a design for
the arcade-cabinet popup, and a ranked list of clones worth adding.

Reviewed at commit `cd8b7cb`. Findings 1.1 through 1.7 were verified by reading the
cited code directly; the rest are static analysis and are marked where runtime
behavior would settle the question.

## What the arcade is

`app/views/leaderboard.ejs:29-36` mounts a canvas into `#arcade-graph` and gives it a
▶ Play button and a game picker. `arcade.js` renders the team's GitHub contribution
graph — 53 columns by 7 rows — as an arcade playfield. It runs an attract mode where
the AI plays itself, and flips to human control when you press Play.

Data comes from `GET /api/contributions/grid?weeks=53`
(`app/controllers/contributorController.js:379-400`, route at
`app/routes/contributorRoutes.js:115`). It aggregates `contributions` by day with
`SUM(count)` and returns `{cells, maxCount}`. `arcade.js:96-101` fetches it and falls
back to a synthetic grid on any error. The endpoint ignores the DevOps filter, which
is correct for a team-wide banner.

Five games are registered at `arcade.js:1219`: `pacman`, `snake`, `breakout`,
`galaga`, `puzzlebobble`.

`arcade.js` had no test coverage when this review was written; the Jest suite was backend
only. It does now — see **Testing** below. `npx eslint public/arcade.js` already reports 10
errors on `main` — four indentation, five unused `e` in catch blocks, one useless assignment
at `1084`. Those predate this review.

## 1. Defects

Ranked by severity. Every line reference is to `app/public/arcade.js` unless stated.

### 1.1 The resize handler cannot resize, but always destroys the game — High

**Verified.** `computeLayout` measures `canvas.clientWidth` at line 133, then pins it at
line 139 with `canvas.style.width = cssW + 'px'`. That inline width beats
`.arcade-canvas { width: 100% }` in `game-ops-theme.css:412`, so every later call reads
back the number it just wrote. The canvas is frozen at its first-paint width. Shrink
the window and it overflows the card — `.arcade-header` has no `overflow: hidden`
(`game-ops-theme.css:394-404`). Grow it and the canvas stays narrow.

The debounced resize handler at line 1330 runs `pause(); relayout(); resume();`, and
`relayout()` at line 1241 is `L = computeLayout(canvas); game.init(env(), {mode})` — a
full re-init. So any resize event throws away score, lives and level mid-game and gets
no layout change in return. Docking devtools, rotating a phone, or a mobile toolbar
collapsing all trigger it.

**Fix:** measure the mount rather than the canvas, skip the re-init when the width did
not change, and give games a `relayout(L)` hook that re-derives pixel positions without
resetting state. Pac-Man and Snake need no hook — they store cell coordinates.

### 1.2 Breakout rebuilds the entire brick wall every time you lose a ball — High

**Verified.** `reset(full)` at lines 686-696 unconditionally runs `bricks = fullMask()`
and re-rolls the random holes with `Math.random() < 0.4`. Losing a life calls
`reset(false)` at line 720. Clear a hundred bricks, miss once, and the wall is back to
roughly 260 bricks in a different pattern — only `score` and `lives` survive.

Pac-Man handles this correctly with a separate `softReset()` at lines 419-423.

**Fix:** split `reset` into `newWall()` for init and level change, and `serveBall()` for
life loss.

### 1.3 Puzzle Bobble corrupts its own hex grid on every row push — High

**Verified.** Row parity is derived from the row index in three places: `colsForRow(r)`
returns `bcols - (r % 2)` at line 1010, `center(r, c)` offsets odd rows by `rad` at line
1011, and `neighbors(r, c)` picks its diagonals from `r % 2` at lines 1013-1020.

`pushRow()` at lines 1128-1132 builds a row `colsForRow(0)` wide — that is `bcols` — and
calls `grid.unshift(row)`. Every existing row's index now increments by one, so its
parity flips while its array length and its true on-screen geometry do not. The old row
0 is `bcols` wide with no offset; it is now treated as odd, drawn shifted right by `rad`,
and reported as `bcols - 1` wide. Adjacency from `neighbors()` stops matching what is
drawn, so clusters that visually touch do not pop and clusters that do not touch do.

`settle()` at line 1074 clamps the landing column to `colsForRow(r) - 1` and then indexes
`grid[r][c]` directly at line 1075 without the bounds guard that `at()` has, so it can
write past the end of a row that is now the wrong declared width.

Attract mode pushes a row every six shots (lines 1093-1094), so the banner shows the wall
jolting sideways continuously.

**Fix:** keep a `par` flag, toggle it in `pushRow`, define `odd(r)` as `(r + par) % 2`,
and use that in `colsForRow`, `center`, `neighbors` and `settle`. Build the new row after
toggling.

### 1.4 Puzzle Bobble shots tunnel through the wall — High

**Verified.** Launch speed is `env.L.gw * 1.7` at line 1062. Collision is a per-frame
point test against `rad * 1.8` at lines 1165-1168, and `rad` is `max(3, cell * 0.4)` at
line 1045.

On a 1000px banner that is 1700 px/s. At 60Hz the bubble moves 28px per frame against a
hit radius of about 13px. At 800px it is worse — `cell` 13 gives `rad` 5, so 22px steps
against a 9px radius. The `dt` clamp of 0.05 at line 1258 permits 85px steps. The shot
passes between or straight through bubbles, hits the ceiling test at line 1163, and gets
placed in row 0 through the "bumped" fallback.

**Fix:** sub-step the flight — `steps = ceil(dist / (rad * 0.5))` — or use a swept-circle
test. Cap speed in absolute px/s rather than scaling it with `gw`.

### 1.5 Play mode swallows WASD and arrow keys across the whole page — Medium-high

**Verified.** The `keydown` listener at lines 1311-1317 is bound to `window`, guards only
on `mode !== 'play'`, and calls `e.preventDefault()` on any code in `DIRS` with no check
on `e.target`. `DIRS` at lines 1305-1310 covers both arrows and `KeyW`/`KeyA`/`KeyS`/`KeyD`.

Press ▶ Play, click into `#search-input` (`leaderboard.ejs:42-47`), and type "dashboard" —
the `d`, `a` and `s` never arrive. Arrow keys in `#sort-select` and `#arcade-select` are
eaten too. Escape at line 1313 stops the game even when the user meant to close something
else.

**Fix:** return early when `e.target.closest('input,select,textarea,[contenteditable]')`
matches, or bind to the canvas — it already has `tabIndex = 0` at line 1228 and is focused
on play at line 1293.

### 1.6 A stray mouse movement permanently disables keyboard steering — Medium

**Verified.** `mousemove` sets `mouseX` at line 1323. Nothing clears it except `newGame`
at line 1286. Breakout (line 707), Galaga (line 857) and Puzzle Bobble (line 1156) all
prefer `ctrl.mouseX != null` over `held`. One pass of the cursor over the canvas and the
arrow keys do nothing for the rest of the game.

**Fix:** clear `mouseX` on `mouseleave`, and clear it when a steering key is pressed so
the last input wins.

### 1.7 Tick accumulators discard the remainder, so speed depends on refresh rate — Medium

**Verified.** Pac-Man sets `acc = 0` after a tick at line 550, ghosts at line 565, Snake at
line 656. Discarding the remainder makes the effective period `ceil(TICK/dt) * dt`. At
level 6 and above the `TICK` floor is 0.075 (line 385), which lands on 0.083s at 60Hz and
0.076s at 144Hz — about 9% slower on the slower display. `GTICK` of 0.10 lands exactly on
60Hz either way, so the Pac-Man-to-ghost speed *ratio* changes with the monitor.

The continuous games use `dt` correctly (lines 710, 889, 1160). Tab-away is handled well —
`resume()` zeroes `lastTs` at line 1280 and `dt` is clamped, so nothing teleports on return.

**Fix:** `acc -= TICK` instead of `acc = 0`.

### 1.8 Accessibility: role="img" wraps an interactive canvas, and the live region fires every frame — Medium

`#arcade-graph` carries `role="img"` (`leaderboard.ejs:30`), which hides its descendants
from assistive tech — but the focusable canvas is inside it, so a keyboard user tabs onto
a stop with no name and no role.

`#arcade-score` is `aria-live="polite"` (`leaderboard.ejs:32`) and `setScore()` rewrites
`textContent` on every frame (lines 1243-1253, called from line 1261). During play a screen
reader gets a continuous stream, and the `♥♥♥` lives display reads as "black heart suit"
three times.

The Play button both swaps its label and toggles `aria-pressed` at line 1300 — those are
two different patterns; pick one.

**Fix:** in attract mode, mark the canvas `aria-hidden="true" tabindex="-1"` and leave
`role="img"` on the wrapper. In play mode give the canvas `role="application"` and a real
`aria-label`. Update the live region only when the string changes and only on events —
life lost, level up, win, lose — with a numeric lives count.

### 1.9 prefers-reduced-motion makes the Play button do nothing — Medium-low

`reduceMotion` is read once at line 41. `schedule()` refuses to start the loop under it
(line 1278) and `newGame` draws a single frame (line 1288). So pressing Play flips the
button to ⏹ Stop, enables audio, and nothing moves.

An explicit Play click is consent to motion. Run the loop in play mode — optionally
without shake and particles — keep attract static, and listen for the media query's
`change` event.

### 1.10 Unguarded localStorage can hide the whole banner — Low-medium

`chosenId()` guards `URLSearchParams` but not `localStorage.getItem` (line 1342), and
`buildControls` reads and writes it unguarded (lines 1351, 1353). A storage-blocked
browser throws, `boot()` catches at line 1372 and adds `arcade-graph--failed`, which is
`display: none` (`game-ops-theme.css:413`). The banner disappears.

Line 1351 also assigns an unvalidated stored string to `sel.value`, so a stale id leaves
the select blank.

**Fix:** wrap both in try/catch and validate the stored id against `GAME_IDS`.

### 1.11 The ghost house is stamped after the connectivity guarantee — Low

`genMaze()` builds a perfect maze, opens it, mirrors it, strips singletons, and only then
calls `stampGhostHouse()` at lines 248-249, which *adds* ten wall segments (lines 188-204).
If a cell such as (24,2), (28,3), (25,1) or (27,1) had its only DFS connection through one
of those edges and drew no extra opening, it is now sealed — and pellets are placed on
every lit cell at line 393, so the round becomes unwinnable.

The seed is fixed at line 223, so this is either always fine or always broken. I did not
run it to find out, and that is the next step on this one.

**Fix:** pre-mark the pen cells as visited before the DFS so it carves around them, and add
a dev-only BFS assertion that every pellet is reachable from `START`.

### 1.12 The contribution grid is off by a day east of UTC, and rows are not weekdays — Low

`buildLevels` at lines 105-111 builds local-midnight dates and then keys them with
`toISOString().slice(0, 10)`. For any user east of UTC, local midnight is the previous UTC
day, so every cell shifts by one. Rows are `i % ROWS` counted from `today - 370`, not
Sunday-aligned, so the GitHub-style grid's rows are not actually weekdays.

**Fix:** format with `getFullYear`/`getMonth`/`getDate`, and start from the previous Sunday.

### 1.13 Smaller items

- Breakout english is unbounded — `vel.x += (ball.x - paddle) / (pw/2) * 30` at line 718 has
  no speed cap and no floor on `|vy|`. Brick hits flip only `vel.y` at line 724, so a side
  hit tunnels along the row.
- `frightenAll` at line 500 only frightens ghosts in state `out`, so a ghost leaving the pen
  during an energizer stays lethal.
- The attract AI for Pac-Man ignores ghosts entirely (lines 447-473) and dies constantly.
  Snake's AI is one-step greedy (lines 637-649) and self-traps in a 7-row grid.
- Theme switching mid-game leaves stale colors. `colors` is re-read only in `newGame`
  (line 1284) and games hold the object handed to them by `env()` (line 1240). Mutating in
  place with `Object.assign(colors, readPalette())` on a `data-theme` MutationObserver fixes
  it. Galaga's hull color `#2b3a55` at line 961 was picked to read on the light grid and
  nearly vanishes on the dark surface.
- Galaga's formation sway is dead code — `swayAmp = 0` at line 759 makes lines 865-867 a
  no-op. Divers that pass the ship snap back to formation instantly at line 883.
- `Sfx.enable()`'s confirmation blip at line 82 can be dropped in Safari. `tone()` requires
  `ctx.state === 'running'` at line 69, but `resume()` is async — use `ctx.resume().then(...)`.
  `wake()` at lines 1361-1363 creates an AudioContext on the first pointerdown anywhere on
  the page, including for visitors who never touch the arcade; scope it to the arcade
  controls. No oscillator leak — nodes are stopped at line 78 and collected.
- `Date_now()` at lines 1215-1217 mixes wall-clock time with rAF `dt` for cosmetics
  (lines 580, 602). Harmless as a sine phase, but passing `ts` through `env` would give one
  clock.
- `setScore()` runs `getElementById` and writes `textContent` sixty times a second even in
  attract mode, where it writes an empty string. Cache the element and diff the string.
- Line 1349 instantiates every game object once just to read `.label`. Move labels onto the
  registry as static strings.
- **Not an XSS.** Line 1348-1350 builds `<option>` markup by string concatenation, but the
  id comes from the hard-coded `GAME_IDS` and the label from hard-coded game objects. The
  `?arcade=` parameter (lines 1339-1340) and the stored id (line 1343) are both checked
  against the allowlist before use. Worth switching to `createElement` and `textContent` for
  hygiene, since the theme header promises escaping stays intact, but nothing user-controlled
  reaches `innerHTML` today. `escape-html.js` is not loaded on `leaderboard.ejs`.
- CSP is fine. `arcade.js` loads without a nonce at `leaderboard.ejs:144`, and `'self'` is in
  `scriptSrc` (`app/server.js:62`). Only inline scripts need the nonce.
- On a 375px phone, `.container { width: 80% }` gives about 268px, so `cell` floors to 4px
  (line 135) and ghosts are 3px blobs. Either hide the banner below roughly 480px, or make
  the cabinet the phone experience.

### What is already right

The single-rAF invariant via the `rafId` guard (lines 1278-1280). The `dt` clamp plus
`lastTs` reset on resume. The IntersectionObserver pause. The comment at lines 444-446
explaining why the greedy attract AI was replaced with BFS. The seeded maze. Pre-rendering
sprites to an offscreen canvas (lines 974-995). And the core idea — pellets are
contributions — which is the reason any of this is worth keeping.

## 2. Polish

Ordered by impact against effort. Everything here routes through the Engine so all five
games benefit.

**1. An engine-level effects bus.** Roughly 80 lines. Add
`fx = { shake(t, px), freeze(t), burst(x, y, color, n) }` to `env()` at line 1240. In
`frame()` at line 1255, skip `update` while `freezeT > 0` and wrap `game.draw()` in a
`ctx.translate` offset. Call it from ghost eaten (line 512, freeze 0.08 plus a burst), life
lost (line 516, shake 0.25), brick broken (line 724, burst in the brick's color), Galaga kill
(line 896), Puzzle Bobble pop (line 1109), pellet eaten (line 555, a two-particle puff). Fire
it in attract mode too — this is an ambient banner, and the juice is the whole point.

**2. Fill the audio holes.** Breakout (lines 684-739) and Snake (lines 615-681) call `Sfx`
zero times. Add `paddle()`, `brick(level)` pitched by ramp level, `wall()`, `loseBall()` as a
down-sweep, `eat()` for Snake, and a `turn()` tick. Galaga needs `dive()` and `shieldChip()`.
Add `coin()` and a `start()` jingle for the cabinet. Put a mute toggle next to the game picker
and persist it.

**3. Tween the deaths.** Pac-Man already waits 0.7s on `restTimer` (line 420) but the frame is
frozen — widen the mouth angle at line 602 from 0.25 to π and shrink the radius to zero across
that timer. Galaga should explode the ship into particles during its 0.6s rest (line 832).
Snake should flash the body three times before resetting.

**4. Score popups and combos.** A floating "+200" at the ghost's cell (line 512) reads as
escalation, since `frightScore` already doubles. "+30" on bee kills (line 896). A chain
multiplier in Puzzle Bobble for consecutive popping shots, reset on a miss at line 1089.
Breakout bricks without a paddle touch at ×2 and ×3.

**5. Input feel.**
- Pac-Man's `want` buffer (lines 536, 552) is already right. Add a two-tick expiry so an early
  pre-turn does not stick through the wrong junction.
- Snake's `pend` is a single slot (line 655), so a fast up-then-left inside one 0.13s tick
  loses the first press. Use a two-deep queue and pop one per tick.
- Breakout: replace line 718 with angle-from-offset — `ang = clamp(off/(pw/2), -1, 1) * 60°`
  at constant speed. English that cannot run away.
- Galaga: wire Space and Enter to fire while running. Today line 1314 only handles them after
  game over. Keep autofire for attract.
- Puzzle Bobble: extend the dashed guide at lines 1191-1195 into a bounce-predicted ray that
  reflects off the walls and stops at the first bubble. Add a swap-next key.

**6. Difficulty and pacing.** Breakout has none — constant speed at line 693, no levels, and
`Math.random() < 0.4` only thins cells that are already empty (line 689), so the wall is about
260 bricks at 200 px/s and is practically unwinnable. Make bricks the lit cells only, give
level-4 cells two hits, add 8% speed per level, and speed the ball up every 20 bricks. Puzzle
Bobble's `pushCd >= 6` (line 1094) should start at 8 and drop by one per ten bubbles cleared.
Pac-Man's ramp (lines 385-386, 498) and Galaga's (lines 761-763, 874-875) are both reasonable.
Snake's `-0.004` per food (line 662) is fine; a "walls from contributions" mode at higher scores
would extend it.

**7. Better attract AI.** Pac-Man should penalize BFS expansion into cells within two steps of
a non-frightened ghost (line 457), and should target frightened ghosts while `frightTimer > 1`.
Snake should BFS to the food and reject any move that leaves its own tail unreachable — the
standard anti-trap check. Breakout's attract already tracks the ball (line 708); give it a
deliberate offset so it does not look perfect. Galaga's `aiTarget` (lines 836-845) is good;
add a dodge for incoming fire.

**8. Readability at banner aspect.** Cells cap at 18px (line 135) — raise that to 22 above
1100px. Draw eaten pellet cells at alpha 0.25 instead of 0.4 (line 574) so progress reads at a
glance. In Galaga draw sprites at 1.3× cell (line 934), since they are the only thing on
screen. Keep the HUD in the DOM; the canvas is too short for text.

**9. High scores.** `arcade-hi:<gameId>` in guarded localStorage. Show "Best 1,240" in the score
span during play (line 1252), and in attract mode make the span read "HI 1,240 · ▶ Play"
instead of blank (line 1246).

**10. Per-game gaps.** Pac-Man: frighten ghosts leaving the pen (line 500), tunnel slowdown,
fruit type by level. Breakout: resolve side collisions by testing which axis crossed
(lines 723-724), multiball at level 3. Galaga: fly divers back up instead of snapping
(line 883), and revive the sway (line 759) at `step * 0.5` — the formation breathing is most of
what makes Galaga look like Galaga. Puzzle Bobble: fix parity first, then add a ceiling that
visibly lowers. Snake: optional wrap.

## 3. The arcade cabinet popup

The idea: ▶ Play should open a modal that looks like a real cabinet — marquee, bezel, CRT,
control panel, coin slot — instead of playing inline in the banner.

**This is built.** See "What shipped" at the end of this document for what landed and what
is still open. The design notes below are the reasoning behind it, updated to match the
code that exists.

### What the current architecture made hard

1. **One mount, forever.** `Engine(mount)` creates the canvas and appends it once
   (lines 1225-1230), and the IntersectionObserver watches `mount` (line 1327). If the canvas
   moves, the now-empty banner mount is still intersecting, so the loop never pauses for the
   covered banner — and the modal is not observed at all.
2. **`relayout()` is a state wipe** (line 1241). Moving into the cabinet and back must not lose
   the run. This is finding 1.1, and it is the same code the cabinet needs.
3. **`computeLayout` measures the canvas and caps `cell` at 18px** (lines 133, 135). A fixed 4:3
   CRT needs an explicit `{width, height, maxCell}` and a vertical offset so the 53×7 strip
   letterboxes with the HUD above and below.
4. **Global listeners with no teardown** (lines 1311-1330), plus hard-coded `#arcade-score` and
   `#arcade-play` lookups (lines 1244, 1299). The cabinet needs its own HUD, so the Engine has
   to accept element references.
5. **`drawOverlay` uses `colors.surface` and `colors.ink`** (lines 1269-1271). On a black CRT
   the overlay needs a phosphor palette regardless of page theme.
6. **The geometry.** 53×7 is roughly 7.6:1. On a 900px screen the playfield is about 120px tall.
   A cabinet CRT is 4:3, so the game is a bright strip across the middle of a dark tube with HUD
   text in the black. That reads as a widescreen Defender or Tempest cabinet, which is the right
   call — do not stretch the cells to fill it.

### Engine changes, as built

`computeLayout(canvas, opts)` now takes options and measures the **mount**, never the
canvas. `opts.fill` makes it take both dimensions from the mount, so the cabinet's CSS box
is the single source of truth and the ordinary resize path keeps working:

```js
var mount = canvas.parentElement;
var cssW = opts.width || (mount && mount.clientWidth) || 800;
var boxed = !!(opts.height || opts.fill);
var cssH = opts.height || (opts.fill && mount && mount.clientHeight) || gh + 20;
var oy = boxed ? Math.floor((cssH - gh) / 2) : 5;   // centre the strip in the tube
```

`relayout()` re-measures and only calls `game.init()` when `cssW` or `cssH` actually
changed, which is the fix for 1.1. The Engine gained four public methods:

```js
this.attach = function (newMount, opts) { /* pause, move canvas, re-point observer, re-measure, resume */ };
this.resize = function () { relayout(); };
this.label  = function () { return LABELS[gameId] || gameId; };
this.setHeld = function (key, down) { /* cabinet panel and touch d-pad drive the same held/dir */ };
```

`cabinetPalette()` supplies a phosphor palette — dark surface, mint ink, amber highlight —
because the page palette is built for a white card and would paint a white overlay over a
black tube. `newGame` and `attach` pick it whenever `layoutOpts.hud` is set.

`drawHud()` draws score, high score, level and lives into the letterbox bands, since the
playfield strip leaves no room for text. `setScore()` keeps the banner's DOM HUD and now
diffs the string before writing, so the `aria-live` region no longer announces sixty times
a second.

`applyA11y()` runs on every `newGame` and `attach`: in attract mode the canvas is
`tabindex="-1"` and `aria-hidden`, in play mode it is `role="application"` with a real
label. That closes the "tab stop with no name inside `role=img`" half of 1.8.

### Markup

A native `<dialog>` gives the focus trap, Escape handling, top-layer stacking and
`::backdrop` for free. The repo's other modals are hand-rolled overlays
(`styles.css:491-534`, `:2701-2737`), but nothing depended on that pattern.

The block lives in `app/views/leaderboard.ejs` right after the arcade `<section>`: a
marquee, a bezel wrapping `#cab-screen` plus the scanline and glass layers, and a panel
holding the joystick, a touch d-pad, an A button, START, INSERT COIN, a credit counter and
a close button. `#cab-coin` carries `autofocus` so the dialog opens with focus on the coin
slot rather than the first button in source order.

The banner's ▶ Play button is still the opener. When a cabinet is present the Engine stops
managing that button's label, and it gets `aria-haspopup="dialog"` instead of
`aria-pressed`.

### Controller

`buildCabinet(engine)` lives inside `arcade.js`. It cannot be a separate file: the whole
script is one IIFE, so `Sfx`, `Engine` and `reduceMotion` are only reachable from inside
it, and exporting them just to split the file would widen the API for no gain.

Flow: open → `attach` to the CRT → `engine.stop()` so attract plays behind a blinking
INSERT COIN → coin adds a credit and unlocks audio → START spends it, runs a 350ms
power-on keyframe, then `engine.play()` → Escape or ✕ or a backdrop click closes, which
re-attaches the canvas to the banner and returns focus to ▶ Play.

If `dialog.showModal` is missing, `buildCabinet` returns null and Play falls back to the
old inline behaviour.

### Getting back to the leaderboard

Four ways out, all verified in a browser:

| Action | Notes |
|---|---|
| **Escape** | One press. The Engine's keydown handler stops the game but does not call `preventDefault`, so the browser still runs the dialog's `cancel` default action -- so a single press both stops play and closes the cabinet. |
| **✕ button** | Top-right corner of the cabinet, floating over the marquee. |
| **Click the backdrop** | Anywhere outside the cabinet body. Clicking *inside* it does not close. |
| `dlg.close()` | Programmatic, for tests. |

All four land on the same `close` handler, which re-attaches the canvas to the banner, puts
it back in attract mode and returns focus to ▶ Play.

Escape is the one path the jsdom suite cannot cover, because jsdom has no `<dialog>`
implementation and the harness has to polyfill `showModal`/`close` -- the browser's `cancel`
default action is exactly the missing piece. It is checked by hand instead, from both the
INSERT COIN state and mid-game. The other three are covered by tests.

The ✕ started out in the control panel, which suited the cabinet metaphor but is not where
anyone looks for a way out of a modal — the first person to open this asked how to get back
to the leaderboard, which was the answer. It is now a round translucent button in the
top-right corner, 36px, over the marquee. The control panel lost a grid column and reads
better balanced for it.

Two things the browser forced:

- **The CRT box is not final when `showModal()` returns.** `Press Start 2P` loads async and
  reflows the panel, which reflows the screen. Measuring once produced a 418px canvas in a
  498px tube. The fix is a `ResizeObserver` on `#cab-screen` calling `engine.resize()`, plus
  an explicit `width: min(94vw, 900px)` on `.cab` so the dialog does not size to its own
  content.
- **The tube is 4:3, and the playfield is reshaped to match it.** This is the part worth
  understanding. The banner's grid is 53×7, which is about 7.6:1 — in a cabinet that is a
  thin ribbon floating in a black tube, and no amount of scaling fixes it, because the
  grid's height follows its width (roughly `7 * width / 53`). Stretching the cells would
  mean lying about the data.

  So the cabinet rewraps the *same* day counts into `CABINET_GRID`, 24×16. `buildLevels`
  already derived everything from `COLS * ROWS` and wrapped with `i / ROWS` and `i % ROWS`,
  so the data layer needed no change — only the dimensions had to become mutable.
  `setGeometry(cols, rows)` recomputes `COLS`, `ROWS`, `GH_COL`, `GH_ROW` and the `PM_*`
  maze bounds together, and `loadLevels` caches the raw day counts so a reshape costs no
  second request.

  24×16 is 1.5:1, which matches the tube's *usable* area — `width / (height - 2 * hudPad)`,
  about 1.51 — rather than its raw 4:3. Measured result: every game paints 98% of the tube
  width and 95% of its height, against 17% of the height before. Pac-Man gets a genuinely
  tall maze out of it, which was the weakest thing about the 7-row version.

  Two things this broke, both fixed:

  - **A reshape invalidates whatever a game captured at construction.** `PacMan()` closes
    over `START = { c: GH_COL, r: ROWS - 1 }`, so after narrowing to 24 columns it indexed
    `pellets[26]` and threw. `attach()` now *rebuilds* the game object on a reshape rather
    than re-initialising it, which covers every such capture rather than just this one.
  - **Row bands that assumed a 7-row strip.** Breakout filled every row with bricks and
    Galaga ran shields from row 2 to the bottom; at 16 rows the wall reached the paddle and
    the shields reached the ship. `brickRows()` and `galagaBands()` scale them, and both
    return the old numbers unchanged for any grid of 8 rows or fewer, so the banner is
    untouched. The three player actors now share one `baseY(L)` helper: below the grid on
    the banner, on the last row inside the cabinet, where the band below belongs to the HUD.
    Breakout's draw had its own copy of that baseline and desynced from its own collision
    line until they were unified.


### CRT effects, cheap against expensive

Scanlines as a repeating gradient, a radial vignette, glow via `drop-shadow` on the canvas, and
flicker via an opacity keyframe are all compositor-only and safe at 60fps. A rounded
`border-radius: 4% / 6%` on the screen plus the vignette gives most of the curved-tube read.

True barrel distortion needs either an SVG `feDisplacementMap` filter or a WebGL pass, and both
re-rasterize a 900×675 canvas sixty times a second. Safari's SVG filter support is also patchy.
Skip it. Real bloom needs a second blurred copy; `drop-shadow` is the budget version.

Under `prefers-reduced-motion`, drop the flicker, the power-on sweep and the shake — but run the
game. The coin drop is explicit consent.

### Restoring the banner

`close` fires `engine.attach(banner, {})`, which gives the fluid layout back, and `stop()` puts
it in attract. `levels` stays cached on the Engine (line 1232), the IntersectionObserver is
re-pointed at the banner, and focus returns to ▶ Play. The rAF loop is never lost, because
`attach` is pause, move, relayout, resume — and `schedule()` is idempotent.

### Files

- `app/public/arcade.js` — `computeLayout` options, `relayout`, `attach`/`resize`/`label`/
  `setHeld`, `cabinetPalette`, `drawHud`, `applyA11y`, `buildCabinet`, guarded storage
- `app/public/arcade-cabinet.css` — new
- `app/views/leaderboard.ejs` — the `<dialog>`, the stylesheet link, `Press Start 2P` added
  to the existing Google Fonts request

## 4. More clones worth adding

The constraint that decides everything is 53 columns by 7 rows. Anything horizontal, lane-based
or side-scrolling fits. Anything vertical does not.

Each game implements the same interface as the existing five (lines 333-339):
`init(env, {mode})`, `update(dt, ctrl)`, `draw()`, `getStatus()`, `getScore()`, `getLives()`,
and optionally `getLevel()`.

| # | Clone of | Why 53×7 fits | Contribution mapping | Effort | Attract AI |
|---|---|---|---|---|---|
| 1 | **Frogger** | Seven rows *are* Frogger — row 6 start, rows 1-5 lanes scrolling at different speeds, row 0 home bays. The width gives long lanes with real gaps. | Lit cells in a lane are vehicles or logs; cell level sets length or speed. Zero-contribution weeks become the safe gaps, so a busy quarter is a hard level. | Low. Grid tick movement plus per-lane offsets, around 200 lines. | Excellent. "Wait for a gap, then hop" is ten lines of lookahead and reads as intelligent. |
| 2 | **Space Invaders** | A wide marching formation with row drops and shields — the banner is one giant invader row. | Top three rows lit are invaders, with level setting points or hit points. Rows 4-6 lit are shields. | Very low. Seventy percent is already Galaga — `buildSwarm`, `buildShields`, bullets, `aiTarget` — plus the dead sway code at line 865 finally getting used, plus the row drop. | Good, reuses Galaga's. |
| 3 | **Moon Patrol** | A side-scroller over terrain. Seven rows gives ground, jump height, and a low sky lane for UFOs. | The best mapping in the set: terrain height is the daily count, and **zero-contribution days become craters you have to jump**. Streak gaps turn into literal hazards. | Low-medium. Horizontal scroll of `levels`, a jumping buggy, one shot up and one forward. Continuous `dt` physics like Breakout. | Very good. "Jump when a crater is within N pixels" reads as skill. |
| 4 | **Flappy Bird / cave flyer** | Scroll the graph leftward and the seven-row band is a cave with lit cells as rock. | Cells at level 2 and above are solid, so the gaps follow the team's quiet days. Speed rises with `maxCount`. | Very low, about 120 lines. No maze, no grid stepping. | Good. Flap when below the gap center — deterministic and watchable. |
| 5 | **Tron light-cycles** | Two cycles leaving walls on a 53×7 board. The low height makes it frantic in a good way. | Cells at level 3 and above are pre-placed walls, so a sparse graph gives an open arena. | Low. Snake's movement and trail, then either two players or one versus AI. | Good. Snake's `aiDir` plus one-step lookahead makes a convincing duel, and two AIs dueling is a strong attract mode. |
| 6 | **Pong with bumpers** | Purely horizontal. Paddles on the left and right edges spanning rows. | Lit cells in the middle third are breakable bumpers that deflect the ball, reusing Breakout's brick logic. | Low. Breakout's ball and paddle code rotated ninety degrees. | Fine, but a bit dull unless the bumpers are on. |
| 7 | **Missile Command** | Cities on the bottom row, missiles raining down seven rows across fifty-three columns. The short altitude makes for fast, dense waves. | Cities are the six highest-contribution clusters on row 6, and the missiles target them. | Medium. A crosshair and expanding blast circles. Mouse-first input already exists. | Good. Shoot the nearest missile's predicted position. |
| 8 | **Sideways Tetris** | Standard Tetris at 10×20 is a bad fit, so rotate it — pieces travel right to left into a seven-tall well, and a cleared "line" is a full seven-cell column. | Right-side columns pre-filled as garbage from `levels`. | Medium. New piece, rotation and lock machinery, around 300 lines. | Medium. Column-height heuristics are easy but it looks mechanical. |
| 9 | **Bomberman** | A destructible-block maze on a wide strip. Seven rows still allows the one-cell-corridor look. | Lit cells are destructible blocks with level setting bomb count or power-ups; level 4 cells are indestructible pillars. | Medium. Bomb timers, cross blasts, enemies. Reuses `canMove`-style cell blocking. | Medium. Safe-cell BFS after placing a bomb, though it can look suicidal if rushed. |
| 10 | **Dig Dug / Boulder Dash** | Digging through a 53-wide dirt strip. Seven rows is shallow, but horizontal digging reads fine. | Dirt hardness and gems come from level; empty days are pre-dug tunnels. | Medium. Gravity for boulders, plus enemy pathing through dug tunnels — reuses the BFS at line 447. | Medium. |

**One non-clone worth considering.** A **Contributor Race** — seven lanes for the top seven
contributors, avatars pulled from `leaderboard-client`, each sprite's speed per column driven by
that person's weekly count, replayed across the 53 weeks. Attract-only, but it is the one
"game" that makes the leaderboard's own data legible at a glance. It needs a per-user grid
endpoint, since the current one aggregates
(`app/controllers/contributorController.js:387-392`).

**What does not fit.** Vertical Tetris. Donkey Kong and platformers generally. Q\*bert, which
needs a pyramid. Centipede, which needs twenty or more rows of descent. Asteroids, which needs
open 2D wrap space. Pinball. Tempest, which is radial. Rhythm games could technically work, but
they make no use of the graph as a playfield, which is the whole idea.

## What shipped

The cabinet, plus the defects it depended on. Everything else in section 1 and section 2 is
still open and is described above with the fix.

**Fixed**

| Finding | What changed |
|---|---|
| Cabinet fills the screen | The cabinet rewraps the graph into a 24x16 grid so the playfield fills a 4:3 tube instead of floating in it as a 7.6:1 ribbon. Measured 98% of tube width, 95% of height, all five games, against 17% of the height before. Needed mutable `COLS`/`ROWS` via `setGeometry`, cached raw day counts, a cell size limited by height as well as width, game-object rebuild on reshape, and scaled row bands for Breakout and Galaga. |
| Cabinet game picker | A modal `<dialog>` blocks the page, so the banner's picker was unreachable once the cabinet was open — you had to close it to change game. The cabinet has its own picker now, kept in sync with the banner's, and the marquee follows the selection. |
| 1.1 resize destroys the game | `computeLayout` measures the mount and takes options; `relayout()` only re-inits when the pixel box actually changed. Verified in a browser: shrinking 1280→760 moved the canvas 1166px→726px with no overflow, where before it stayed pinned. |
| 1.5 play mode eats WASD | `typingInto(e)` early-return on `input, select, textarea, [contenteditable]`. Verified: `KeyD`/`KeyA`/`KeyS` dispatched at `#search-input` are no longer `preventDefault`ed, while arrows on `window` still are. |
| 1.6 sticky `mouseX` | Cleared on `mouseleave` and on any steering keypress — last input wins. |
| 1.8 a11y, partly | `applyA11y()` keeps the canvas out of the tab order and the a11y tree in attract mode and gives it `role="application"` plus a real label in play mode. `setScore()` diffs before writing, so the `aria-live` region no longer fires every frame, and lives read as "3 lives" instead of three heart glyphs. |
| 1.10 unguarded localStorage | `lsGet`/`lsSet` wrappers; the stored game id is validated against `GAME_IDS`. |
| 1.13 option markup | The game picker is built with `createElement` and `textContent`. Labels moved to a static `LABELS` map, so the games are no longer instantiated just to read a name. |

**Still open, in the order I would take them**

1. 1.3 and 1.4 — Puzzle Bobble's parity corruption and shot tunnelling. Both are visible in
   attract mode today, and the parity fix is a prerequisite for the other.
2. 1.2 — Breakout rebuilding its wall on every life, and the difficulty work in polish item 6.
   Breakout is the weakest of the five right now.
3. 1.9 — `prefers-reduced-motion` makes START a no-op. The coin drop is explicit consent to
   motion, so the loop should run.
4. Polish item 1, the effects bus. It is the single biggest change in how the banner feels,
   and every game gets it at once.
5. 1.7, 1.11, 1.12 — refresh-rate drift, the ghost-house reachability assert, the UTC day
   shift.
6. Per-game `relayout(L)` hooks. `attach()` currently re-inits on a box change, which is fine
   while the cabinet only opens in attract mode, but a mid-game CRT resize still restarts the
   round.

**Verification**

- `npx eslint public/arcade.js` — 10 errors, unchanged from `main`. All ten predate this work.
- `npm test` — 27 suites, 401 passed, 1 skipped, including 88 tests over `arcade.js`
  itself (see **Testing**).
- Browser: `/leaderboard` is behind GitHub OAuth, so the cabinet was driven through a local
  harness that served the real `arcade.js` and `arcade-cabinet.css` and the `<section>` and
  `<dialog>` extracted verbatim from `leaderboard.ejs`, with the grid endpoint stubbed.
  Checked on desktop and at 390px: open, coin, START, power-on, play, HUD, Escape and ✕ both
  closing, canvas returning to the banner and resuming attract, focus returning to ▶ Play,
  the touch d-pad driving the game, and no horizontal page scroll. Zero console errors.

## Testing

`arcade.js` is a browser IIFE with no exports and no build step, so `__tests__/client/`
loads it the way the page does: it evaluates the real file against a jsdom window. Nothing
is stubbed out of the module. Only the browser services around it are supplied, and the
markup is lifted out of `views/leaderboard.ejs` by regex rather than retyped, so the suite
fails if the view and the script ever disagree about an element id.

Jest now runs two projects (`app/jest.config.js`):

- **server** — the original suite, unchanged: node environment, `__tests__/setup.js`
  connecting Prisma and truncating tables between tests.
- **client** — `__tests__/client/`, jsdom environment, and deliberately *no*
  `setupFilesAfterEnv`. These tests must not need a database.

`npm test` runs both. `--selectProjects client` runs just the arcade ones, in about five
seconds with no database.

### What the harness has to fake, and why

Only two things, both documented at the top of `arcadeHarness.js`:

- **Layout.** jsdom has no layout engine, so every element measures 0 and the cabinet could
  not be measured at all. The harness defines `clientWidth`/`clientHeight` on the two
  mounts. It also makes a canvas report its own inline style width, because that is exactly
  the browser behaviour the pinned-width bug (1.1) fed on — without it that regression is
  unreproducible.
- **Canvas.** There is no 2D context, so `getContext` returns a recorder that captures every
  coordinate drawn. That is what lets the tests assert how much of the screen the playfield
  covers, and read the canvas HUD back, without reaching into module internals.

`requestAnimationFrame` is queued rather than scheduled, so `step(ms)` advances exactly one
frame with an exact `dt` and game timing is deterministic.

### Coverage

88 tests. Most are regressions for defects that actually shipped, each pointing back at its
entry in section 1:

| Area | Cases |
|---|---|
| Boot | canvas mounts and is sized, grid fetched, synthetic fallback on a 500, picker populated without `innerHTML` |
| Layout (1.1) | canvas follows a resize; a no-op resize changes nothing and does not reset a running score |
| Storage (1.10) | the banner survives a browser where `localStorage` throws |
| Accessibility (1.8) | attract canvas is out of the tab order and the a11y tree; playing canvas gets `role="application"` and a real label; the `aria-live` score region is not rewritten per frame |
| Input (1.5, 1.6) | WASD and arrows typed into an `input` or `select` reach the control, while the same keys still steer when nothing is focused |
| Cabinet | canvas moves into the CRT and back, one canvas in the document throughout, focus returns to ▶ Play, attract resumes, coin/START/no-credit behaviour, marquee and picker sync |
| Reshape | all five games cover >85% of the tube width and >75% of its height; the banner still draws its wide short strip; no second grid request; all five survive banner → cabinet → banner twice without throwing |
| HUD | score, level and lives drawn inside the tube; lives as a number rather than heart glyphs; the DOM score stays empty in the cabinet; the player actor never overlaps the exit hint |
| View contract | every id `arcade.js` looks up still exists in `leaderboard.ejs` |

### These tests were checked against the broken code

A regression test that also passes against the bug is worth nothing, so each fix was
reintroduced one at a time and the suite re-run to confirm the matching test fails. All
eight caught their bug:

| Reintroduced | Detected by |
|---|---|
| `computeLayout` measuring the canvas again | canvas follows a resize |
| dropping the `typingInto` target check | 6 input tests |
| re-initialising instead of rebuilding on reshape | games survive the reshape |
| cabinet keeping the 53×7 banner grid | 5 fill tests |
| writing the score every frame | `aria-live` write count |
| reading `localStorage` unguarded | survives blocked storage |
| leaving the attract canvas in the tab order | attract canvas is decoration |
| the old below-the-grid actor baseline | actor clear of the exit hint |

### Fixed after review

A review of the PR found three blocking issues and three smaller ones. All are fixed:

| Finding | Fix |
|---|---|
| The `projects` split silently dropped `clearMocks`/`restoreMocks` for **both** suites, including the pre-existing server one — they are project-level options in Jest 29 and were left at the root. `--showConfig` resolved both to `false`. | Moved into each project. `--showConfig` now resolves both to `true` for `server` and `client`; `testTimeout`, `maxWorkers`, `forceExit` and `globalTeardown` are genuinely global and stayed put. |
| Under `prefers-reduced-motion: reduce` the cabinet took a credit, cleared the INSERT COIN prompt and then refused to animate — a dead end with no affordance left, on the headline feature, reached by anyone with the OS setting on. | Attract mode still holds a single static frame, but play mode runs: choosing to play, and spending a credit to do it, is consent to motion. This is §1.9's own proposed fix. The query is read live now, so toggling the setting mid-session is honoured. |
| The `grid data` test could not fail. `new Set(ops.map(() => null))` is always `Set{null}`, and the recorder captured geometry only, so brightness was structurally unobservable and the fixture fed neither assertion. | The recorder snapshots `fillStyle`/`globalAlpha` with every op, and the tests pin Breakout (it paints the ramp plainly; Pac-Man draws a maze and never shows it) and assert real ramp colours: an empty grid paints only the unlit end, a saturated grid never paints it, and a spread of counts reaches the middle. |
| The scanline and vignette overlays did not line up with the CRT: `inset`'s block components resolve against the containing block's **height** while the bezel's `padding` resolves against its **width**, so `inset: 4% 5%` overhung by ~8.5px top and bottom at desktop width and left ~7px of unfiltered strip down each side at phone width. | `inset: 0` plus `margin: 4% 5%` — margin percentages resolve against width on all four sides. Measured 0px on every side at 1512px and 390px. The mobile bezel's own 3% padding is matched too. |
| `held.fire` was written by the A button and the keyboard and read by nobody, so the button's "Fire" half was inert while its label promised otherwise. The panel also bound pointer events only, so keyboard activation did nothing. | Holding fire winds the shot cooldown down 2.6× in Galaga and Puzzle Bobble, so doing nothing still plays and the button visibly does something. Space and Enter fire during a round now, rather than only restarting after a loss. Panel buttons handle a keyboard activation (a click with `detail === 0`, which distinguishes it from the click trailing a pointer press). |
| The touch d-pad overflowed its grid track on coarse-pointer screens ≥721px: that media query swaps the 128px pad in for the 66px stick but kept the 96px first column, spilling 32px over the A button. | The first track is `auto` in that query. Measured: a 128px pad in a 128px track, no overlap. |

Nits from the same review: the test counts above were stale and are corrected; the stylesheet
comment that still said "22x17" was fixed in an earlier commit; and `drawHud()` no longer
calls `localStorage.getItem` every frame — the high score is cached per round and written
once on the transition out of `running`.

Each behavioural fix was mutation-checked by reintroducing the bug and confirming the
matching test fails. The `localStorage` caching is the one change with no test behind it: it
is a performance nit with no observable behaviour, and a test asserting call counts through
the harness would pin the implementation rather than anything a user sees.

### Fixed after shipping

Two defects that only surfaced once the cabinet was in production:

**The cabinet opened pinned to the top-left corner, not centred.** A modal `<dialog>`
centres itself with `margin: auto` resolved against its `inset: 0`, and
`modern-design-system.css:161` has a `* { margin: 0; padding: 0 }` reset that outranks the
UA rule. So the dialog collapsed onto its inset origin. `.cab` now declares
`position: fixed; inset: 0; margin: auto; height: fit-content` itself — `.cab` beats `*`,
and it no longer depends on the UA stylesheet or on load order. Verified centred to within
2px on both axes at 1512x950, 1280x800, 1280x600 and 390x844, with `overflow: auto` so a
short window scrolls instead of clipping.

*Why the tests and every screenshot missed it:* the browser harness loaded only
`game-ops-theme.css` and `arcade-cabinet.css`. The real page loads **seven** stylesheets,
and the reset lives in one of the five the harness skipped. Any harness used for visual
work on this page has to pull the whole `<link rel="stylesheet">` list out of
`leaderboard.ejs`, exactly as it already lifts the markup — otherwise it is testing a page
that does not exist. The jsdom suite cannot catch this class of bug at all: no layout
engine, no CSS.

**The test fixture decayed overnight.** `defaultCells()` was pinned to an end date of
`2026-09-16`, while `buildLevels()` walks back `COLS * ROWS` days from `new Date()`. The
morning the clock passed the pin, the newest cells found no entry, fell back to a count of
0, and the "every day is busy" ramp test started seeing the unlit colour. It is now
anchored to today and runs two days past it, to absorb the local-vs-UTC skew in §1.12.
Three tests guard the fixture itself: it covers today, it extends past today, and it is at
least 384 days long (the cabinet's 24x16).

Worth noting: the review listed this decay under "did not reproduce", having re-run the
suite with the *fixture* shifted forward. That is not the same experiment as the *clock*
advancing past a fixed fixture, which is what actually happens, and it broke within 24
hours.

### Known gaps

jsdom has no `<dialog>` implementation, so the harness polyfills `showModal` and `close`.
The ✕ button, the backdrop click and `dlg.close()` are covered, but **Escape-to-close is
not** — the browser's `cancel` default action is the missing piece. That path is verified by
hand, from both the INSERT COIN state and mid-game.

jsdom is not a renderer. These tests assert geometry, state, DOM and event wiring; they
cannot tell you the CRT *looks* right. The fill assertions are the closest proxy, and they
are deliberately loose bounds rather than pixel values. Anything about the visual treatment
— scanlines, glow, the power-on sweep — still needs a browser.
