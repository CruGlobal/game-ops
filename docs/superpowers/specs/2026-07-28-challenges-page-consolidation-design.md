# Challenges page consolidation

## Problem

Auto-enroll landed on 2026-04-23 in `d3160c3` ("auto-enroll all contributors in challenges and announce new ones"). Every contributor is now joined to every challenge, and new contributors are enrolled in all active challenges on their first PR or review. Before that commit, joining was opt-in.

The page was never updated to match, so it still speaks the opt-in vocabulary:

- **"My Active Challenges" duplicates "Active Challenges" by construction.** Your participations *are* the full active set, so the second section is the first section again.
- **The "Join Challenge" button is unreachable.** Every card takes the `hasJoined` branch and renders a disabled `✓ Joined`.
- **There is no un-join.** No route, no controller, no client code — so `✓ Joined` is a permanent, non-actionable state.
- **"PARTICIPANTS" is the whole contributor roster.** It reads `104` on every card and never moves.
- **A completed challenge is indistinguishable from an untouched one.** `createChallengeCard()` reads `userParticipant.progress` but never `userParticipant.completed`, so winning a challenge shows no badge and no reward.
- **The progress bar overflows.** `public/challenges-client.js:136` computes `width: ${progress / target * 100}%` with no clamp, so 8/5 renders at 160%. Both sibling render paths clamp (`:253`, `:338`).

## Decisions

| Question | Decision |
| --- | --- |
| Auto-enroll | Stays. It was a deliberate participation decision; the page adapts to it. |
| Section count | One. "My Active Challenges" is removed. |
| Participants stat | Kept, and given signal: `engaged / enrolled`, e.g. `37 / 104`. |
| Completed card | True count (`8 / 5`), bar clamped at 100%, `✓ Completed` badge, `+250 pts earned`. |
| Join chain | Untouched. The disabled `✓ Joined` button stays. Deliberate deferral, not an oversight. |
| Testing | Extract a pure state helper and unit-test it. No jsdom, no new dependency. |

## Design

### Page structure

`views/challenges.ejs`

- Remove the `#my-challenges` section (`:41-47`).
- Keep `#active-challenges` and `#completed-challenges`.
- Add `<script src="/challenge-card-state.js">` **before** `/challenges-client.js` (`:65`), carrying the same `nonce`.

`public/challenges-client.js`

- Remove the `renderMyChallenges(...)` call and the now-orphaned `renderMyChallenges()` function.
- Keep `loadUserChallenges()` — it still feeds `renderPastChallenges()`.

Unchanged: `GET /api/challenges/user/:username`. The profile page consumes it at `public/profile-client.js:369`, so the endpoint stays even though this page stops rendering a section from it.

### Card

`createChallengeCard()` in `public/challenges-client.js`:

```
  Sprint Master                        Medium
  Merge 5 PRs this week
  ┌────────┬────────┬──────────────┐
  │   5    │  250   │   37 / 104   │
  │ TARGET │ POINTS │ PARTICIPANTS │
  └────────┴────────┴──────────────┘
  Your Progress: 8 / 5        ✓ Completed
  ████████████████████   +250 pts earned
  3 days left                  [✓ Joined]
```

- The progress label keeps the true count, so overshoot stays visible.
- The bar clamps at 100%.
- The `✓ Completed` badge and `+{reward} pts earned` render only when the viewer's participation has `completed === true`.
- `PARTICIPANTS` renders `{engaged} / {enrolled}`.

A viewer with no participation row keeps today's behavior unchanged: no progress block, and the `Join Challenge` button instead of `✓ Joined`. Auto-enroll makes this rare but not impossible — an anonymous visitor has no `currentUsername`, and a contributor created between challenge creation and their first tracked contribution is enrolled by `autoJoinContributorToActiveChallenges()` rather than at creation time.

`engaged` counts participants with `progress > 0` — people actually moving on that challenge, which varies per challenge and rises through the week. `enrolled` is the participant count, which under auto-enroll is the roster.

### Data

No API or query change. `getActiveChallenges()` already includes every participant with its scalars, so `completed` and the engaged count are both derivable client-side from the existing payload. The 104-rows-per-challenge response is what ships today; this design adds nothing to it.

### The state helper

New file `public/challenge-card-state.js`, a classic browser script that assigns to `globalThis`:

```js
globalThis.challengeCardState = function challengeCardState(challenge, participants, username) {
    const mine = participants.find(
        p => p.username === username || p.contributor?.username === username
    );
    const target = challenge.target || 0;
    const progress = mine?.progress ?? 0;

    return {
        hasJoined: !!mine,
        progress,
        target,
        percent: target > 0 ? Math.min(progress / target * 100, 100) : 0,
        completed: !!mine?.completed,
        engaged: participants.filter(p => p.progress > 0).length,
        enrolled: participants.length
    };
};
```

`createChallengeCard()` calls it and only renders; every decision above lives in the helper.

**Why `globalThis` and not an ES module.** Converting `challenges-client.js` to `type="module"` is *nearly* safe — nothing else depends on its top-level declarations (`profile-client.js:424` and `challenge-management.js:177` each define their own `createChallengeCard`, and `challenge-management.ejs` never loads `challenges-client.js`), and module scripts execute before `DOMContentLoaded`, so the listener at `:10` would still fire. It was rejected on one unverified risk: the page serves a CSP with a per-request nonce, and a nonce does not propagate to statically imported modules. Rather than debug CSP behavior for a test seam, the helper stays a classic script. A side-effect `import` in Jest executes the file and exposes the function on `globalThis`, which is all the test needs.

### Testing

New `app/__tests__/unit/challengeCardState.test.js`, written before the helper:

| Case | Expectation |
| --- | --- |
| progress 8, target 5, completed | `percent` 100, `completed` true, `progress` 8 |
| progress 0, target 10 | `percent` 0, `completed` false |
| progress 5, target 10 | `percent` 50 |
| `target` 0 or missing | `percent` 0, no division by zero |
| viewer not in participants | `hasJoined` false, `progress` 0 |
| viewer matched via `contributor.username` | `hasJoined` true |
| 3 of 104 with progress > 0 | `engaged` 3, `enrolled` 104 |

The existing 220-test suite must stay green; nothing in this change touches a service.

## Out of scope

Each of these is a real observation from the same investigation, deliberately excluded:

- **Removing the dead join chain** (`POST /:id/join`, `joinChallengeController`, `joinChallenge()`, the client `joinChallenge()`, and the button branch). Verified unreachable, but left in place by decision.
- **Restoring opt-in.** Would reverse `d3160c3` and needs a product decision, not a UI fix.
- **`getChallengeLeaderboard` returning ~104 rows**, mostly at 0 progress — another auto-enroll consequence, separate change.
- **The completed-state gap on the profile page.** `profile-client.js` has its own `createChallengeCard(challenge, isCompleted)`; this design does not touch it.

## Relationship to PR #127

#127 merged as `dbced38` on 2026-07-28. It fixed the completion flag being ignored in `getUserChallenges()` — both the expired-incomplete and active buckets — plus post-window progress accrual and award idempotency. This design fixes the *third* place the flag is dropped, `createChallengeCard()`, which #127 did not touch.

This work is branched from `main` after that merge, so it builds on those fixes rather than racing them. One consequence worth stating: because #127 excludes completed participations from the active bucket, `getUserChallenges().activeChallenges` now means "active and not yet finished". This page no longer renders that list, but `public/profile-client.js:369` still consumes the same endpoint.
