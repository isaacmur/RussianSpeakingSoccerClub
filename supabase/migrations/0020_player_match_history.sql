-- 0020_player_match_history.sql
-- Tapping a leaderboard row opens that player's personal match history. There
-- was no per-player read path: list_match_reports() (0011) returns EVERY
-- completed game, not the subset one player appeared in. This adds a definer RPC
-- that returns only the completed matches a given player actually played —
-- registered with a non-null team, exactly the games player_stats (0016) counts
-- toward their record — plus that player's per-match side, goals, and outcome so
-- the history reads personally (W/D/L, goals) rather than as a bare scoreline.

-- ============================================================
-- get_player_match_history — one player's played matches, newest first.
-- Guarded by can_view_reports() (same gate as list_match_reports), so report
-- viewers and active members reach it and pending/rejected get nothing. Scoped
-- to the current season, matching the leaderboard the caller tapped in from.
--   team    : the side the player played ('A' | 'B')
--   goals   : that player's goals in the match (0 if none)
--   outcome : 'win' | 'draw' | 'loss' from the player's side vs the scoreline
-- ============================================================
create or replace function get_player_match_history(p_user_id uuid)
returns table(game_id uuid, title text, kickoff_at timestamptz, location text,
              team_a_score int, team_b_score int, summary text,
              team text, goals int, outcome text)
language sql stable security definer set search_path = public as $$
  select g.id, g.title, g.kickoff_at, g.location,
         mr.team_a_score, mr.team_b_score, mr.summary,
         r.team,
         coalesce((
           select sum(gl.count)::int from goals gl
           where gl.game_id = g.id and gl.scorer_id = r.user_id), 0) as goals,
         case
           when (r.team = 'A' and mr.team_a_score > mr.team_b_score)
             or (r.team = 'B' and mr.team_b_score > mr.team_a_score) then 'win'
           when mr.team_a_score = mr.team_b_score then 'draw'
           else 'loss'
         end as outcome
  from registrations r
  join match_results mr on mr.game_id = r.game_id
  join games g          on g.id = r.game_id
  where can_view_reports()
    and r.user_id = p_user_id
    and r.status = 'registered'
    and r.team is not null
    and g.season_id = current_season_id()
  order by g.kickoff_at desc;
$$;

revoke all on function get_player_match_history(uuid) from public;
grant execute on function get_player_match_history(uuid) to authenticated;
