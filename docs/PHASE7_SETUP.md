# Phase 7 — Ghost players & the roster import

Phase 7 brings the pre-app roster into the league as **ghost profiles**:
claimable, stats-bearing player records that have no `auth.users` account behind
them. The 2026 season now shows every player, not just app signups; admins can
**register ghosts** for games and **connect** a ghost to a real account when that
player finally joins.

The design rationale (why ghosts are just `profiles` rows, why no RLS changes are
needed) lives in [`PLAYER_IMPORT_PLAN.md`](PLAYER_IMPORT_PLAN.md). This doc is the
apply/verify checklist.

> **Hosted Supabase** (`xfjrdirhzrajwnvcfsge`), managed through the **web
> dashboard**. See PHASE1_SETUP.md for the migration workflow.

## 1. Apply the migrations (SQL Editor, in order)

**Dashboard → SQL Editor → New query** → paste each file's full contents → **Run**.

1. [`supabase/migrations/0013_ghost_players.sql`](supabase/migrations/0013_ghost_players.sql)
   - Drops the `profiles.id → auth.users(id)` FK and defaults `profiles.id` to
     `gen_random_uuid()`, so a profile can exist without an auth user. Real
     signups are unaffected — `handle_new_user` still sets `id = auth.uid()`
     explicitly.
   - Creates `ghost_profiles` (provenance + the "unclaimed" marker) with RLS:
     admins manage; active members may read (the registration picker needs names).
   - Adds two SECURITY DEFINER RPCs: `list_claim_candidates()` (pairs each real,
     unclaimed signup with its best-guess ghost, by email then name) and
     `claim_ghost(p_real, p_ghost)` (repoints the ghost's baseline / registrations
     / goals onto the real profile, then deletes the ghost).

2. [`supabase/migrations/0014_player_import_2026.sql`](supabase/migrations/0014_player_import_2026.sql)
   - Seeds **75 ghost profiles** (65 canonical roster + 10 stats-only) and **68
     2026 `season_baselines`** rows, from the approved
     [`player_reconciliation.csv`](player_reconciliation.csv).
   - Runs entirely inside **one `DO` block**. This is deliberate: the Supabase
     SQL Editor pools connections in transaction mode, so a temp staging table
     created as a standalone statement would vanish before the next statement.
     The block keeps it alive across all the inserts.
   - Ids are deterministic (`md5('rssc-ghost:' || name)::uuid`) and every insert
     is `ON CONFLICT`-guarded, so a re-run **before any claims** is safe.
     **Do not re-run it after ghosts have been claimed** — a claim deletes the
     ghost row, and re-seeding would resurrect it as a duplicate.

3. [`supabase/migrations/0015_create_ghost.sql`](supabase/migrations/0015_create_ghost.sql)
   - Adds the `create_ghost(p_name, p_email, p_nicknames, p_notes)` RPC (admin-only,
     SECURITY DEFINER) so an admin can add a **single** ghost on demand — for a new
     player who hasn't opened the app yet — instead of only via the bulk import.
     Writes the `profiles` + `ghost_profiles` pair atomically. `tentative_email`
     feeds the ⭐ email match when that person later signs up.
   - Backs the new **Add ghost player** form on the Connections screen.

Confirm with the sanity checks at the bottom of 0014:

```sql
select count(*) from ghost_profiles;                       -- expect 75
select count(*) from season_baselines b join seasons s on s.id = b.season_id
  where s.year = 2026;                                     -- expect 68
select * from get_leaderboard();                           -- 75 rows, ordered
```

## 2. What the reconciliation resolved

The 12 ambiguous stat rows were decided as: **Igor Tall**, **Sal**, **Denis son**,
**Yura Matchpoint**, **Shenthen**, **Andrew (sergey's son)**, **Nick Brazil**,
**Mike father**, **Sergey SI**, **Justin** → new stats-only ghosts (separate
people); **Oleg new (Stas)** → canonical **Stas**; **Igor** (row 56) → canonical
**Igor**. As a result canonical **Denis** and **Mike** carry no 2026 baseline of
their own (their "son"/"father" rows are different players). The full decision log
is the `action` / `review_note` columns of `player_reconciliation.csv`.

## 3. App features shipped

- **Members / Baselines admin queues** (`app/admin/members.tsx`,
  `app/admin/baselines.tsx`) — now exclude any profile with a `ghost_profiles`
  row, so 75 ghosts don't flood the "active" list or the baseline-entry form.
- **Connections** (`app/admin/connections.tsx`, new admin tab) — merges a new
  signup into its imported ghost. Each signup shows its ⭐ suggested ghost
  (email match, then name), or a searchable picker for a manual link. Linking is
  admin-confirmed and calls `claim_ghost`.
- **Add player** on the game screen (`app/game/[id].tsx`) — when the viewer is an
  admin, an "Add player" control opens a searchable picker of active members +
  ghosts (ghosts tagged **no app**) and registers the chosen one. Each signup row
  gets an ✕ to withdraw. Uses the same upsert/withdraw path as self-serve, so the
  waitlist trigger promotes/demotes correctly.

## 4. Verify the DoD

1. Open the **Table** — all 68 stats-bearing players appear, ordered by +/- then
   goals. Spot-check a few against `player_reconciliation.csv` (e.g. Boris +7,
   Vitalik −7, Kimran 22 goals).
2. **Members** admin screen → the "active" filter shows only real members, no
   ghosts. **Baselines** likewise lists only real active members.
3. On an upcoming game, as an **admin**, tap **Add player**, search a ghost (e.g.
   "Sasha Ru"), tap to add — they appear in Registered with a **no app** tag.
   Tap ✕ to withdraw; the count updates live.
4. **Connections**: create a test signup whose email equals a ghost's
   `tentative_email` (e.g. `borisleya@gmail.com` for Boris). It appears with a
   ⭐ email-match suggestion. Tap **Link** → confirm. The ghost disappears from
   the unclaimed list, and the new account inherits Boris's leaderboard row.
5. After linking, admit the member on **Members** as usual — the two steps are
   intentionally separate.

## Notes / carried forward

- **Notifications to ghosts are undeliverable by design.** Delivery targets the
  Supabase Auth email; a ghost has no auth user, so `spot_opened`/reminder rows
  written for one simply go nowhere. The Add-player UI says as much — the admin,
  not the app, tells that person they're in. See [[notifications-are-email]].
- **Claiming is one-way.** `claim_ghost` deletes the ghost, so "unclaimed ghost"
  is always an accurate set and double-claims are impossible. An undo/unlink is a
  future nice-to-have (would re-import).
- **Dropping the auth FK** removed the profile-on-auth-delete cascade. Admins
  don't hard-delete auth users; reinstate as an `AFTER DELETE` trigger on
  `auth.users` if that ever changes.
- **No leaderboard / registration / RLS math changed.** The whole feature rides on
  ghosts being ordinary `profiles` rows whose id never equals any `auth.uid()`.
