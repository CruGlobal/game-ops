# Scripts

One-off and operational scripts. All of them talk to whatever `DATABASE_URL` points at,
so check which database you are aimed at before running anything.

`.env` is loaded from the **repository root** (`join(__dirname, '../../.env')`), not from
`app/`.

## Recompute / reconcile (safe to re-run)

These derive their results from durable history, so running them twice produces the same
answer.

| Script | npm alias | What it does |
|---|---|---|
| `recompute-alltime-from-history.js` | `recompute:alltime:history` | Rebuilds `allTimePoints` by summing `point_history`. Supersedes the old flattener that multiplied counts by fixed point values. |
| `recompute-quarter-history.js` | `recompute:quarter:history` | Rebuilds quarterly stats for past periods from `point_history`. |
| `recompute-quarter-fallback.js` | `recompute:quarter:fallback` | Rebuilds the current quarter when `point_history` is unavailable, from the Contribution/Review aggregates. |
| `reconcile-challenge-awards.js` | `reconcile:challenge:awards` | Finds participations flagged complete whose reward was never paid, and pays them. Takes `--dry-run`. |
| `verify-quarter-user.js` | `verify:quarter:user` | Prints one contributor's quarterly figures next to the history they derive from. Read-only. |
| `backdate-point-history.js` | `backdate:point-history` | Writes `point_history` rows for activity that predates point tracking. |
| `run-backfill.js` | — | Drives the backfill service over a date range. |
| `setup/init-quarterly.js` | — | Seeds `quarter_settings` on a fresh database. |

## Completed remediation (kept for the record)

Each was written for one incident, ran once, and is dry-run by default. Re-running is
harmless — they no-op when there is nothing to fix.

- `merge-case-duplicate-contributors.js` — folded five contributors that had been split
  across two rows by username casing into the row holding their history.
- `backfill-username-lower.js` — populated `username_lower` for rows predating the
  column, so its unique constraint actually enforces something.
- `reconcile-daily-review-aggregate.js` — rebuilt the daily `reviews` counts from
  `processed_reviews` after the counter drift was repaired.

## Do not run

- `cleanup-duplicate-achievements.js` — dedupes achievements by `(contributor, points)`,
  so it would now delete legitimately distinct achievements that happen to be worth the
  same. No dry-run guard. Superseded by the `(contributor_id, achievement_id)` unique
  constraint, which prevents the duplicates it was written to clean up.
Removed for the same reason: `test-workweek-streaks.js` wrote a real `streak-test-user`
into whatever database was configured, cleaned up only on success, and asserted the
retired consecutive-day streak model. The unit tests cover the weekly tally.

## Notes

Two scripts were removed rather than kept:

- `simple-fetch-prs.js` attributed PRs by raw `pr.user.login` without the proxy-bot and
  username-casing resolution the live pipeline applies, and deduped against a different
  key than `processed_prs`. Running it re-introduced contributor forks, bot attribution
  and counter drift. Its point values (10/+5/+10) also contradicted `points-config.js`
  (40/15).
- `recalculate-points.js` set `totalPoints = prCount * 40 + reviewCount * 15`, discarding
  label-based PR points, achievements, challenge rewards and streak bonuses — all of
  which are recorded in `point_history`. Use `recompute:alltime:history` instead.
