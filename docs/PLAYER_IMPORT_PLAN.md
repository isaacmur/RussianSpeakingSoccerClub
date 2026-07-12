# Player Import & Ghost-Profile Integration Plan

Bulk-import the 2026 stats as leaderboard baselines, create **claimable
"ghost" profiles** for players who haven't signed up, let admins **connect** a
ghost to a real account when that player finally joins, and let admins **register
ghosts for matches** so people who won't install the app can still play.

Decisions locked in with you:
- **Ghost scope:** the *full* canonical roster (~66) gets a ghost profile, not
  just the players with 2026 stats.
- **Unmatched stat rows:** I generate a reconciliation sheet you review/edit
  *before* anything is written — no auto-merging messy names.
- **Claiming:** always admin-confirmed, but the panel pre-highlights the likely
  match (by `tentative_email`, then by name/nickname).

---

## 1. The core design decision

Every stats-bearing table already keys on `profiles.id`:
`season_baselines`, `registrations`, `goals`, `match_results` all
`references profiles(id)`, and `get_leaderboard()` sums baselines straight out
of `player_stats`. **So an imported player is just a profile with a
`season_baselines` row — nothing about the leaderboard needs to change.** The
only blocker is that `profiles.id` is hard-FK'd to `auth.users(id)`, so a player
without an account can't be a profile.

Two ways to fix that were on the table:

| Option | Cost |
|---|---|
| **A. Separate `roster_players` table** | Every FK + the leaderboard view must learn about a second player entity. Big blast radius. |
| **B. Ghost profiles (chosen)** | Ghosts are just `profiles` rows with a random `id` and no `auth.users` row. Baselines / registrations / goals / leaderboard are **untouched**. |

The key realization that makes B cheap: **real users' `profiles.id` already
equals their `auth.uid()`** — that's what `is_admin()`, `is_active_member()`,
`p_self_read`, `r_insert_own`, etc. all rely on (`id = auth.uid()` /
`user_id = auth.uid()`). We **keep that invariant**. Real profiles keep
`id = auth uid`; ghosts get `gen_random_uuid()` ids that will never equal any
`auth.uid()`. That means:

- **No RLS policy changes. No helper-function changes. No client auth changes.**
  A ghost simply never satisfies `id = auth.uid()`, which is exactly right — a
  ghost has no session, so it should never self-read/write or count as a member.
- We only **drop the `profiles.id → auth.users(id)` FK** so ghost rows can exist,
  and add a small companion table for ghost provenance.

Trade-off of dropping that FK: we lose the automatic cascade that deleted a
profile when its auth user was deleted. Admins effectively never hard-delete auth
users, so we accept it (and can re-add an equivalent cleanup later if needed).

---

## 2. Data-model changes — migration `0013_ghost_players.sql`

Applied via the Supabase Dashboard SQL Editor (hosted-only workflow).

```sql
-- 1. Let profiles exist without an auth user (ghosts).
alter table profiles drop constraint profiles_id_fkey;
-- id keeps its type; real signups still set id = auth uid via handle_new_user.
alter table profiles alter column id set default gen_random_uuid();

-- 2. Companion table: provenance + the "unclaimed ghost" marker.
--    A row here EXISTS iff the profile is an unclaimed ghost. Claiming deletes it.
create table ghost_profiles (
  profile_id       uuid primary key references profiles(id) on delete cascade,
  canonical_name   text not null,
  nicknames        text,
  tentative_email  text,          -- from players_canonical, for claim suggestions
  approx_appearances int,
  notes            text,
  created_at       timestamptz default now()
);
alter table ghost_profiles enable row level security;
create policy gp_admin_all on ghost_profiles
  for all using (is_admin()) with check (is_admin());
-- Active members may READ ghost meta (registration picker needs names/emails):
create policy gp_member_read on ghost_profiles
  for select using (is_active_member());
```

Ghost profile rows themselves are created with `status = 'active'` (so they show
on the leaderboard and are registerable) and `role = 'player'`. They are
distinguished from real members purely by the presence of a `ghost_profiles`
row. Existing member-admin screens get a `where not exists (ghost_profiles…)`
filter so ghosts don't clutter the member queue.

**No changes needed to:** `player_stats`, `get_leaderboard()`,
`season_baselines`, `registrations`, `goals`, or any RLS policy/helper.

---

## 3. Import pipeline

### Step 1 — Generate the reconciliation sheet (I do this locally)
A Node script reads both CSVs and emits `player_reconciliation.csv`:

```
stats_name        | stats_row | matched_canonical | match_by     | action | baseline?
Boris             | 1         | Boris             | name         | link   | yes
Johathan          | 43        | Jonathan          | fuzzy (typo) | link   | yes
Semen             | 64        | Semyon            | fuzzy        | link   | yes
Igor Tall         | 8         | (none)            | -            | REVIEW | yes
Sal               | 16        | (none)            | -            | REVIEW | yes
...
Vadim (no stats)  | -         | Vadim             | canonical    | link   | no
```

- Stats columns map: `GAMES→games_played, WINS→wins, TIES→draws,
  LOSSES→losses, GOALS→goals (blank=0), PLUS/MINUS→plus_minus`.
- Names are matched canonical→stats with trimming + a nickname/typo table.
  Anything not confidently matched is flagged `REVIEW` — **never auto-merged**.
  (`Matt`≠`Matthew`, `Joe`≠`Joey`, `Sasha Ru`≠`Sasha SI` etc. are respected;
  the canonical `notes` column already documents these.)
- The `action` column is yours to edit: `link` (to that canonical), `new`
  (create a brand-new ghost for a stats-only person like `Sal`), or `skip`.

### Step 2 — You review & edit `player_reconciliation.csv`
This is the one manual gate. You resolve every `REVIEW` row.

### Step 3 — Generate the seed migration (I do this from your approved sheet)
`0014_player_import_2026.sql`, idempotent:

```sql
-- For each canonical/approved player: upsert a ghost profile keyed by a STABLE
-- deterministic id (so re-running doesn't duplicate), its ghost_profiles meta,
-- and — if they have 2026 stats — a season_baselines row for the 2026 season.
-- Uses current_season_id() / the 2026 seasons row.
insert into profiles (id, display_name, status, role) values
  ('<uuid>', 'Vadim', 'active', 'player'), …
on conflict (id) do nothing;

insert into ghost_profiles (profile_id, canonical_name, nicknames, tentative_email, approx_appearances, notes) values …
on conflict (profile_id) do update set …;

insert into season_baselines (season_id, user_id, games_played, wins, draws, losses, plus_minus, goals)
select s.id, '<uuid>', 46,21,9,16,5,1 from seasons s where s.year = 2026
on conflict (season_id, user_id) do update set …;
```

Deterministic ids (e.g. `uuid_generate_v5` of the canonical name, or a fixed
mapping I bake in) make the whole import safely re-runnable.

### Step 4 — Paste into the SQL Editor. Leaderboard now shows all 2026 players.

---

## 4. The Connection (claim) admin panel — `app/admin/connections.tsx`

New admin tab. Purpose: when a real person signs up, an admin merges their fresh
account into the matching ghost so the ghost's history/stats become theirs.

**What signup does today (unchanged):** `handle_new_user` creates a normal
`pending` profile with `id = auth uid`. Nothing auto-merges.

**The panel** lists `pending`/recently-joined real profiles (those *without* a
`ghost_profiles` row) on the left, and unclaimed ghosts on the right. For each
new signup it computes a **suggested ghost**:
1. exact `ghost_profiles.tentative_email` == the user's auth email → ⭐ top suggestion;
2. else name/nickname match against `canonical_name`/`nicknames`.

Admin taps **Link** to confirm. Auth email lookup is done server-side (client
can't read `auth.users`) via a `list_claim_candidates()` SECURITY DEFINER RPC
that returns each pending user + their email + the best-guess ghost.

**The merge** — one SECURITY DEFINER RPC, admin-only:

```sql
create function claim_ghost(p_real uuid, p_ghost uuid) returns void … as $$
  -- Repoint the ghost's history onto the real profile (real.id stays = auth uid,
  -- so RLS keeps working). ON CONFLICT guards against a real player who already
  -- has a row for the same game/season.
  update season_baselines b set user_id = p_real
    where user_id = p_ghost
    and not exists (select 1 from season_baselines x
                    where x.season_id=b.season_id and x.user_id=p_real);
  update registrations   set user_id = p_real where user_id = p_ghost
    and game_id not in (select game_id from registrations where user_id=p_real);
  update goals           set scorer_id = p_real where scorer_id = p_ghost;
  -- carry the nicer display name forward if the real one is just an email local-part
  delete from ghost_profiles where profile_id = p_ghost;
  delete from profiles       where id = p_ghost;   -- ghost consumed
  -- (admin still separately Admits the real profile to 'active' in Members)
$$;
```

After linking, the new member sees their full pre-app record on the leaderboard
under their own account. Because the ghost row is deleted, "unclaimed ghost" is
always an accurate set. The action is admin-reversible only by re-importing; a
"unlink"/undo is a nice-to-have we can add if you want it.

Edge case handled: a stats-only person (`Sal`) who was imported as a `new` ghost
is claimed the same way — the panel just won't have a canonical email suggestion.

---

## 5. Admin match sign-up for ghosts — extend `app/game/[id].tsx`

Requirement: admins register/withdraw roster players who have no account, as long
as they exist as a ghost profile.

- **DB:** already supported. `registrations.user_id → profiles(id)` accepts ghost
  ids, and `r_admin_all` already lets admins insert/update/delete any
  registration. The waitlist/promotion triggers work unchanged. **No migration
  needed** beyond 0013.
- **UI:** on the game screen, when `profile.role === 'admin'`, add an **"Add
  player"** control that opens a picker of eligible profiles — active members +
  ghosts (`display_name` from profiles, tag ghosts with a small "no app" badge).
  Selecting one upserts `{ game_id, user_id: <picked id>, status: 'registered' }`
  (same upsert the self-serve path uses; the BEFORE trigger waitlists if full).
  Each admin-added row in the signup list gets a remove (✕) affordance that sets
  `status = 'withdrawn'` — which also fires waitlist promotion correctly.
- The existing `SignupList` already renders `r.profiles?.display_name`, so ghosts
  appear by name with zero changes there.

**Notification caveat (by design):** notifications are delivered to the Supabase
Auth email. A ghost has no auth user, so `spot_opened`/reminder rows written for a
ghost are simply undeliverable — harmless, but the admin, not the app, tells that
person they're in. Worth surfacing a one-line note in the admin add-player UI.

---

## 6. Edge cases & risks

- **Re-running the import** is safe: deterministic ids + `on conflict` upserts.
- **`Matt` vs `Matthew`, `Joe` vs `Joey`, the two Sashas/Zhenyas/Igors/Mishas** —
  kept distinct; the reconciliation sheet is the guard, and canonical `notes`
  already flag every "confirmed distinct" pair.
- **A person signs up before being imported / linked** — they just look like a
  normal pending member with no history until an admin links them; no data loss.
- **Double-claim** (linking one real user to a ghost that was already claimed) is
  impossible once the ghost is deleted; the panel only lists live ghosts.
- **Dropping the auth FK** loses profile-on-auth-delete cascade — accepted; can be
  reinstated as a trigger if you ever bulk-delete auth users.
- **Season scoping** — baselines are written to the **2026** season row; if that
  row doesn't exist yet the seed creates/expects it (the app derives current
  season from America/New_York, already 2026).

---

## 7. Deliverables, in order

1. `0013_ghost_players.sql` — drop FK, `ghost_profiles` table + RLS. *(paste in SQL Editor)*
2. `list_claim_candidates()` + `claim_ghost()` RPCs — *(same migration or 0015)*.
3. Local script → **`player_reconciliation.csv`** for your review. **← your gate**
4. `0014_player_import_2026.sql` generated from your approved sheet. *(paste in SQL Editor)*
5. Member-admin queries filtered to exclude ghosts (`app/admin/members.tsx`,
   `app/admin/baselines.tsx`).
6. `app/admin/connections.tsx` — the Connection panel + its route/tab entry.
7. Admin "Add player" + remove controls on `app/game/[id].tsx`.
8. Types in `lib/types.ts` (`GhostProfile`, claim-candidate row) + a short
   `PHASE7_SETUP.md` matching the repo's per-phase doc convention.

Nothing here changes the leaderboard math, the registration engine, or existing
RLS — the whole feature rides on the one insight that ghosts are just profiles
without a session.
```
