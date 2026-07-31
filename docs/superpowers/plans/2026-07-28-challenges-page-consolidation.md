# Challenges Page Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the redundant "My Active Challenges" section into a single Active Challenges list, and teach the challenge card to show a completed state, a clamped progress bar, and an `engaged / enrolled` participants count.

**Architecture:** All display decisions move out of DOM-building code into one pure function, `challengeCardState()`, in a new classic browser script. `createChallengeCard()` calls it and only renders. Jest imports the helper for its side effect and reads it off `globalThis`, so the logic gets unit tests without adding jsdom or converting page scripts to ES modules. No server, API, or Prisma change.

**Tech Stack:** Vanilla browser JS (classic `<script src>`, no bundler), EJS templates, Jest with ES modules (`node --experimental-vm-modules`), PostgreSQL 15 via a throwaway container for the existing suite.

**Spec:** `docs/superpowers/specs/2026-07-28-challenges-page-consolidation-design.md`

## Global Constraints

- Branch: `challenges-page-consolidation`, already cut from `origin/main` after #127 merged (`dbced38`). Work in `~/Projects/game-ops`.
- All commands run from `~/Projects/game-ops/app` unless stated. `cd` does not persist between tool calls — pass full paths or `cd` inside each command.
- **No new CSS values.** Reuse `.past-challenge-badge`, `.past-challenge-badge-completed`, `.past-challenge-reward`, `.challenge-progress-fill`. They are already themed with `--c-teal` / `--c-amber` in `public/game-ops-theme.css`.
- **No new dependency.** No jsdom, no bundler, no `type="module"` on any `<script>` tag.
- **No server-side change.** `getActiveChallenges()`, its Prisma query, and every route stay untouched.
- `GET /api/challenges/user/:username` must keep working — `public/profile-client.js:369` consumes it.
- The progress label keeps the true count (`8 / 5`); only the bar clamps.
- Leave the join chain alone: `POST /:id/join`, `joinChallengeController`, `joinChallenge()` (service and client), and the `✓ Joined` button branch all stay.
- Test DB for the full suite:
  ```bash
  docker run -d --name gameops_test_pg -e POSTGRES_USER=gameops -e POSTGRES_PASSWORD=gameops \
    -e POSTGRES_DB=game_ops_test -p 5432:5432 docker.io/library/postgres:15-alpine
  export DATABASE_URL="postgresql://gameops:gameops@localhost:5432/game_ops_test?schema=public"
  npx prisma db push --accept-data-loss    # migrate deploy fails: migrations lag schema.prisma
  ```
  Podman requires the fully-qualified image name. Remove with `docker rm -f gameops_test_pg` when done.
- Never run `npx prettier --write` on these files. `challenges-client.js` already fails prettier on `main`; hand-format instead.

## File Structure

| File | Responsibility |
| --- | --- |
| `app/public/challenge-card-state.js` | **New.** One pure function, `challengeCardState()`, assigned to `globalThis`. Every card display decision lives here. No DOM access. |
| `app/__tests__/unit/challengeCardState.test.js` | **New.** Unit tests for the helper. Imports the file for its side effect. |
| `app/public/challenges-client.js` | **Modify.** `createChallengeCard()` consumes the helper and only renders. Delete `renderMyChallenges()` and its call; drop the `#my-challenges` toggle from `loadMyChallenges()`. |
| `app/views/challenges.ejs` | **Modify.** Delete the `#my-challenges` section; add the helper `<script>` before `challenges-client.js`. |

Task 1 delivers the helper plus its tests. Task 2 rewires the card to use it. Task 3 removes the redundant section. Each ends green and independently reviewable.

---

### Task 1: Pure card-state helper

**Files:**
- Create: `app/public/challenge-card-state.js`
- Test: `app/__tests__/unit/challengeCardState.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `globalThis.challengeCardState(challenge, participants, username)` → `{ hasJoined: boolean, progress: number, target: number, percent: number, completed: boolean, engaged: number, enrolled: number }`. Task 2 calls it.

- [ ] **Step 1: Write the failing test**

Create `app/__tests__/unit/challengeCardState.test.js`:

```javascript
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
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd ~/Projects/game-ops/app && npm test -- __tests__/unit/challengeCardState.test.js 2>&1 | tail -20
```

Expected: FAIL. The suite cannot resolve `../../public/challenge-card-state.js`, so every test errors before asserting. Do not proceed until you see the failure.

- [ ] **Step 3: Write the minimal implementation**

Create `app/public/challenge-card-state.js`:

```javascript
/**
 * Decide everything a challenge card displays.
 *
 * Assigned to globalThis rather than exported: challenges.ejs loads this with a
 * plain <script src>, and the page serves a per-request CSP nonce that does not
 * propagate to statically imported ES modules. Jest imports the file for this
 * side effect and reads the function off globalThis.
 *
 * @param {Object} challenge - Challenge record (needs `target`)
 * @param {Array} participants - The challenge's participants
 * @param {String} username - The viewing user, or null when anonymous
 * @returns {Object} { hasJoined, progress, target, percent, completed, engaged, enrolled }
 */
globalThis.challengeCardState = function challengeCardState(challenge, participants, username) {
    const roster = participants || [];

    const mine = roster.find(
        p => p.username === username || p.contributor?.username === username
    );

    const target = challenge.target || 0;
    const progress = mine?.progress ?? 0;

    return {
        hasJoined: !!mine,
        progress,
        target,
        // Progress keeps accruing while the challenge is open, so it can exceed
        // the target. The label shows the true count; the bar stops at full.
        percent: target > 0 ? Math.min(progress / target * 100, 100) : 0,
        completed: !!mine?.completed,
        engaged: roster.filter(p => p.progress > 0).length,
        enrolled: roster.length
    };
};
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd ~/Projects/game-ops/app && npm test -- __tests__/unit/challengeCardState.test.js 2>&1 | grep -E "✓|✕|Tests:"
```

Expected: 8 passed.

- [ ] **Step 5: Confirm no new lint errors**

```bash
cd ~/Projects/game-ops/app && npx eslint public/challenge-card-state.js __tests__/unit/challengeCardState.test.js 2>&1 | tail -3
```

The repo has ~2900 pre-existing errors, so judge only these two files. Fix anything reported against them. Warnings about `console` do not apply here (this file has none).

- [ ] **Step 6: Commit**

```bash
cd ~/Projects/game-ops && git add app/public/challenge-card-state.js app/__tests__/unit/challengeCardState.test.js && git commit -m "feat(challenges): add pure challenge-card state helper

Every card display decision - progress, clamped percent, completed flag,
engaged/enrolled counts - moves into one pure function so it can be unit
tested. Assigned to globalThis rather than exported: the page loads it with a
plain <script src> under a per-request CSP nonce, which does not propagate to
statically imported ES modules.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Card renders completed state, clamped bar, engaged count

**Files:**
- Modify: `app/public/challenges-client.js:91-158` (`createChallengeCard`)
- Modify: `app/views/challenges.ejs:65` (add the helper script tag before `challenges-client.js`)

**Interfaces:**
- Consumes: `globalThis.challengeCardState(challenge, participants, username)` from Task 1.
- Produces: nothing new. Task 3 edits a different function in the same file.

- [ ] **Step 1: Load the helper before the client script**

In `app/views/challenges.ejs`, the script block currently reads:

```html
<script nonce="<%= nonce %>" src="/socket-client.js"></script>
<script nonce="<%= nonce %>" src="/challenges-client.js"></script>
```

Insert the helper ahead of `challenges-client.js`:

```html
<script nonce="<%= nonce %>" src="/socket-client.js"></script>
<script nonce="<%= nonce %>" src="/challenge-card-state.js"></script>
<script nonce="<%= nonce %>" src="/challenges-client.js"></script>
```

Order matters for clarity rather than correctness — `createChallengeCard()` only runs inside the `DOMContentLoaded` handler registered at `challenges-client.js:10`, by which point both classic scripts have executed.

- [ ] **Step 2: Replace the derived values in `createChallengeCard`**

In `app/public/challenges-client.js`, replace these four lines (currently `:96-100`):

```javascript
    // Ensure participants array exists
    const participants = challenge.participants || [];

    // Check if user has joined this challenge
    const hasJoined = participants.some(p => p.username === currentUsername || p.contributor?.username === currentUsername);
    const userParticipant = participants.find(p => p.username === currentUsername || p.contributor?.username === currentUsername);
```

with:

```javascript
    // Ensure participants array exists
    const participants = challenge.participants || [];

    const state = challengeCardState(challenge, participants, currentUsername);
    const hasJoined = state.hasJoined;
```

- [ ] **Step 3: Render the participants count as engaged / enrolled**

Replace the third stat tile (currently `:124-127`):

```javascript
            <div class="challenge-stat">
                <div class="challenge-stat-value">${participants.length}</div>
                <div class="challenge-stat-label">Participants</div>
            </div>
```

with:

```javascript
            <div class="challenge-stat">
                <div class="challenge-stat-value">${state.engaged} / ${state.enrolled}</div>
                <div class="challenge-stat-label">Participants</div>
            </div>
```

- [ ] **Step 4: Clamp the bar and add the completed state**

Replace the progress block (currently `:130-139`):

```javascript
        ${hasJoined ? `
            <div class="challenge-progress">
                <div class="challenge-progress-label">
                    Your Progress: ${userParticipant.progress} / ${challenge.target}
                </div>
                <div class="challenge-progress-bar">
                    <div class="challenge-progress-fill" style="width: ${(userParticipant.progress / challenge.target * 100)}%"></div>
                </div>
            </div>
        ` : ''}
```

with:

```javascript
        ${hasJoined ? `
            <div class="challenge-progress">
                <div class="challenge-progress-label">
                    <span>Your Progress: ${state.progress} / ${state.target}</span>
                    ${state.completed ? `
                        <span class="past-challenge-badge past-challenge-badge-completed">✓ Completed</span>
                    ` : ''}
                </div>
                <div class="challenge-progress-bar">
                    <div class="challenge-progress-fill" style="width: ${state.percent}%"></div>
                </div>
                ${state.completed ? `
                    <div class="past-challenge-reward">+${challenge.reward} pts earned</div>
                ` : ''}
            </div>
        ` : ''}
```

`.challenge-progress-label` is already `display: flex; justify-content: space-between` in `game-ops-theme.css:768-771`, so wrapping the text in a `<span>` puts the label left and the badge right with no new CSS.

- [ ] **Step 5: Verify no remaining references to the removed variable**

```bash
cd ~/Projects/game-ops/app && grep -n "userParticipant" public/challenges-client.js
```

Expected: no output. If any line still references `userParticipant`, convert it to the matching `state.*` field.

- [ ] **Step 6: Run the helper tests and the full suite**

```bash
cd ~/Projects/game-ops/app && export DATABASE_URL="postgresql://gameops:gameops@localhost:5432/game_ops_test?schema=public" && npm test 2>&1 | grep -E "^Tests:|^Test Suites:|✕"
```

Expected: `Test Suites: 13 passed`, `Tests: 1 skipped, 228 passed`. The counts are 220 + 8 from Task 1; no service test touches this file, so nothing else should move. If the DB is not running, start it per Global Constraints.

- [ ] **Step 7: Verify in the running app**

```bash
cd ~/Projects/game-ops/app && npm start
```

Open `http://localhost:3000/challenges` and confirm on a challenge you have completed: the label shows the true count (e.g. `8 / 5`), the bar is full rather than overflowing its container, the `✓ Completed` badge sits at the right of the label row, `+250 pts earned` appears beneath the bar, and Participants reads two numbers. Check the browser console for CSP violations naming `challenge-card-state.js` — there should be none, since it is a nonced classic script.

- [ ] **Step 8: Commit**

```bash
cd ~/Projects/game-ops && git add app/public/challenges-client.js app/views/challenges.ejs && git commit -m "fix(challenges): show completed state and clamp the progress bar

createChallengeCard() read the participant's progress but never its completed
flag, so a challenge you had already won looked identical to an untouched one -
the third place that flag was dropped, after the two #127 fixed. The bar also
had no clamp, so 8/5 rendered at 160% width while both sibling render paths
clamped.

The card now takes its values from challengeCardState(), shows a Completed
badge and the reward once won, and reports Participants as engaged/enrolled so
the stat varies per challenge instead of reading the whole roster on every card.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Remove the redundant My Active Challenges section

**Files:**
- Modify: `app/views/challenges.ejs:40-46` (delete the section)
- Modify: `app/public/challenges-client.js:214-237` (`loadMyChallenges`), `:239-287` (`renderMyChallenges`)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: nothing.

- [ ] **Step 1: Delete the section markup**

In `app/views/challenges.ejs`, delete these lines entirely (`:40-46`, including the blank line after):

```html
        <!-- My Challenges Section -->
        <section id="my-challenges" class="challenges-section" style="display: none;">
            <h2>My Active Challenges</h2>
            <div id="my-challenges-list">
                <!-- Populated via JavaScript -->
            </div>
        </section>
```

Leave `#active-challenges` and `#completed-challenges` untouched.

- [ ] **Step 2: Drop the toggle from `loadMyChallenges`**

This step is required, not cosmetic. `document.getElementById('my-challenges')` returns `null` once the markup is gone, and the resulting `TypeError` is swallowed by the surrounding `try`, which would skip `renderPastChallenges()` and fire the error toast instead — Past Challenges would silently stop rendering.

In `app/public/challenges-client.js`, replace (`:222-230`):

```javascript
        if (data.activeChallenges && data.activeChallenges.length > 0) {
            document.getElementById('my-challenges').style.display = 'block';
            renderMyChallenges(data.activeChallenges);
        } else {
            document.getElementById('my-challenges').style.display = 'none';
        }

        // Render past challenges (completed + expired incomplete)
        renderPastChallenges(data.completedChallenges || [], data.expiredIncomplete || []);
```

with:

```javascript
        // Active challenges are rendered by the Active Challenges section above,
        // which under auto-enroll already lists every challenge this user is in.
        // Only the past-challenge history is unique to this response.
        renderPastChallenges(data.completedChallenges || [], data.expiredIncomplete || []);
```

- [ ] **Step 3: Delete the orphaned render function**

Delete `renderMyChallenges()` from `app/public/challenges-client.js` — the docblock at `:239-242` through the closing brace at `:287`, plus the blank line after it. It starts:

```javascript
/**
 * Render user's active challenges
 * @param {Array} challenges - Array of user's challenges
 */
function renderMyChallenges(challenges) {
```

- [ ] **Step 4: Verify nothing still references the removed names**

```bash
cd ~/Projects/game-ops/app && grep -rn "my-challenges\|renderMyChallenges\|my-challenge-item" public/ views/ | grep -v node_modules
```

Expected: no output from `public/challenges-client.js` or `views/challenges.ejs`. Hits in `public/styles.css`, `public/game-ops-theme.css`, or `public/profile-client.js` are fine and must be left alone — the `.my-challenge-*` CSS is shared with the profile page, and deleting it is out of scope.

- [ ] **Step 5: Run the full suite**

```bash
cd ~/Projects/game-ops/app && export DATABASE_URL="postgresql://gameops:gameops@localhost:5432/game_ops_test?schema=public" && npm test 2>&1 | grep -E "^Tests:|^Test Suites:|✕"
```

Expected: unchanged from Task 2 — `Test Suites: 13 passed`, `Tests: 1 skipped, 228 passed`.

- [ ] **Step 6: Verify in the running app**

```bash
cd ~/Projects/game-ops/app && npm start
```

Open `http://localhost:3000/challenges`. Confirm: exactly two sections (Active Challenges, Past Challenges), no "My Active Challenges" heading, **Past Challenges still populates**, and no error toast or console error on load. The last two are what Step 2 protects.

- [ ] **Step 7: Commit**

```bash
cd ~/Projects/game-ops && git add app/views/challenges.ejs app/public/challenges-client.js && git commit -m "refactor(challenges): drop the redundant My Active Challenges section

Auto-enroll (d3160c3) joins every contributor to every challenge, so a user's
active participations are the full active set and this section rendered the
list above it a second time.

Its show/hide branch in loadMyChallenges() goes with it: getElementById would
return null and the TypeError, caught by the surrounding try, would have
silently skipped renderPastChallenges(). The .my-challenge-* CSS stays - the
profile page shares it.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Open the pull request

**Files:** none.

**Interfaces:** none.

- [ ] **Step 1: Confirm the branch is clean and rebased on main**

```bash
cd ~/Projects/game-ops && git status --short && git fetch origin main && git log --oneline origin/main..HEAD
```

Expected: no uncommitted changes, and 4 commits ahead (the spec plus Tasks 1-3). If `origin/main` has moved, rebase onto it and re-run the full suite.

- [ ] **Step 2: Confirm no new lint errors against `main`**

```bash
cd ~/Projects/game-ops/app && echo -n "mine: " && npx eslint public/challenges-client.js public/challenge-card-state.js __tests__/unit/challengeCardState.test.js 2>&1 | grep -cE " error "
cd ~/Projects/game-ops && git show origin/main:app/public/challenges-client.js > app/public/_baseline_tmp.js && cd app && echo -n "baseline: " && npx eslint public/_baseline_tmp.js 2>&1 | grep -cE " error " ; rm public/_baseline_tmp.js
```

The baseline file must be written **inside** `app/public/` — ESLint resolves `.eslintrc.json` by walking up from the file, so a copy in `/tmp` silently lints with no config and always reports zero. Delete it immediately after; do not commit it. `mine` should not exceed `baseline`, since the two new files are expected to contribute zero errors of their own.

- [ ] **Step 3: Push and open the PR**

```bash
cd ~/Projects/game-ops && git push -u origin challenges-page-consolidation
```

Then open the PR against `main` — **not** `master`, which does not exist on this repo. The title must be a Conventional Commit or the `Validate PR title` check fails:

Write the body to a scratch file first, then pass it. Use this text, updating the verification numbers only if your run differed:

```markdown
Follows #127. That PR fixed the two places `getUserChallenges()` dropped the participant `completed` flag; this one fixes the third, plus the page structure that auto-enroll left behind.

Design: `docs/superpowers/specs/2026-07-28-challenges-page-consolidation-design.md`

## "My Active Challenges" was the section above it, again

Auto-enroll landed in `d3160c3` (2026-04-23): every contributor is joined to every challenge, and new contributors are enrolled on their first tracked contribution. Before that, joining was opt-in. So a user's active participations *are* the full active set, and the second section rendered the first one a second time. It is removed.

Its show/hide branch in `loadMyChallenges()` had to go with it. `document.getElementById('my-challenges')` returns `null` once the markup is gone, and the resulting `TypeError` is swallowed by the surrounding `try` — Past Challenges would have silently stopped rendering behind an error toast.

## The card never read the completed flag

`createChallengeCard()` read `userParticipant.progress` but never `userParticipant.completed`, so a challenge you had already won looked identical to an untouched one — no badge, no reward. It now shows `✓ Completed` and `+N pts earned` once won.

The progress bar also had no clamp: `width: ${progress / target * 100}%` renders 8/5 at 160%, overflowing its container. Both sibling render paths already clamped. The label keeps the true count (`8 / 5`) deliberately — the overshoot is real and worth seeing; only the bar stops at full.

## Participants now carries signal

The stat counted every `ChallengeParticipant` row, which under auto-enroll is the whole contributor roster — it read the same number on every card and never moved. It now shows `engaged / enrolled` (e.g. `37 / 104`), where engaged means progress above zero, so it varies per challenge and rises through the week.

## No server change

`getActiveChallenges()` already returns every participant with its scalars, so both the completion state and the engaged count derive client-side from the existing payload. No API, route, query, or Prisma change; the response is byte-for-byte what shipped before.

## Testing

Card decisions moved into a pure `challengeCardState()` helper so they could be tested — the page had zero client-side coverage and the repo has no jsdom. The helper is a classic script assigning to `globalThis`: converting `challenges-client.js` to `type="module"` was viable (nothing depends on its top-level declarations, and modules run before `DOMContentLoaded`) but was rejected because the page serves a per-request CSP nonce and nonces do not propagate to statically imported modules. Jest imports the file for its side effect.

8 new tests, written before the helper: clamping, proportional percent, missing target (no divide-by-zero), both participant shapes, viewer not enrolled, engaged counting, empty roster. Full suite `228 passed / 1 skipped, 13 suites`. No new lint errors. No new CSS — the badge and reward reuse `.past-challenge-badge-completed` and `.past-challenge-reward`, already themed with `--c-teal` / `--c-amber`.

## Out of scope, deliberately

- **The dead join chain stays.** `POST /:id/join` → `joinChallengeController` → `joinChallenge()`, and the client `joinChallenge()` behind a button that never renders, are all verified unreachable under auto-enroll. Left in place by decision, so a disabled `✓ Joined` still shows on every card.
- **Opt-in is not being restored.** That would reverse `d3160c3` and is a product decision.
- **`getChallengeLeaderboard` still returns ~104 rows**, mostly at zero progress — the same auto-enroll consequence, separate change.
- **The profile page keeps its own `createChallengeCard(challenge, isCompleted)`** (`public/profile-client.js:424`); this PR does not touch it.
```

Then:

```bash
gh pr create --repo CruGlobal/game-ops --base main \
  --head challenges-page-consolidation \
  --title "fix: consolidate the challenges page and show completed challenges" \
  --body-file /tmp/claude-*/pr-body.md
```

If `gh pr create` dies with a classic-Projects GraphQL error, fall back to `gh api -X POST repos/CruGlobal/game-ops/pulls`.

- [ ] **Step 4: Report the PR URL and stop**

Do not merge. The repo ruleset requires one approving review, and applies to collaborators with `push`.

---

## Verification Summary

| Check | Command | Expected |
| --- | --- | --- |
| Helper unit tests | `npm test -- __tests__/unit/challengeCardState.test.js` | 8 passed |
| Full suite | `npm test` | 13 suites, 228 passed, 1 skipped |
| No orphan references | `grep -rn "userParticipant\|renderMyChallenges\|my-challenges" public/challenges-client.js views/challenges.ejs` | no output |
| Lint | `npx eslint` on the three files | no errors attributable to new code |
| Live page | `npm start` → `/challenges` | two sections; Past Challenges populates; completed card shows badge, reward, clamped bar; Participants shows two numbers |
