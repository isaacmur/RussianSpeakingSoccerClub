# Phase 2 — Seasons & Leaderboard

Phase 2 is code-complete: season derivation + auto-assignment, the season-scoped
`player_stats` view, the `get_leaderboard()` security-definer RPC, `season_baselines`
RLS, the league-table leaderboard (Plus-Minus / Golden Boot tabs) wired for all
three read tiers, and the admin baselines entry screen.

> **Hosted Supabase** (project `xfjrdirhzrajwnvcfsge`), managed through the
> **web dashboard** — see PHASE1_SETUP.md for the migration workflow + the
> required "disable email confirmation" step. If the `get_leaderboard` RPC
> 404s, these migrations haven't been applied yet.

## 1. Apply the new migrations (SQL Editor)

**Dashboard → SQL Editor → New query** → paste and **Run**, in order:
[`supabase/migrations/0003_seasons.sql`](supabase/migrations/0003_seasons.sql),
then [`supabase/migrations/0004_player_stats.sql`](supabase/migrations/0004_player_stats.sql).

`0003_seasons.sql` seeds the **2026** season (idempotent), and adds
`current_season_id()` + the `set_game_season` trigger. `0004_player_stats.sql`
adds the `player_stats` view, `get_leaderboard()` RPC, and RLS on `seasons` +
`season_baselines`. Confirm it landed:

```bash
# should return 200 with an (empty) JSON array, not 404
curl -s -o /dev/null -w "%{http_code}\n" \
  "$EXPO_PUBLIC_SUPABASE_URL/rest/v1/rpc/get_leaderboard" \
  -X POST -H "apikey: $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Authorization: Bearer $EXPO_PUBLIC_SUPABASE_ANON_KEY" \
  -H "Content-Type: application/json" -d '{}'
```

## 2. Verify the DoD

With **zero games/results** in the DB the board should render for every tier:

- **Active** member → **Table** tab shows the league table (all zeros, or
  baseline-only numbers), with Plus-Minus / Golden Boot toggle.
- **Viewer** → `(viewer)` Table screen, same board, read-only.
- **Pending / rejected** → `(pending)` Table screen, same board.

**Critical risk to test explicitly:** confirm a `pending`-status account can
actually load the board — it reads only through the `get_leaderboard()`
security-definer RPC (no table select grant). In the SQL editor:

```sql
-- simulate a pending user
set local role authenticated;
set local request.jwt.claim.sub = '<pending-user-uuid>';
select * from get_leaderboard();     -- should return rows, not error
select * from season_baselines;      -- should be blocked (RLS default-deny for non-members)
```

## 3. Admin baselines

1. On the Profile tab (admin only) → **Admin · Baselines**.
2. Each active member lists with their current baseline (or "No baseline set").
   Tap **Edit**, enter the six pre-app stats, **Save baseline** (upsert into
   `season_baselines` for the current season).
3. Return to any Table view → the numbers now reflect the saved baseline
   (leaderboard query is invalidated on save; screens also refetch on focus).

To sanity-check the compute path once Phase 5 exists, a completed game with
`registrations.team` + `match_results` + `goals` should add to these baselines
in the same board (`baseline + computed`, current season only).

## Files in this phase

- `supabase/migrations/0003_seasons.sql` — 2026 seed, `current_season_id()`,
  `set_game_season` trigger (must precede Phase 3's first game insert).
- `supabase/migrations/0004_player_stats.sql` — `player_stats` view,
  `get_leaderboard()` RPC (`revoke public` / `grant authenticated`), RLS on
  `seasons` + `season_baselines`.
- `components/leaderboard.tsx` — shared league-table board used by all tiers.
- `app/(pending)/leaderboard.tsx`, `app/(viewer)/leaderboard.tsx`,
  `app/(tabs)/leaderboard.tsx` — wired to the board.
- `app/admin/baselines.tsx` — per-player season baseline entry.
