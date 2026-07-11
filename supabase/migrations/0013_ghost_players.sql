-- 0013_ghost_players.sql
-- Phase 7: ghost (claimable) player profiles.
-- A "ghost" is a profiles row that has NO auth.users row behind it, so a player
-- who has never opened the app can still own a leaderboard baseline, be
-- registered for a game, and later be *claimed* (merged) onto their real
-- account when they sign up.
--
-- The whole feature rides on one invariant that already holds: a real user's
-- profiles.id equals their auth.uid(). is_admin()/is_active_member()/p_self_read
-- etc. all test `id = auth.uid()`. Ghosts get gen_random_uuid() ids that can
-- never equal any auth.uid(), so they never self-read/write or count as members
-- WITHOUT ANY RLS OR HELPER CHANGES. The only schema blocker is the hard FK from
-- profiles.id to auth.users(id), which this migration drops.

-- ============================================================
-- 1. Let profiles exist without an auth user (ghosts).
-- ============================================================
-- Real signups are unaffected: handle_new_user still sets id = new.id (the auth
-- uid) explicitly, so it never hits this default. Only ghost inserts (which omit
-- id) get a random uuid.
alter table profiles drop constraint profiles_id_fkey;
alter table profiles alter column id set default gen_random_uuid();

-- Trade-off: dropping the FK also drops the ON DELETE CASCADE that removed a
-- profile when its auth user was deleted. Admins never hard-delete auth users;
-- if that changes, reinstate cleanup as an AFTER DELETE trigger on auth.users.

-- ============================================================
-- 2. Companion table: ghost provenance + the "unclaimed" marker.
--    A row EXISTS here iff the profile is an unclaimed ghost. claim_ghost()
--    deletes it, so "unclaimed ghosts" is always exactly this table.
-- ============================================================
create table ghost_profiles (
  profile_id         uuid primary key references profiles(id) on delete cascade,
  canonical_name     text not null,
  nicknames          text,
  tentative_email    text,            -- from players_canonical, drives claim suggestions
  approx_appearances int,
  notes              text,
  created_at         timestamptz default now()
);

alter table ghost_profiles enable row level security;

drop policy if exists gp_admin_all   on ghost_profiles;
drop policy if exists gp_member_read on ghost_profiles;

-- Admins manage ghost metadata.
create policy gp_admin_all on ghost_profiles
  for all using (is_admin()) with check (is_admin());

-- Active members may READ ghost meta so the game-screen registration picker can
-- show ghost names / "no app" tags.
create policy gp_member_read on ghost_profiles
  for select using (is_active_member());

-- ============================================================
-- 3. Claim (merge) support RPCs.
-- ============================================================

-- list_claim_candidates(): admin-only. Returns each real, not-yet-claimed
-- profile (a signup with no ghost_profiles row) together with its auth email
-- (clients can't read auth.users) and the best-guess ghost to merge it into:
--   1. exact tentative_email == the user's auth email  -> match_by='email'
--   2. else case-insensitive name/nickname match       -> match_by='name'
create or replace function list_claim_candidates()
returns table (
  real_id          uuid,
  real_name        text,
  real_email       text,
  real_status      text,
  suggested_ghost  uuid,
  suggested_name   text,
  match_by         text
)
language sql stable security definer set search_path = public as $$
  with reals as (
    select p.id, p.display_name, p.status, u.email
    from profiles p
    join auth.users u on u.id = p.id            -- real profiles only (have an auth row)
    where not exists (select 1 from ghost_profiles g where g.profile_id = p.id)
  ),
  scored as (
    select
      r.id, r.display_name, r.email, r.status,
      g.profile_id as ghost_id, g.canonical_name,
      case
        when g.tentative_email is not null
             and lower(g.tentative_email) = lower(r.email) then 1   -- email = best
        when lower(r.display_name) = lower(g.canonical_name)
             or (g.nicknames is not null
                 and lower(g.nicknames) like '%' || lower(r.display_name) || '%') then 2
        else 3
      end as rank,
      case
        when g.tentative_email is not null
             and lower(g.tentative_email) = lower(r.email) then 'email'
        else 'name'
      end as match_by
    from reals r
    cross join ghost_profiles g
  ),
  best as (
    select distinct on (id) id, display_name, email, status,
           ghost_id, canonical_name, match_by, rank
    from scored
    where rank < 3                               -- keep only actual matches
    order by id, rank
  )
  select id, display_name, email, status, ghost_id, canonical_name, match_by
  from best
  order by rank, display_name;
$$;

revoke all on function list_claim_candidates() from public;
grant execute on function list_claim_candidates() to authenticated;

-- claim_ghost(real, ghost): admin-only. Repoints the ghost's history onto the
-- real profile (whose id stays = auth uid, so RLS keeps working), then consumes
-- the ghost. Guards prevent duplicate rows if the real player already has data
-- for the same season/game.
create or replace function claim_ghost(p_real uuid, p_ghost uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  if p_real = p_ghost then
    raise exception 'cannot claim a profile onto itself';
  end if;
  if not exists (select 1 from ghost_profiles where profile_id = p_ghost) then
    raise exception 'target is not an unclaimed ghost';
  end if;
  if exists (select 1 from ghost_profiles where profile_id = p_real) then
    raise exception 'source profile is itself a ghost';
  end if;

  -- season baselines: move rows the real profile doesn't already have.
  update season_baselines b set user_id = p_real
   where b.user_id = p_ghost
     and not exists (select 1 from season_baselines x
                     where x.season_id = b.season_id and x.user_id = p_real);

  -- registrations: move rows for games the real profile isn't already in.
  update registrations r set user_id = p_real
   where r.user_id = p_ghost
     and not exists (select 1 from registrations x
                     where x.game_id = r.game_id and x.user_id = p_real);

  -- goals: scorer has no per-game uniqueness, so a straight repoint is safe.
  update goals set scorer_id = p_real where scorer_id = p_ghost;

  -- consume the ghost. Any baseline/registration rows left behind (because the
  -- real profile already had that season/game) are dropped by the cascade — the
  -- real profile's own numbers win.
  delete from ghost_profiles where profile_id = p_ghost;
  delete from profiles       where id = p_ghost;
end $$;

revoke all on function claim_ghost(uuid, uuid) from public;
grant execute on function claim_ghost(uuid, uuid) to authenticated;
