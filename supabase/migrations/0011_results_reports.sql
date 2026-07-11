-- 0011_results_reports.sql
-- Phase 5: results & match reports.
--
--   * RLS for match_results / goals — readable by members + report viewers
--     (can_view_reports), writable by admins only.
--   * submit_match_result() — one SECURITY DEFINER RPC that writes the score,
--     the match report text, per-attendee Team A/B, and per-scorer goals
--     ATOMICALLY, flips the game to 'completed', and enqueues one
--     results_posted notification per registered player. Doing it in a single
--     function avoids the partial-write hazard of four separate client calls.
--   * get_match_report() / list_match_reports() — the read path. Report VIEWERS
--     are not is_active_member(), so they have no direct select on games /
--     registrations / profiles; these definer RPCs are the only way they (and,
--     uniformly, active members) load a report. Guarded by can_view_reports(),
--     so pending/rejected get nothing.

-- ============================================================
-- RLS: match reports are readable by members + report viewers, written by
-- admins. (SELECT via can_view_reports() covers active-member direct reads on
-- the admin summary screen; viewers go through the definer RPCs below.)
-- ============================================================
drop policy if exists mr_view_read on match_results;
create policy mr_view_read on match_results
  for select using (can_view_reports());

drop policy if exists mr_admin_write on match_results;
create policy mr_admin_write on match_results
  for all using (is_admin()) with check (is_admin());

drop policy if exists goals_view_read on goals;
create policy goals_view_read on goals
  for select using (can_view_reports());

drop policy if exists goals_admin_write on goals;
create policy goals_admin_write on goals
  for all using (is_admin()) with check (is_admin());

-- ============================================================
-- submit_match_result — atomic result entry.
--
-- p_teams : [{ "user_id": uuid, "team": "A"|"B" }]  — attendee side assignment
-- p_goals : [{ "scorer_id": uuid, "team": "A"|"B", "count": int }]
--
-- Scores are passed explicitly (own goals / no-shows mean the A/B goal tally
-- need not equal the final score), so match_results is the source of truth for
-- the scoreline and `goals` only feeds the Golden Boot.
--
-- Re-submittable: match_results is upserted and goals are replaced wholesale, so
-- an admin can correct a result. The results_posted notification fires only the
-- first time (dedupe on game_id+type) — a correction doesn't re-spam.
-- ============================================================
create or replace function submit_match_result(
  p_game_id uuid,
  p_team_a_score int,
  p_team_b_score int,
  p_summary text,
  p_teams jsonb,
  p_goals jsonb
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'admins only';
  end if;

  insert into match_results (game_id, team_a_score, team_b_score, summary, entered_by, entered_at)
  values (p_game_id, p_team_a_score, p_team_b_score,
          nullif(btrim(coalesce(p_summary, '')), ''), auth.uid(), now())
  on conflict (game_id) do update
    set team_a_score = excluded.team_a_score,
        team_b_score = excluded.team_b_score,
        summary      = excluded.summary,
        entered_by   = excluded.entered_by,
        entered_at   = now();

  -- Assign the sides the attendees actually played. Players omitted from the
  -- payload keep whatever team they had (none, by default) and so are excluded
  -- from the standings computation in player_stats.
  update registrations r
     set team = (t->>'team')
    from jsonb_array_elements(coalesce(p_teams, '[]'::jsonb)) t
   where r.game_id = p_game_id
     and r.user_id = (t->>'user_id')::uuid;

  -- Replace the goal list wholesale — the client always sends the full set.
  delete from goals where game_id = p_game_id;
  insert into goals (game_id, scorer_id, team, count)
  select p_game_id, (gr->>'scorer_id')::uuid, gr->>'team', (gr->>'count')::int
  from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) gr
  where coalesce((gr->>'count')::int, 0) > 0;

  update games set status = 'completed' where id = p_game_id;

  if not exists (
    select 1 from notifications
    where game_id = p_game_id and type = 'results_posted'
  ) then
    insert into notifications (user_id, type, title, body, game_id)
    select r.user_id, 'results_posted', 'Result posted',
           g.title || ' — ' || p_team_a_score || '–' || p_team_b_score ||
           '. Tap for the match report.',
           p_game_id
    from registrations r
    join games g on g.id = p_game_id
    where r.game_id = p_game_id and r.status = 'registered';
  end if;
end $$;

revoke all on function submit_match_result(uuid, int, int, text, jsonb, jsonb) from public;
grant execute on function submit_match_result(uuid, int, int, text, jsonb, jsonb) to authenticated;

-- ============================================================
-- get_match_report — the whole report as one jsonb bundle. The only way a
-- report VIEWER (not an active member, so no direct table select) reads a game.
-- ============================================================
create or replace function get_match_report(p_game_id uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare result jsonb;
begin
  if not can_view_reports() then
    raise exception 'not allowed';
  end if;

  select jsonb_build_object(
    'game', (
      select jsonb_build_object(
        'id', g.id, 'title', g.title,
        'kickoff_at', g.kickoff_at, 'location', g.location, 'status', g.status)
      from games g where g.id = p_game_id
    ),
    'result', (
      select jsonb_build_object(
        'team_a_score', mr.team_a_score, 'team_b_score', mr.team_b_score,
        'summary', mr.summary, 'entered_at', mr.entered_at)
      from match_results mr where mr.game_id = p_game_id
    ),
    'roster', coalesce((
      select jsonb_agg(jsonb_build_object(
        'user_id', r.user_id,
        'display_name', pr.display_name,
        'team', r.team,
        'goals', coalesce((
          select sum(gl.count)::int from goals gl
          where gl.game_id = p_game_id and gl.scorer_id = r.user_id), 0)
      ) order by r.team nulls last, pr.display_name)
      from registrations r
      join profiles pr on pr.id = r.user_id
      where r.game_id = p_game_id and r.status = 'registered'
    ), '[]'::jsonb)
  ) into result;

  return result;
end $$;

revoke all on function get_match_report(uuid) from public;
grant execute on function get_match_report(uuid) to authenticated;

-- ============================================================
-- list_match_reports — every completed game that has a result, newest first.
-- Feeds the Reports tab (viewers) and Matchday's recent list (members). Empty
-- for anyone who can't view reports, so it's safe to grant broadly.
-- ============================================================
create or replace function list_match_reports()
returns table(game_id uuid, title text, kickoff_at timestamptz, location text,
              team_a_score int, team_b_score int, summary text)
language sql stable security definer set search_path = public as $$
  select g.id, g.title, g.kickoff_at, g.location,
         mr.team_a_score, mr.team_b_score, mr.summary
  from match_results mr
  join games g on g.id = mr.game_id
  where can_view_reports()
  order by g.kickoff_at desc;
$$;

revoke all on function list_match_reports() from public;
grant execute on function list_match_reports() to authenticated;
