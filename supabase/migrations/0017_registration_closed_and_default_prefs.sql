-- 0017_registration_closed_and_default_prefs.sql
-- Two related changes to notification preferences:
--   1. New notification category `registration_closed` — fired when a game
--      locks (the signup list freezes at kickoff), sent to that game's
--      registered players so they know the roster is final. Adds the pref
--      column + emitter, and wires the emitter into lock_games().
--   2. New-user defaults: only registration_open, registration_closed, and
--      results_posted arrive by default. game_filled / needs_players /
--      kickoff_reminder / chat_mentions now default OFF. Column defaults only
--      affect rows created after this migration (handle_new_user inserts a bare
--      row), so existing users keep whatever they've chosen.

-- ============================================================
-- 1. notification_prefs: add registration_closed, retune defaults.
-- ============================================================
alter table notification_prefs
  add column if not exists registration_closed boolean default true;

-- On by default going forward.
alter table notification_prefs alter column registration_open  set default true;
alter table notification_prefs alter column results_posted      set default true;
-- Off by default going forward.
alter table notification_prefs alter column game_filled         set default false;
alter table notification_prefs alter column needs_players       set default false;
alter table notification_prefs alter column kickoff_reminder    set default false;
alter table notification_prefs alter column chat_mentions       set default false;

-- ============================================================
-- 2. registration_closed → that game's registered players, when the game locks.
-- Mirrors notify_registration_open (0008): scans rather than trusts the caller,
-- deduped per game by the not-exists guard. The kickoff window keeps the first
-- run from backfilling every historical locked game — only games that locked
-- around now are eligible.
-- ============================================================
create or replace function notify_registration_closed() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'admins only';
  end if;

  with due as (
    select g.* from games g
    where g.status = 'locked'
      and g.kickoff_at >= now() - interval '1 day'
      and not exists (
        select 1 from notifications x
        where x.game_id = g.id and x.type = 'registration_closed'
      )
  ),
  ins as (
    insert into notifications (user_id, type, title, body, game_id)
    select r.user_id, 'registration_closed', 'Registration closed',
           d.title || ' — ' || kickoff_label(d.kickoff_at) ||
           '. The roster is locked.',
           d.id
    from due d
    join registrations r on r.game_id = d.id and r.status = 'registered'
    returning 1
  )
  select count(*) into n from ins;

  return n;
end $$;

grant execute on function notify_registration_closed() to authenticated;

-- Re-issue lock_games (0007) so the cron tick that locks games also enqueues
-- their registration_closed notices on the same tick.
create or replace function lock_games() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'admins only';
  end if;

  update games set status = 'locked'
  where status in ('scheduled', 'registration_open', 'filled')
    and now() >= kickoff_at;

  get diagnostics n = row_count;

  perform notify_registration_closed();
  return n;
end $$;

grant execute on function lock_games() to authenticated;
