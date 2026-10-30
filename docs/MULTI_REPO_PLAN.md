# Multi-Repo Tracking — Implementation Plan

**Status:** Draft — not started
**Goal:** Track PRs and reviews from more than one CruGlobal repository. Today only
`cru-terraform` is tracked; the repo we want to add is **`cru-ansible-aws`**.

> **Revision 2.** Rewritten after review on PR #174. All line references below were
> re-verified against `main` at `fcbbe74`; revision 1 was surveyed against a local
> checkout 118 commits stale, so its references were wrong and it cited a script that
> no longer exists. Four review findings are incorporated (Phases 1, 1b, 6, and the
> `FetchDate` carry-over), plus two additional blockers found while re-verifying —
> see [Prerequisites](#prerequisites-must-clear-before-phase-1).

---

## Decisions Already Made

| Decision | Choice |
| --- | --- |
| **Scoring model** | One pooled score per person. Every tracked repo adds to the same total, badges, streaks and quarterly stats. |
| **Per-repo views** | Supported, but *derived* — computed on read from the PR / review / points rows, which each carry the repo they came from. No per-repo counters, badges or streaks. |
| **Repo list source** | Terraform environment variable (`REPO_NAMES`), managed in `cru-terraform/applications/game-ops/{stage,prod}/application.tf`. |
| **First repo to add** | `cru-ansible-aws` |

Why the pooled model: `Contributor` holds ~25 denormalized counter and badge columns
(`prCount`, `reviewCount`, `allTimePoints`, `currentStreak`, `first100PrsAwarded`, …).
A per-repo scoring model would have to move all of them into a new per-repo table and
rewrite every badge, streak, quarterly and challenge code path. Pooled scoring leaves
those columns untouched.

Why per-repo views still work: `ProcessedPR`, `ProcessedReview` and `PointHistory` are
truth tables — one row per real event. Once each row records its repo, an exact per-repo
leaderboard is a `GROUP BY` away.

**`cru-ansible-aws` is a private repository** (verified via `gh repo view`). That single
fact drives Phase 6 and is the reason the access-control question is no longer a
formality.

---

## Prerequisites — Must Clear Before Phase 1

Two blockers sit outside this repo. Neither was in the original plan; both were found
while re-verifying against current `main`.

### P1. `--skip-generate` blocks every schema change

`cru-terraform/applications/game-ops/{stage,prod}/application.tf:40` both run:

```
npx prisma db push --accept-data-loss --skip-generate
```

Prisma 7 removed `--skip-generate` and **exits 1 if it is passed** (`CLAUDE.md:96`).
`main` is already on Prisma 7 (#171, commit `5fa8777`). So the `db-migrate` container
fails on the next deploy to either environment, and **no schema change can reach any
environment until that flag is dropped in cru-terraform.**

Phase 1 is dead in the water until this is fixed. It is a one-line change in each of two
files, but it is in another repo and needs its own PR and Atlantis apply.

### P2. Webhooks are not configured today

- There is **no webhook resource** anywhere in `cru-terraform/applications/game-ops/`
  (`github.tf` manages the repository, teams, collaborators and the branch ruleset — no
  webhook).
- There is **no `GITHUB_WEBHOOK_SECRET`** in either environment's `parameters` block.
- `verifyWebhookSignature` (`app/middleware/webhookVerification.js:9-14`) returns **500**
  when the secret is unset.

So the 6-hour cron is currently the *only* ingest path. Phase 3 below recommends making
webhooks primary — that is net-new infrastructure work, not a configuration tweak.

Secrets can also be set out of band through `cru-cli`, so confirm with
`cru application secrets -n game-ops -e p` before concluding the secret is truly absent.

---

## How Schema Changes Actually Reach Production

This governs all of Phase 1 and was the single biggest error in revision 1.

| Environment | Mechanism | Reads |
| --- | --- | --- |
| Production / stage (ECS) | `prisma db push --accept-data-loss` in a `db-migrate` container | **`schema.prisma` only** |
| Local docker-compose | `prisma migrate deploy` | `prisma/migrations/` |

Consequences that constrain the design:

1. **`prisma/migrations/*.sql` never executes in production.** There is no
   `_prisma_migrations` table there. Anything expressible only as raw SQL — a data
   backfill, a rename, a trigger — will not reach production no matter how correct the
   migration file is.
2. **`db push` cannot add a required column with no default to a table that already has
   rows.** There is no value to put in the existing rows.
3. `db push` makes the database match `schema.prisma`, so an object the file does not
   describe can also be *dropped*.

---

## Current State — Where the Single-Repo Assumption Lives

### 1. Module-level constants (read once at import)

| File | Line | Code |
| --- | --- | --- |
| `app/services/contributorService.js` | 21–22 | `const repoOwner = process.env.REPO_OWNER; const repoName = process.env.REPO_NAME;` |
| `app/services/attributionService.js` | 11–12 | same pair |
| `app/services/backfillService.js` | 15–16 | `process.env.REPO_NAME \|\| 'android'` — stale default, unrelated repo |
| `app/middleware/ensureRepositoryAccess.js` | 29–30 | `process.env.REPO_NAME \|\| 'cru-terraform'` |
| `app/services/discussionService.js` | 25–26, 169–170 | read per call, already fine |

Because the first three are module-level, no function can be called for a second repo.
This is the core refactor.

*(Revision 1 also listed `app/scripts/simple-fetch-prs.js` — that file has since been
deleted.)*

### 2. The database has no repo dimension

Only `PRMetadata` is keyed by repo (`@@unique([repoOwner, repoName])`,
`schema.prisma:244`) — and its defaults name the wrong repo entirely
(`cru-Luis-Rodriguez` / `game-ops`, `schema.prisma:232-233`).

Every event table is repo-blind:

| Model | Current key | Line |
| --- | --- | --- |
| `ProcessedPR` | `@@unique([contributorId, prNumber, action])` | `schema.prisma:147` |
| `ProcessedReview` | `@@unique([contributorId, prNumber, reviewId])` | `schema.prisma:160` |
| `Contribution` | `@@unique([contributorId, date])` | `schema.prisma:83` |
| `Review` | `@@unique([contributorId, date])` | `schema.prisma:102` |
| `PointHistory` | `prNumber` only, no unique | — |
| `FetchDate` | one global row, `id: 'last-fetch'` | `contributorService.js:250-256` |

**This is a correctness bug, not just a gap.** `cru-terraform#4200` and
`cru-ansible-aws#4200` produce the same `ProcessedPR` key, so the second is silently
dropped as a duplicate (`contributorService.js:306`, `reason: 'duplicate'`). A second
repo loses PRs from day one.

### 3. The webhook throws the repo away

`app/services/webhookService.js:38-39` and `:67-68` destructure
`{ action, pull_request, review }` and never touch `payload.repository`. So:

- The repo is not passed to `processSingleMergedPR`, so it cannot be stored.
- **There is no allowlist check.** If an org-level webhook is ever pointed at this app,
  every PR in every repo it covers silently earns points.

### 4. Reads assume one repo implicitly

`getTopContributors`, `getAllTimeLeaderboardController` and `/api/activity` read the
pooled `Contributor` counters. Correct for pooled totals and unchanged by this work — but
there is no way to ask "just cru-terraform", because the rows carry no repo.

---

## Phase 0 — Repo Configuration Module

**New file: `app/config/repos.js`**

- `REPO_NAMES` — comma-separated. Accepts bare names (`cru-ansible-aws`) resolved against
  `REPO_OWNER`, or fully qualified (`CruGlobal/cru-ansible-aws`).
- Falls back to `REPO_OWNER` + `REPO_NAME` when `REPO_NAMES` is unset, so the current
  deploy keeps working with no Terraform change.
- Exports:
  - `getTrackedRepos()` → `[{ owner, name, fullName }]`
  - `isTracked(fullName)` → boolean (case-insensitive)
  - `getPrimaryRepo()` → first entry, for scripts and single-repo admin actions
  - `LEGACY_REPO_FULL_NAME` → `'CruGlobal/cru-terraform'`, used by the Phase 1 default
    and the Phase 1c cursor carry-over

Trim, drop blanks, de-duplicate, and throw on startup if the list is empty — a silently
empty list would leave the app looking healthy while tracking nothing.

---

## Phase 1 — Schema Change (`schema.prisma`, not a migration file)

Add to `ProcessedPR`, `ProcessedReview`, `PointHistory`, `Contribution` and `Review`:

```prisma
repoFullName String @default("CruGlobal/cru-terraform") @map("repo_full_name")
```

**The `@default` is permanent and load-bearing.** It is what lets `db push` add the column
to tables that already have rows (constraint 2 above), and it backfills every existing row
with the correct value in the same step. Revision 1 proposed dropping the default in a
later step so a missing repo would fail loudly at the database — that cannot work here:
`db push` would then be asked to hold a required column with no default, and there is no
in-deploy sequencing to get there.

Enforce required-ness **in application code instead** (Phase 2): `processSingleMergedPR`
and `processSingleReview` throw when `repoFullName` is absent. That is the only layer that
can enforce it, so the tests for it in Phase 8 are not optional.

### 1a. Fix the unique keys

```prisma
// ProcessedPR
@@unique([contributorId, repoFullName, prNumber, action])
@@index([repoFullName, prNumber])

// ProcessedReview
@@unique([contributorId, repoFullName, prNumber, reviewId])
@@index([repoFullName, prNumber])
```

### 1b. `Contribution` and `Review` need the same treatment

Adding `repoFullName` while leaving `@@unique([contributorId, date])` in place would be
worse than doing nothing. The upserts at `contributorService.js:186` and `:198` key on
that compound unique (`where: { contributorId_date: … }`), so a second repo's same-day
event **increments the first repo's row** rather than creating its own. The row would then
carry whichever repo happened to create it while its `count` silently mixed both — and
Phase 4 exposes `/contributions/grid` as repo-filterable, so it would report confidently
wrong numbers.

```prisma
// Contribution and Review
@@unique([contributorId, repoFullName, date])
@@index([contributorId, date])
```

Then update both upserts to the new compound key
(`where: { contributorId_repoFullName_date: … }`).

**Streaks stay correct through this change, and that is worth checking rather than
assuming.** `weeklyTally` (`streakService.js:38-52`) collects `dayKey(row.date)` into a
`Set`, and `reconcileWeeklyStreaks` (`:229-238`) uses the same pattern. Two rows for one
day across two repos collapse to one day, which is the intended pooled behavior — a person
who merged in two repos on Tuesday contributed on Tuesday, once. Keep the
`@@index([contributorId, date])` so those queries stay cheap.

### 1c. Carry the fetch cursor over

`FetchDate` needs no new column — it is already a single-row cursor keyed by `id`
(`contributorService.js:250-256`). Make it per-repo by using the repo full name as the id.

Two changes, both required:

1. `getLastFetchDate` (`:242-247`) currently does
   `findFirst({ orderBy: { date: 'desc' } })`. **This must become
   `findUnique({ where: { id: repoFullName } })`.** With several rows, `findFirst` hands
   every repo the newest cursor of *any* repo, so a newly added repo would skip straight
   past its own history.
2. **The existing `'last-fetch'` row must be carried over.** Simply switching the id
   orphans it, `cru-terraform` finds no cursor, and it falls through to the 90-day default
   on the same line — re-fetching 90 days on the first run after deploy. That would break
   the "step 1 is a no-op" promise and burn exactly the rate budget Phase 3 exists to
   protect.

Because migration files never run in production, the carry-over has to live in code:

```js
const getLastFetchDate = async (repoFullName) => {
    const row = await prisma.fetchDate.findUnique({ where: { id: repoFullName } });
    if (row) return row.date;

    // One-time carry-over: before per-repo cursors, a single row held the cursor for
    // what is now the legacy repo. Adopt it instead of rewinding 90 days.
    if (repoFullName === LEGACY_REPO_FULL_NAME) {
        const legacy = await prisma.fetchDate.findUnique({ where: { id: 'last-fetch' } });
        if (legacy) return legacy.date;
    }

    return new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
};
```

This is idempotent and needs no ops step. Leave the legacy row in place; it stops being
read once the per-repo row is written on the first successful fetch.

A **newly added** repo genuinely has no cursor and *should* get the 90-day default — or
better, an explicit start date via the Phase 4 backfill controls, so the window is a
decision rather than an accident.

### 1d. Also in this phase

- Drop the wrong `PRMetadata` defaults (`schema.prisma:232-233`).
- **Make `checkForDuplicates` (`:1376`) and `fixDuplicates` (`:1587`) repo-aware.** See
  Risks — this cannot wait for a later phase.

### Verification

Write the migration file too, so docker-compose stays in step and the intent is
reviewable — but verify against the real database, because that file is not what ran:

```sql
SELECT repo_full_name, count(*) FROM processed_prs GROUP BY 1;   -- expect one row
SELECT repo_full_name, count(*) FROM contributions  GROUP BY 1;  -- expect one row
```

---

## Phase 2 — Thread the Repo Through Ingest

Delete every module-level `repoOwner` / `repoName` const. Pass a `repo` object
(`{owner, name, fullName}`) explicitly.

| Function | Change |
| --- | --- |
| `processSingleMergedPR(prData)` | `prData.repoFullName` **required**; throw if missing, never default |
| `processSingleReview(reviewData)` | same |
| `updateContributor(username, type, date, merged, repoFullName)` | needed for the 1b upserts |
| `fetchPullRequests()` | loop `getTrackedRepos()` serially; per-repo cursor and `PRMetadata` |
| `attributionService.resolveProxyAuthor(prNumber, repo)` | takes the repo |
| `initializeDatabase({ confirm, repo })` | one repo per call — see Phase 3 |
| `backfillService` | drop the `'android'` default; accept a repo |
| `awardBadges`, `updateStreak`, `pointsService`, `quarterlyService`, `challengeService` | pooled — unchanged |

**Webhook.** In `webhookService.js`, read `payload.repository.full_name` and gate on it:

```js
const repoFullName = payload?.repository?.full_name;
if (!repoFullName || !isTracked(repoFullName)) {
    return { processed: false, reason: 'untracked_repo' };
}
```

Record the event with `status: 'ignored_untracked'` so the audit trail shows the rejection.
This closes the "any repo can earn points" hole and is worth shipping on its own merit,
independent of multi-repo.

**Scripts** (`run-backfill.js`, `backdate-point-history.js`): accept `--repo owner/name`,
defaulting to `getPrimaryRepo()`.

---

## Phase 3 — Rate Limits and Fetch Cost

- `initializeDatabase` sleeps 3 s per PR (`contributorService.js:114`). On cru-terraform
  alone that is hours. **One repo per invocation**, never looped over all repos.
- The rate-limit guard sits inside the page loop (`:69-75`). Extract it so it runs once per
  repo per page and a slow repo cannot exhaust the budget for the next one.
- Fetch repos **serially**. Concurrent Octokit calls share one secondary-rate-limit budget.
- If a repo's fetch throws, log and continue. One archived, renamed or permission-denied
  repo must not stop the others.
- **Webhooks as primary, cron as reconciliation** is the right end state — the 6-hour cron
  (`server.js:383`) then only catches missed deliveries and its cost stays flat as repos
  are added. But per **P2** that is new infrastructure, not a switch. Until it exists,
  every added repo multiplies the cron's cost linearly, which is the real argument for
  doing P2 before adding the second repo rather than after.

---

## Phase 4 — Per-Repo Read APIs

Optional `?repo=owner/name`. Two paths:

- **No param → pooled.** Read `Contributor` counters as today. Fast, unchanged.
- **With param → derived.** Aggregate from the truth tables:
  - PRs → `ProcessedPR` where `repoFullName = ?` and `action = 'authored'`
  - Reviews → `ProcessedReview` where `repoFullName = ?`
  - Points → `SUM(points)` from `PointHistory` where `repoFullName = ?`
  - Grid → `Contribution` / `Review` where `repoFullName = ?` (correct only after 1b)

Endpoints: `/leaderboard/all-time`, `/leaderboard/quarterly`, `/leaderboard/points`,
`/top-contributors`, `/top-reviewers`, `/top-contributors-date-range`,
`/top-reviewers-date-range`, `/activity`, `/contributions/grid`,
`/:username/points-history`, `/:username/points-summary`.

Validate `repo` against `isTracked()` and return 400 on anything else. Phase 6 adds a
second, per-viewer check on top of this one.

**New:** `GET /api/repos` → the repo list this viewer may see (Phase 6).

**Two things that cannot be sliced per repo:**

| Field | Problem | Handling |
| --- | --- | --- |
| `Contributor.quarterlyStats` (JSON) | One blob, no repo dimension — and CLAUDE.md notes it is a *cache*, with real standings derived from `point_history` | Derive per-repo quarterly numbers from `PointHistory.timestamp` + `repoFullName`. Matches how archival already works. |
| Streaks | Inherently cross-repo under pooled scoring (see 1b) | **Do not offer a per-repo streak view.** Grey the streak column when a filter is active, with a tooltip saying streaks are all-repo. |

---

## Phase 5 — UI

- Repo filter dropdown in `app/views/leaderboard.ejs` and `partials/`, populated from
  `GET /api/repos`, defaulting to "All repos". Persist in the URL query so a filtered view
  is linkable; mirror to `localStorage` for stickiness.
- Repo chip on activity-feed rows and profile PR lists, so a pooled view still shows where
  each contribution came from — subject to Phase 6's title rules.
- Admin: PR-range info and backfill controls become per-repo. They already read
  `PRMetadata`, which is keyed by repo, so this is mostly a selector plus passing it
  through.
- When a filter is active, hide or grey the badge and streak columns. They are pooled and
  would be misleading beside filtered counts.

---

## Phase 6 — Access Control (blocking decision — needs Luis, likely InfoSec)

Revision 1 recommended gating on CruGlobal org membership, reasoning that the data is
already readable on GitHub by any org member. **That reasoning does not survive the choice
of `cru-ansible-aws`,** and the review was right to reject it.

The facts:

- **`cru-ansible-aws` is private** (verified). Org membership does *not* confer read access
  to it, so "they can already see this on GitHub" is false.
- **The app is internet-facing.** It sits on the shared production applications ALB
  (`prod/application.tf:12`) serving `https://game-ops.cru.org`. There is no VPN or IAP in
  front of it.
- **`ensureRepositoryAccess` is therefore the only control.**
- The game-ops repository is itself `visibility = "public"` (`github.tf`), so the app's
  behavior is public even though its data would not be.

What actually leaks is not only counts. `ProcessedPR.prTitle` is stored and rendered in
activity feeds and profile lists — **private-repo PR titles are the sensitive payload**,
since infrastructure PR titles routinely describe systems, roles and secret handling.

The current middleware also breaks outright under multi-repo: it gates the *whole app* on
being a collaborator of one repo, so someone with `cru-ansible-aws` but not `cru-terraform`
is locked out entirely.

**Recommended design** — defence split by sensitivity, rather than one global bar:

1. **App access:** CruGlobal org membership (the existing 404-fallback path,
   `ensureRepositoryAccess.js:47`). Replaces the single-repo collaborator check.
2. **Repo list and per-repo views:** filtered per viewer to repos they can actually read,
   via a cached collaborator check. `GET /api/repos` returns only those.
3. **PR titles and activity detail:** never rendered for a repo the viewer cannot read.
   This is the control that matters most.
4. **Pooled counters:** visible to all org members. A pooled number reveals that someone
   was active, not what they touched.

Point 4 is a deliberate, small residual disclosure and it is the part that needs sign-off
rather than a recommendation from me. If it is judged unacceptable, the alternative is to
compute pooled totals only across repos the viewer can read — correct, but the leaderboard
then differs per viewer and costs a per-repo permission check per request.

Cheapest way to sidestep the whole question: **only ever track repos every org member can
read.** That would mean not adding `cru-ansible-aws`, which is the actual goal — so it is
recorded here as the trade-off being knowingly accepted, not as a live option.

Do not implement Phases 4–5 for a private repo before this is settled.

---

## Phase 7 — Terraform and GitHub Setup

In `cru-terraform/applications/game-ops/{stage,prod}/application.tf` (lines 22–23 today):

```hcl
REPO_OWNER = "CruGlobal"                          # default owner for bare names
REPO_NAMES = "cru-terraform,cru-ansible-aws"      # tracked repos
```

Keep `REPO_NAME` for one deploy cycle as the Phase 0 fallback, then remove it.

Also required:

- **Drop `--skip-generate`** from `database_migrations` in both environments (line 40) —
  see **P1**. Nothing else in this plan can ship first.
- **Create the webhook** per tracked repo, or one org-level webhook, pointing at
  `POST /api/webhooks/github`, plus a `GITHUB_WEBHOOK_SECRET` parameter — see **P2**. No
  webhook is managed in Terraform today, so this is a new resource, and revision 1 was
  wrong to imply `github.tf` already handled it. An org-level webhook is the simpler shape
  and is safe once Phase 2 adds the allowlist.
- **`GITHUB_TOKEN` scope** must cover `cru-ansible-aws`. Verify before adding it — a token
  without access returns 404, which reads as "no PRs" rather than as an error.
- Run `pre-commit install` in cru-terraform so `terraform_fmt` / `terraform_docs` apply to
  the commit rather than CI amending it.

---

## Phase 8 — Tests

`app/__tests__/setup.js:30-31` sets `REPO_OWNER`/`REPO_NAME`. Add `REPO_NAMES` with two
repos so multi-repo is the default test shape.

1. **Cross-repo PR numbers** — `repoA#100` and `repoB#100` both earn points. The
   regression test for the unique-key bug; the most important new test here.
2. **Cross-repo same-day contributions** — two repos on one date produce two
   `Contribution` rows, the grid reports each separately, **and the streak counts that day
   once.** Covers 1b in both directions.
3. **Untracked repo rejected** — webhook for an unlisted repo returns `untracked_repo` and
   awards nothing.
4. **Missing repo throws** — `processSingleMergedPR` without `repoFullName` throws. This is
   the only enforcement of a field the database defaults, so it must be tested.
5. **Cursor carry-over** — with only a legacy `'last-fetch'` row present, the legacy repo
   adopts its date and does *not* rewind 90 days; a new repo does get the default.
6. **Per-repo aggregation** — `?repo=` totals match hand-counted fixtures, and the pooled
   total equals the sum across repos.
7. **One repo failing** does not abort the fetch loop for the rest.
8. **Phase 6 filtering** — a viewer without access to a repo sees neither it in
   `/api/repos` nor its PR titles in activity.

Run `npm ci`, then `npx prisma generate`, before `npm test`.

---

## Rollout Order

| Step | Action | Expected result |
| --- | --- | --- |
| 0 | **P1**: drop `--skip-generate` in cru-terraform | `db-migrate` container succeeds; schema changes can ship at all |
| 1 | Ship Phases 0–2 with `REPO_NAMES="cru-terraform"` | **Zero behavior change.** Same repo, same numbers, now repo-aware. Confirm the leaderboard has not moved and that the first cron run did *not* re-fetch 90 days. |
| 2 | Ship Phase 8 tests, then Phase 4 APIs | `?repo=cru-terraform` returns the same numbers as pooled |
| 3 | **Settle Phase 6.** Get the disclosure decision signed off | — |
| 4 | **P2**: webhook + secret, stage first | Deliveries arrive and verify |
| 5 | Add `cru-ansible-aws` to `REPO_NAMES` in **stage only** | New PRs land; watch webhook and cron logs |
| 6 | Backfill its history from an explicit start date | Historical rows appear with the right repo |
| 7 | Ship Phase 5 UI | Filter dropdown works, respecting Phase 6 |
| 8 | Repeat 4–6 in prod | |

Step 1 is deliberately a no-op release. If the leaderboard moves, or the cron re-fetches
90 days, the schema default or the 1c carry-over is wrong — stop and fix before adding any
repo.

---

## Risks

| Risk | Detail | Mitigation |
| --- | --- | --- |
| **`fixDuplicates` deletes real data** | `checkForDuplicates` (`:1376`) buckets by `prNumber` alone (`prCounts[prNum]`), and `fixDuplicates` (`:1587`) feeds the result to `deleteMany`. After multi-repo, a legitimate `repoA#100` / `repoB#100` pair looks like a duplicate. | Make both repo-aware **in Phase 1**. Highest-severity item in this plan. |
| **Private-repo disclosure** | PR titles from `cru-ansible-aws` on an internet-facing app | Phase 6, signed off before Phase 5 ships |
| **Silent mislabeling** | The permanent `@default` means a code path that forgets the repo writes `cru-terraform` instead of failing | Code-level throw (Phase 2) + test 4. The database cannot help here. |
| **Retroactive leaderboard reshuffle** | Backfilling years of history rewrites standings mid-quarter | Add repos at a quarter boundary, or from a cutoff date. Announce either way. |
| **Bot noise differs per repo** | The `[bot]` filter and `PROXY_BOT_LOGINS` (`attributionService.js:19`) were tuned for cru-terraform + TerraBloks. An Ansible repo has different automation. | Sample a week of `cru-ansible-aws` PRs before enabling it |
| **Points inflation** | A high-volume repo can dominate a pooled leaderboard | Consider per-repo point weights in `points-config.js` if it shows up — not in v1 |
| **Rate limits** | N repos × pages × review calls, with no webhooks yet (**P2**) | Serial fetch, shared guard, and land P2 before the second repo |
| **Wrong `PRMetadata` defaults** | `cru-Luis-Rodriguez/game-ops` (`:232-233`) creates a junk row on a missed upsert | Drop them in Phase 1 |

---

## Docs to Update

- Root `CLAUDE.md`: the Environment Variables section documents neither `REPO_OWNER` nor
  `REPO_NAME` today, though `GITHUB_ORG` is described in terms of `REPO_OWNER`. Add
  `REPO_NAMES` and the fallback.
- `docs/API.md`: the `?repo=` param and `GET /api/repos`.
- `docs/DEPLOYMENT.md`: webhook setup and the `GITHUB_TOKEN` scope requirement.
- `README.md`: the features list still describes tracking in the singular.

---

## Estimate

| Phase | Size |
| --- | --- |
| P1 — drop `--skip-generate` (cru-terraform) | Small, blocking |
| P2 — webhook + secret (cru-terraform) | Small, new infra |
| 0 — config module | Small |
| 1 — schema, unique keys, cursor carry-over, duplicate-checker fix | **Medium — highest risk** |
| 2 — ingest threading + webhook allowlist | Medium |
| 3 — rate limits | Small |
| 4 — read APIs | Medium |
| 5 — UI | Medium |
| 6 — access control | Small to build, **blocking to decide** |
| 7 — Terraform | Small |
| 8 — tests | Medium |

P1 plus Phases 0–3 are the real work and ship as a no-op hardening release. Phases 4–5
deliver the visible feature and are gated on Phase 6.
