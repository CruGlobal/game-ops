# Multi-Repo Tracking — Implementation Plan

**Status:** Draft — not started
**Goal:** Track PRs and reviews from several CruGlobal repositories, not only `cru-terraform`.

---

## Decisions Already Made

| Decision | Choice |
| --- | --- |
| **Scoring model** | One pooled score per person. Every tracked repo adds to the same total, badges, streaks and quarterly stats. |
| **Per-repo views** | Supported, but *derived* — computed on read from the PR / review / points rows, which each carry the repo they came from. No per-repo counters, badges or streaks. |
| **Repo list source** | Terraform environment variable (`REPO_NAMES`), managed in `cru-terraform/applications/game-ops/{stage,prod}/application.tf`. |

Why the pooled model: `Contributor` holds ~25 denormalized counter and badge columns
(`prCount`, `reviewCount`, `allTimePoints`, `currentStreak`, `first100PrsAwarded`, …).
A per-repo scoring model would have to move all of them into a new per-repo table and
rewrite every badge, streak, quarterly and challenge code path. Pooled scoring leaves
those columns untouched.

Why per-repo views still work: `ProcessedPR`, `ProcessedReview` and `PointHistory` are
truth tables — one row per real event. Once each row records its repo, an exact per-repo
leaderboard is a `GROUP BY` away.

---

## Current State — Where the Single-Repo Assumption Lives

The app is hardwired to one repo in four distinct ways.

### 1. Module-level constants (read once at import)

| File | Line | Code |
| --- | --- | --- |
| `app/services/contributorService.js` | 21–22 | `const repoOwner = process.env.REPO_OWNER; const repoName = process.env.REPO_NAME;` |
| `app/services/attributionService.js` | 10–11 | same pair |
| `app/services/backfillService.js` | 16 | `process.env.REPO_NAME \|\| 'android'` — stale default, unrelated repo |
| `app/scripts/simple-fetch-prs.js` | 17 | `process.env.REPO_NAME \|\| 'cru-terraform'` |
| `app/middleware/ensureRepositoryAccess.js` | 19 | `process.env.REPO_NAME \|\| 'cru-terraform'` |

Because these are module-level, no function can be called for a second repo. This is the
core refactor.

### 2. The database has no repo dimension

Only `PRMetadata` is keyed by repo (`@@unique([repoOwner, repoName])`) — and its defaults
are wrong (`cru-Luis-Rodriguez` / `game-ops`, `schema.prisma:205-206`).

Every event table is repo-blind:

- `ProcessedPR` — `@@unique([contributorId, prNumber, action])`
- `ProcessedReview` — `@@unique([contributorId, prNumber, reviewId])`
- `PointHistory` — `prNumber` only
- `Contribution`, `Review` — date + count only
- `FetchDate` — one global "last fetched" timestamp

**This is a correctness bug, not just a gap.** `cru-terraform#4200` and `ticketmd#4200`
produce the same unique key, so the second one is silently dropped as a duplicate
(`contributorService.js:308-311`, `reason: 'duplicate'`). Any second repo loses PRs from
day one.

### 3. The webhook throws the repo away

`app/services/webhookService.js:36-59` destructures `{ action, pull_request }` from the
payload and never reads `payload.repository`. So:

- The repo is not passed to `processSingleMergedPR`, so it cannot be stored.
- **There is no allowlist check.** If an org-level webhook is ever pointed at this app, or
  a webhook is added to an unrelated repo, every PR in it silently earns points.

### 4. Reads assume one repo implicitly

`getTopContributors`, `getAllTimeLeaderboardController`, `/api/activity` and friends read
the pooled `Contributor` counters. That is correct for pooled totals and needs no change —
but there is no way to ask "just cru-terraform", because the rows have no repo.

---

## Phase 0 — Repo Configuration Module

**New file: `app/config/repos.js`**

Parses the env once and exports a normalized list.

- `REPO_NAMES` — comma-separated. Accepts bare names (`cru-terraform`) resolved against
  `REPO_OWNER`, or fully qualified (`CruGlobal/ticketmd`) to allow a repo in another org.
- Falls back to `REPO_OWNER` + `REPO_NAME` when `REPO_NAMES` is unset, so the existing
  deploy keeps working with no Terraform change.
- Exports:
  - `getTrackedRepos()` → `[{ owner, name, fullName }]`
  - `isTracked(fullName)` → boolean (case-insensitive; GitHub repo names are
    case-preserving but case-insensitive)
  - `getPrimaryRepo()` → first entry, for scripts and single-repo admin actions

Trim entries, drop blanks, de-duplicate, and throw on startup if the list is empty — a
silently empty list would make the app look healthy while tracking nothing.

**Tests:** parsing, mixed bare and qualified names, fallback path, empty-list error.

---

## Phase 1 — Schema Migration

Add `repoFullName String` (`@map("repo_full_name")`) to:
`ProcessedPR`, `ProcessedReview`, `PointHistory`, `Contribution`, `Review`.

Store the qualified name (`CruGlobal/cru-terraform`) as a plain string, not a foreign key.
The env var is the source of truth for what is *tracked*; these rows only record where an
event *came from*, so history survives a repo being dropped from `REPO_NAMES`.

**Change the unique keys — this is the part that must not be skipped:**

```prisma
// ProcessedPR
@@unique([contributorId, repoFullName, prNumber, action])
@@index([repoFullName, prNumber])

// ProcessedReview
@@unique([contributorId, repoFullName, prNumber, reviewId])
@@index([repoFullName, prNumber])
```

`FetchDate` needs **no schema change.** It is already a single-row cursor: `updateLastFetchDate`
upserts `id: 'last-fetch'` (`contributorService.js:250-256`). Make it per-repo by using the repo
full name as the id — `upsert({ where: { id: repoFullName } })` — and switch
`getLastFetchDate` (`:242-247`) from `findFirst({ orderBy: { date: 'desc' } })` to
`findUnique({ where: { id: repoFullName } })`. The `findFirst` must go: with several rows it
would hand every repo the newest cursor of any repo, so a new repo would silently skip its
own history.

**Also:** drop the wrong `PRMetadata` defaults (`schema.prisma:205-206`). A default that
names an unrelated repo will create a junk row the first time an upsert misses.

### Migration ordering (single migration, safe because no cross-repo rows exist yet)

1. Add the column with `DEFAULT 'CruGlobal/cru-terraform'` so existing rows are correct.
2. Backfill is therefore implicit; verify with a count query before step 3.
3. Drop the old unique constraints, add the new ones.
4. Drop the column default so future inserts must be explicit — a missing repo then fails
   loudly instead of being mislabeled as cru-terraform.

**Verify after migrating:**

```sql
SELECT repo_full_name, count(*) FROM processed_prs GROUP BY 1;  -- expect one row
```

---

## Phase 2 — Thread the Repo Through Ingest

Delete every module-level `repoOwner` / `repoName` const. Pass a `repo` object
(`{owner, name, fullName}`) as an explicit argument instead.

| Function | Change |
| --- | --- |
| `processSingleMergedPR(prData)` | `prData.repoFullName` becomes **required**; throw if missing, do not default |
| `processSingleReview(reviewData)` | same |
| `fetchPullRequests()` | loop `getTrackedRepos()`, serially; per-repo cursor and per-repo `PRMetadata` |
| `attributionService.resolveProxyAuthor(prNumber, repo)` | takes the repo |
| `initializeDatabase({ confirm, repo })` | one repo per call — see rate limits below |
| `backfillService` | drop the `'android'` default; accept a repo |
| `awardBadges(prNumber, username)` | pooled — no repo needed |
| `updateStreak`, `pointsService`, `quarterlyService`, `challengeService` | pooled — unchanged |

**Webhook (the important one).** In `webhookService.js`, read
`payload.repository.full_name` and gate on it:

```js
const repoFullName = payload?.repository?.full_name;
if (!repoFullName || !isTracked(repoFullName)) {
    return { processed: false, reason: 'untracked_repo' };
}
```

Record the event with `status: 'ignored_untracked'` so the audit trail shows the rejection,
then pass `repoFullName` down. This closes the "any repo can earn points" hole described
above and is worth shipping even before multi-repo goes live.

**Scripts** (`simple-fetch-prs.js`, `run-backfill.js`, `backdate-point-history.js`): accept
`--repo owner/name`, defaulting to `getPrimaryRepo()`.

---

## Phase 3 — Rate Limits and Fetch Cost

The current fetch is already slow and N repos multiply it.

- `initializeDatabase` sleeps 3 s per PR (`contributorService.js:103`). On cru-terraform
  alone that is hours. **Keep it one repo per invocation** and never loop it over all repos.
- The rate-limit guard lives inside the page loop (`:60-70`). Extract it into a helper and
  call it once per repo per page, so a slow repo cannot exhaust the budget for the next one.
- Fetch repos **serially**, not with `Promise.all` — concurrent Octokit calls share one
  secondary-rate-limit budget.
- Treat **webhooks as the primary path and cron as reconciliation.** The 6-hour cron
  (`server.js:297`) then only catches missed deliveries, and its cost stays flat as repos
  are added.
- If a repo's fetch throws, log and continue to the next repo. One bad repo (permissions,
  archived, renamed) must not stop the others.

---

## Phase 4 — Per-Repo Read APIs

Add an optional `?repo=owner/name` query param. Two code paths:

- **No param → pooled.** Read `Contributor` counters exactly as today. Fast, unchanged.
- **With param → derived.** Aggregate from the truth tables:
  - PR count → `ProcessedPR` where `repoFullName = ?` and `action = 'authored'`
  - Review count → `ProcessedReview` where `repoFullName = ?`
  - Points → `SUM(points)` from `PointHistory` where `repoFullName = ?`

Endpoints to extend: `/leaderboard/all-time`, `/leaderboard/quarterly`,
`/leaderboard/points`, `/top-contributors`, `/top-reviewers`,
`/top-contributors-date-range`, `/top-reviewers-date-range`, `/activity`,
`/contributions/grid`, `/:username/points-history`, `/:username/points-summary`.

Validate `repo` against `isTracked()` and return 400 on an unknown value — never
interpolate it into a query unchecked.

**New endpoint:** `GET /api/repos` → the tracked list, for the UI dropdown.

**Two things that cannot be sliced per repo, and how to handle each:**

| Field | Problem | Recommendation |
| --- | --- | --- |
| `Contributor.quarterlyStats` (JSON) | One blob, no repo dimension | Derive per-repo quarterly numbers from `PointHistory.timestamp` + `repoFullName` instead of the blob. No schema churn; timestamps are already there. |
| Streaks (`currentStreak`, `longestStreak`) | A streak is inherently cross-repo under pooled scoring | **Do not offer a per-repo streak view.** Grey out the streak column when a repo filter is active, with a tooltip saying streaks are all-repo. |

---

## Phase 5 — UI

- Repo filter dropdown in `app/views/leaderboard.ejs` (plus `partials/`), populated from
  `GET /api/repos`, with an "All repos" default. Persist the choice in the URL query so a
  filtered view is linkable, and mirror it to `localStorage` for stickiness.
- Repo chip on each row of the activity feed and the profile PR list, so a pooled view still
  shows where each contribution came from.
- Admin page: PR-range info and the backfill controls become per-repo. They already read
  `PRMetadata`, which is keyed by repo, so this is mostly a repo selector plus passing the
  value through.
- When a repo filter is active, hide or grey the badge and streak columns — they are pooled
  and would be misleading next to filtered counts.

---

## Phase 6 — Access Control (needs your sign-off)

`app/middleware/ensureRepositoryAccess.js` gates the whole app on being a collaborator of
one repo, falling back to org membership on 404.

With several repos that logic breaks: someone with access to repo B but not cru-terraform
is denied the entire app.

**Recommendation: gate on CruGlobal org membership** — which is already the existing fallback
path (`:36-48`) — and drop the single-repo collaborator check.

Rationale: the data exposed is PR and review *counts* for org members across internal repos,
which every org member can already read from GitHub. Per-repo authorization would mean a
collaborator check per repo per request, and a leaderboard that differs per viewer.

This widens who can see the app, so confirm before implementing. If any tracked repo is ever
sensitive, the alternative is to filter the *repo list* per viewer rather than block access.

---

## Phase 7 — Terraform and GitHub Setup

In `cru-terraform/applications/game-ops/{stage,prod}/application.tf` (currently lines 22–23):

```hcl
REPO_OWNER = "CruGlobal"                    # default owner for bare names
REPO_NAMES = "cru-terraform,ticketmd"       # tracked repos
```

Keep `REPO_NAME` in place for one deploy cycle as the fallback, then remove it.

Also required:

- **Webhook per new repo** pointing at `POST /api/webhooks/github`, sharing the existing
  `GITHUB_WEBHOOK_SECRET`. One org-level webhook is simpler and is now safe because
  Phase 2 adds the allowlist check. Check whether
  `cru-terraform/applications/game-ops/github.tf` already manages webhooks.
- **`GITHUB_TOKEN` scope** must cover every tracked repo. Verify before adding a repo —
  a token without access fails as a 404, which reads like "no PRs" rather than an error.
- Follow the repo pre-commit rule in the root `CLAUDE.md`: run `pre-commit install` once,
  so `terraform_fmt` / `terraform_docs` apply to the commit instead of CI amending it.

---

## Phase 8 — Tests

Setup: `app/__tests__/setup.js:31` sets `REPO_NAME = 'test-repo'`. Add `REPO_NAMES` with two
repos so multi-repo is the default test shape.

New cases:

1. **Cross-repo PR numbers** — `repoA#100` and `repoB#100` both earn points. This is the
   regression test for the unique-key bug and is the single most important new test.
2. **Untracked repo rejected** — webhook payload for an unlisted repo returns
   `untracked_repo` and awards nothing.
3. **Missing repo throws** — `processSingleMergedPR` without `repoFullName` throws rather
   than defaulting.
4. **Per-repo aggregation** — `?repo=` totals match hand-counted fixture rows, and the
   pooled total equals the sum across repos.
5. **Per-repo cursor** — adding a repo backfills it without rewinding the others' cursors.
6. **One repo failing** does not abort the fetch loop for the rest.

Run with `npm ci` then `npx prisma generate` before `npm test` — the suite needs a generated
client.

---

## Rollout Order

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Ship Phases 0–2 with `REPO_NAMES="cru-terraform"` | **Zero behavior change.** Same repo, same numbers, now repo-aware. Verify leaderboard totals are unchanged before continuing. |
| 2 | Ship Phase 8 tests, then Phase 4 APIs | `?repo=cru-terraform` returns the same numbers as pooled |
| 3 | Add a second repo in **stage only** | New PRs land; watch webhook deliveries and cron logs |
| 4 | Backfill the new repo's history via the admin backfill | Historical rows appear with the right repo |
| 5 | Ship Phase 5 UI | Filter dropdown works |
| 6 | Repeat 3–4 in prod | |

Step 1 is deliberately a no-op release. If the leaderboard moves at step 1, the migration
backfill is wrong — stop and fix before adding any repo.

---

## Risks

| Risk | Detail | Mitigation |
| --- | --- | --- |
| **`checkForDuplicates` / `fixDuplicates` footgun** | `contributorService.js:1376` and `:1587` find and delete "duplicates" keyed on `prNumber`. After multi-repo, a legitimate `repoA#100` / `repoB#100` pair looks like a duplicate and **`fixDuplicates` would delete real data.** | Make both repo-aware **in Phase 1**, not Phase 4. Highest-severity item in this plan. |
| **Retroactive leaderboard reshuffle** | Backfilling a repo with years of history rewrites standings mid-quarter | Add repos at a quarter boundary, or start a new repo from a cutoff date. Announce either way. |
| **Bot noise varies by repo** | The `[bot]` login filter and `PROXY_BOT_LOGINS` (`attributionService.js:18-21`) were tuned for cru-terraform + TerraBloks | Sample a week of PRs from each new repo before enabling it |
| **Points inflation** | A high-volume repo can dominate a pooled leaderboard | Consider a per-repo point weight in `points-config.js` if it becomes a problem — not in v1 |
| **Rate limits** | N repos × pages × review calls | Webhooks primary, serial fetch, shared rate-limit guard (Phase 3) |
| **Wrong `PRMetadata` defaults** | `cru-Luis-Rodriguez/game-ops` defaults create a junk row on a missed upsert | Drop the defaults in Phase 1 |

---

## Docs to Update

- Root `CLAUDE.md`: the Environment Variables section lists neither `REPO_OWNER` nor
  `REPO_NAME` today. Add `REPO_NAMES` and document the fallback.
- `docs/API.md`: the new `?repo=` param and `GET /api/repos`.
- `docs/DEPLOYMENT.md`: webhook setup per repo, token scope requirement.
- `README.md`: features list still says "PR & Review Tracking" singular.

---

## Estimate

| Phase | Size |
| --- | --- |
| 0 — config module | Small |
| 1 — schema + migration + duplicate-checker fix | **Medium — highest risk** |
| 2 — ingest threading + webhook allowlist | Medium |
| 3 — rate limits | Small |
| 4 — read APIs | Medium |
| 5 — UI | Medium |
| 6 — access control | Small, but needs a decision |
| 7 — Terraform | Small |
| 8 — tests | Medium |

Phases 0–3 are the real work and are shippable on their own as a no-op hardening release.
Phases 4–5 deliver the visible feature.
