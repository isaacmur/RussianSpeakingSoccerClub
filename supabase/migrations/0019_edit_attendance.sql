-- 0019_edit_attendance.sql
-- Editing who actually PLAYED a (usually past) match: no-shows and walk-ups.
-- Two gaps in the result flow made this impossible:
--   1. A walk-up who never signed up has no registration row, and adding one to
--      a full game gets waitlisted by assign_registration_slot() (0006) — so
--      they never reach the team sheet or the standings. But capacity limits
--      *live signups*; once a game is locked/over, an admin writing the roster is
--      recording attendance, which isn't capacity-bound. Skip the demotion then.
--   2. submit_match_result() (0011) only UPDATEs the team of rows already in the
--      registrations table and only for user_ids present in the payload. So it
--      can neither add a walk-up nor clear a no-show (the client dropped
--      unassigned players from the payload, so their old team persisted and they
--      kept counting). Make the payload the authoritative team sheet: upsert a
--      registered row for every attendee, set each side, and let a null team
--      clear a no-show (they stay registered but drop out of player_stats, which
--      keys on team is not null).

-- ============================================================
-- 1. Capacity only gates live signups.
-- Same body as 0006, plus a status gate: once the game is past the signup phase
-- (locked / in_progress / completed / cancelled), an admin add is attendance, so
-- don't waitlist it. Normal self-signup is unaffected — RLS only lets members
-- insert while status = 'registration_open', which is still gated here.
-- ============================================================
create or replace function assign_registration_slot() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cap int;
  reg_count int;
  gstatus text;
begin
  if new.status <> 'registered' then
    return new;
  end if;

  select capacity, status into cap, gstatus from games where id = new.game_id;

  -- Attendance phase: capacity no longer applies. Let the admin's roster write
  -- through so walk-ups land as 'registered' on a full past game.
  if gstatus not in ('draft', 'scheduled', 'registration_open', 'filled') then
    return new;
  end if;

  select count(*) into reg_count
  from registrations
  where game_id = new.game_id
    and status = 'registered'
    and (tg_op = 'INSERT' or id <> new.id);

  if reg_count >= cap then
    new.status := 'waitlist';
  end if;

  return new;
end $$;

-- ============================================================
-- 2. submit_match_result: the payload is the authoritative team sheet.
-- Same as 0011 except: the game is flipped to 'completed' BEFORE the roster
-- write (so the trigger above sees the attendance phase), and the plain team
-- UPDATE is replaced by an upsert that adds walk-ups and clears no-shows.
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

  -- Complete the game first: past the signup phase, attendance isn't
  -- capacity-limited, so the assign-slot trigger lets a walk-up in on a full game.
  update games set status = 'completed' where id = p_game_id;

  -- Authoritative team sheet: a registered row for every attendee in the payload
  -- (upsert adds walk-ups who never signed up), with the side they played. A
  -- null team clears a no-show — they stay registered but drop out of the
  -- standings, which count only rows where team is not null.
  insert into registrations (game_id, user_id, status, team)
  select p_game_id, (t->>'user_id')::uuid, 'registered', (t->>'team')
  from jsonb_array_elements(coalesce(p_teams, '[]'::jsonb)) t
  on conflict (game_id, user_id) do update
    set status = 'registered',
        team   = excluded.team;

  -- Replace the goal list wholesale — the client always sends the full set.
  delete from goals where game_id = p_game_id;
  insert into goals (game_id, scorer_id, team, count)
  select p_game_id, (gr->>'scorer_id')::uuid, gr->>'team', (gr->>'count')::int
  from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) gr
  where coalesce((gr->>'count')::int, 0) > 0;

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
