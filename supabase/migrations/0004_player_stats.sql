-- 0004_player_stats.sql
-- Phase 2: season-scoped leaderboard.
-- Final stats = manually-entered baseline PLUS everything computed from
-- app-recorded games, scoped to the current season.

create or replace view player_stats as
with cur as (select current_season_id() as sid),
per_game as (
  select r.user_id,
    case when r.team = 'A' then mr.team_a_score else mr.team_b_score end as gf,
    case when r.team = 'A' then mr.team_b_score else mr.team_a_score end as ga
  from registrations r
  join match_results mr on mr.game_id = r.game_id
  join games g          on g.id = r.game_id
  where r.status = 'registered' and r.team is not null
    and g.season_id = (select sid from cur)
),
computed as (
  select user_id,
    count(*)                        as games_played,
    count(*) filter (where gf > ga) as wins,
    count(*) filter (where gf = ga) as draws,
    count(*) filter (where gf < ga) as losses,
    sum(gf - ga)                    as plus_minus
  from per_game group by user_id
),
computed_goals as (
  select gl.scorer_id as user_id, sum(gl.count) as goals
  from goals gl join games g on g.id = gl.game_id
  where g.season_id = (select sid from cur)
  group by gl.scorer_id
),
base as (
  select user_id, games_played, wins, draws, losses, plus_minus, goals
  from season_baselines where season_id = (select sid from cur)
),
ids as (
  select user_id from computed
  union select user_id from computed_goals
  union select user_id from base
)
select
  i.user_id,
  coalesce(b.games_played, 0) + coalesce(c.games_played, 0) as games_played,
  coalesce(b.wins, 0)         + coalesce(c.wins, 0)         as wins,
  coalesce(b.draws, 0)        + coalesce(c.draws, 0)        as draws,
  coalesce(b.losses, 0)       + coalesce(c.losses, 0)       as losses,
  coalesce(b.plus_minus, 0)   + coalesce(c.plus_minus, 0)   as plus_minus,
  coalesce(b.goals, 0)        + coalesce(cg.goals, 0)       as goals
from ids i
left join computed       c  on c.user_id  = i.user_id
left join computed_goals cg on cg.user_id = i.user_id
left join base           b  on b.user_id  = i.user_id;

-- The single read path pending/rejected users get: a security-definer RPC that
-- bypasses RLS for read-only standings. Every tier reads the board through this
-- so no client needs direct select on the underlying tables. Aggregate columns
-- come back as bigint from the view, so cast to int to match the declared type.
create or replace function get_leaderboard()
returns table(user_id uuid, display_name text, games_played int, wins int,
              draws int, losses int, plus_minus int, goals int)
language sql stable security definer set search_path = public as $$
  select ps.user_id, pr.display_name,
         ps.games_played::int, ps.wins::int, ps.draws::int, ps.losses::int,
         ps.plus_minus::int, ps.goals::int
  from player_stats ps
  join profiles pr on pr.id = ps.user_id
  order by ps.plus_minus desc, ps.goals desc;
$$;

revoke all on function get_leaderboard() from public;
grant execute on function get_leaderboard() to authenticated;

-- ============================================================
-- RLS for the phase-2 season tables.
-- seasons: readable by active members (needed so the admin baselines screen and
-- current_season_id() can resolve the current season under the caller's RLS),
-- writable by admins. The set_game_season trigger inserts seasons as SECURITY
-- INVOKER but fires only on admin-authored game inserts (phase 3).
-- season_baselines: readable by any active member, writable by admins.
-- ============================================================
create policy seasons_member_read on seasons
  for select using (is_active_member());
create policy seasons_admin_write on seasons
  for all using (is_admin()) with check (is_admin());

create policy sb_member_read on season_baselines
  for select using (is_active_member());
create policy sb_admin_write on season_baselines
  for all using (is_admin()) with check (is_admin());
