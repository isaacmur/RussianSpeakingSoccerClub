# Phase 5 — Results & Reports

Phase 5 is code-complete: the admin result-entry screen (score steppers, a
match-report text box, per-attendee Team A/B assignment, and per-scorer goal
counts with a live A/B tally), the atomic write RPC, RLS for match reports, and
the read-only report screen wired into Matchday (members) and the Reports tab
(report viewers).

> **Hosted Supabase** (`xfjrdirhzrajwnvcfsge`), managed through the **web
> dashboard**. See PHASE1_SETUP.md for the migration workflow.

## 1. Apply the migration (SQL Editor)

**Dashboard → SQL Editor → New query** → paste the full contents of
[`supabase/migrations/0011_results_reports.sql`](supabase/migrations/0011_results_reports.sql)
→ **Run**. It should finish with no errors.

`0011_results_reports.sql` —

- **RLS** for `match_results` / `goals`: `select` for members + report viewers
  (`can_view_reports()`), `all` (write) for admins only.
- **`submit_match_result(game_id, a_score, b_score, summary, teams, goals)`** —
  one `SECURITY DEFINER` RPC that upserts `match_results`, replaces `goals`,
  writes each attendee's `registrations.team`, flips the game to `completed`,
  and enqueues one `results_posted` notification per registered player — all in
  a single transaction, so a failure never leaves a half-written result.
  Re-submittable (an admin can correct a score); the notification fires only the
  first time.
- **`get_match_report(game_id)`** and **`list_match_reports()`** — the read
  path, both `SECURITY DEFINER` and guarded by `can_view_reports()`. Report
  **viewers** are not `is_active_member()`, so they have no direct `select` on
  `games` / `registrations` / `profiles`; these RPCs are the only way they load
  a report (active members read through the same RPCs for uniformity).

The `create policy` statements will error if the script is run twice — each is
paired with a `drop policy if exists`, so a clean re-run is fine; a partial
re-run may need the one failing statement dropped first.

## 2. Verify the DoD

1. As admin, take a game past kickoff (or **Admin · Schedule → Lock**). A
   **Enter result** chip appears on that game's row → tap it.
2. Punch in a score, write a short report, assign each attendee to **A** or
   **B**, and add goals to a couple of scorers. The **Goals A–B** tally updates
   live and flags (in `luna`) when it doesn't match the scoreline (own goals are
   a legitimate reason). **Save result.**
3. **Standings update immediately** — open the **Table** tab (any tier):
   winners' `+/-` and the scorers' Golden Boot totals reflect the game.
4. The game now shows **Completed** on Matchday and opens its **match report**
   (score, summary, per-team sheets with goal tallies) instead of game detail.
5. As a **report-viewer** account: the **Reports** tab lists the published
   report and opens it read-only; the viewer still cannot register or chat.
6. Each registered player gets a `results_posted` Alert (and an email, unless
   they toggled "Results posted" off on Profile). Tapping the Alert opens the
   report.

**Inspect in the SQL Editor:**

```sql
select * from match_results where game_id = '<id>';
select scorer_id, team, count from goals where game_id = '<id>';
select user_id, team from registrations where game_id = '<id>' and team is not null;
select * from get_match_report('<id>');
```

## Notes / carried forward

- **Scores vs. goals** — `match_results.team_a_score`/`team_b_score` is the
  authoritative scoreline (entered on the steppers). The `goals` rows drive only
  the Golden Boot and may legitimately not sum to the score (own goals, keeper
  errors). The entry screen surfaces the mismatch but never blocks on it.
- **Who counts in the standings** — only attendees given a Team A/B side appear
  in `player_stats` (the view requires `registrations.team is not null`).
  Registered players left unassigned are treated as no-shows for stats.
- **`results_posted` delivery** — the email path and pref toggle already shipped
  in Phase 4; this phase is what starts inserting the rows. Viewers don't get
  the email (the function sends only to `active` recipients) and aren't
  registrants anyway.
- **`chat_mention`** — the last unwired notification type; it starts flowing in
  Phase 6 (Messaging).
