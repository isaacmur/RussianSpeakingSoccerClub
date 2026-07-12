-- 0016_plus_minus_wins_losses.sql
-- Redefine +/- as a calculated value: wins - losses (not goal difference).
-- Recreates player_stats so plus_minus = total wins - total losses, where the
-- totals already fold in each player's manually-entered season baseline. The
-- computed/base plus_minus columns (old goal-diff) are no longer referenced.
-- get_leaderboard() is unchanged in shape and still orders by plus_minus desc.

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
    count(*) filter (where gf < ga) as losses
  from per_game group by user_id
),
computed_goals as (
  select gl.scorer_id as user_id, sum(gl.count) as goals
  from goals gl join games g on g.id = gl.game_id
  where g.season_id = (select sid from cur)
  group by gl.scorer_id
),
base as (
  select user_id, games_played, wins, draws, losses, goals
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
  -- +/- is now derived: (wins) - (losses), baseline + app-recorded.
  (coalesce(b.wins, 0)   + coalesce(c.wins, 0))
    - (coalesce(b.losses, 0) + coalesce(c.losses, 0))       as plus_minus,
  coalesce(b.goals, 0)        + coalesce(cg.goals, 0)       as goals
from ids i
left join computed       c  on c.user_id  = i.user_id
left join computed_goals cg on cg.user_id = i.user_id
left join base           b  on b.user_id  = i.user_id;
