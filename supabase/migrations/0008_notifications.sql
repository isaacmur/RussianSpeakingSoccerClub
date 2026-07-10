-- 0008_notifications.sql
-- Phase 4: notification delivery. RLS + realtime for the in-app center, and
-- the fan-out functions for the taxonomy: registration_open, game_filled,
-- needs_players, kickoff_reminder (spot_opened shipped in 0006; results_posted
-- and chat_mention are wired in phases 5–6).
--
-- All inserts into `notifications` happen inside SECURITY DEFINER functions
-- (RLS gives users read/update only), and every insert is the webhook signal
-- that drives a push — see supabase/functions/send-push.

-- ============================================================
-- RLS: a user sees and updates (marks read) only their own rows. No insert or
-- delete policy — rows are created exclusively by definer functions/triggers.
-- ============================================================
create policy n_self_read on notifications
  for select using (user_id = auth.uid());

create policy n_self_update on notifications
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- Realtime: the Alerts center + tab badge subscribe to this table filtered by
-- user_id. postgres_changes respects RLS, so a client only receives own rows.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
end $$;

-- Kickoff rendered in league-local time for notification bodies,
-- e.g. "Sat, Jul 12 · 10:00 AM ET".
create or replace function kickoff_label(ko timestamptz) returns text
language sql stable as $$
  select trim(to_char(ko at time zone 'America/New_York',
                      'Dy, Mon FMDD · FMHH12:MI AM')) || ' ET';
$$;

-- ============================================================
-- registration_open → all active players.
-- Scans every open, future game with no prior notice rather than only games
-- flipped by open_registrations(): materialize_games() creates already-open
-- games directly (past-open-time series), and this catches those on the next
-- cron tick too. The not-exists guard is the dedupe — one notice per game.
-- ============================================================
create or replace function notify_registration_open() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'admins only';
  end if;

  with due as (
    select g.* from games g
    where g.status = 'registration_open'
      and now() < g.kickoff_at
      and not exists (
        select 1 from notifications x
        where x.game_id = g.id and x.type = 'registration_open'
      )
  ),
  ins as (
    insert into notifications (user_id, type, title, body, game_id)
    select p.id, 'registration_open', 'Registration open',
           d.title || ' — ' || kickoff_label(d.kickoff_at) || '. Grab your spot.',
           d.id
    from due d cross join profiles p
    where p.status = 'active'
    returning 1
  )
  select count(*) into n from ins;

  return n;
end $$;

-- Re-issue open_registrations (0007) so the cron tick that opens games also
-- enqueues their notifications.
create or replace function open_registrations() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'admins only';
  end if;

  update games set status = 'registration_open'
  where status = 'scheduled'
    and now() >= registration_opens_at
    and now() < kickoff_at;

  get diagnostics n = row_count;

  perform notify_registration_open();
  return n;
end $$;

-- ============================================================
-- game_filled → that game's registrants, the moment capacity is reached.
-- AFTER trigger on registrations: fires only when the incoming row is
-- 'registered' and the registered count has just hit capacity. Game-level
-- dedupe — a fill → withdrawal → refill cycle does not re-notify.
-- ============================================================
create or replace function notify_game_filled() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cap int;
  reg_count int;
  g_title text;
begin
  if new.status <> 'registered' then
    return new;
  end if;

  select capacity, title into cap, g_title from games where id = new.game_id;

  select count(*) into reg_count
  from registrations where game_id = new.game_id and status = 'registered';

  if reg_count >= cap and not exists (
    select 1 from notifications
    where game_id = new.game_id and type = 'game_filled'
  ) then
    insert into notifications (user_id, type, title, body, game_id)
    select r.user_id, 'game_filled', 'Game full',
           g_title || ' is at capacity. You''re on the list — see you out there.',
           new.game_id
    from registrations r
    where r.game_id = new.game_id and r.status = 'registered';
  end if;

  return new;
end $$;

create trigger trg_notify_game_filled
  after insert or update on registrations
  for each row execute function notify_game_filled();

-- ============================================================
-- needs_players → all active players, when a game inside 12h of kickoff is
-- still short of min_players. One alert per game, per the outline.
-- ============================================================
create or replace function notify_needs_players() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'admins only';
  end if;

  with due as (
    select g.*,
           g.min_players - count(r.id) filter (where r.status = 'registered') as short_by
    from games g
    left join registrations r on r.game_id = g.id
    where g.status = 'registration_open'
      and g.kickoff_at > now()
      and g.kickoff_at <= now() + interval '12 hours'
      and not exists (
        select 1 from notifications x
        where x.game_id = g.id and x.type = 'needs_players'
      )
    group by g.id
    having count(r.id) filter (where r.status = 'registered') < g.min_players
  ),
  ins as (
    insert into notifications (user_id, type, title, body, game_id)
    select p.id, 'needs_players', 'Players needed',
           d.title || ' kicks off soon and is ' || d.short_by ||
           ' short of ' || d.min_players || '. Can you play?',
           d.id
    from due d cross join profiles p
    where p.status = 'active'
    returning 1
  )
  select count(*) into n from ins;

  return n;
end $$;

-- ============================================================
-- kickoff_reminder → registered players, 3h before kickoff.
-- ============================================================
create or replace function notify_kickoff_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'admins only';
  end if;

  with due as (
    select g.* from games g
    where g.status not in ('draft','cancelled','completed')
      and g.kickoff_at > now()
      and g.kickoff_at <= now() + interval '3 hours'
      and not exists (
        select 1 from notifications x
        where x.game_id = g.id and x.type = 'kickoff_reminder'
      )
  ),
  ins as (
    insert into notifications (user_id, type, title, body, game_id)
    select r.user_id, 'kickoff_reminder', 'Kickoff soon',
           d.title || ' — ' || kickoff_label(d.kickoff_at) ||
           coalesce('. ' || d.location, ''),
           d.id
    from due d
    join registrations r on r.game_id = d.id and r.status = 'registered'
    returning 1
  )
  select count(*) into n from ins;

  return n;
end $$;

grant execute on function notify_registration_open() to authenticated;
grant execute on function notify_needs_players() to authenticated;
grant execute on function notify_kickoff_reminders() to authenticated;

-- ============================================================
-- pg_cron (hosted only; same guarded pattern as 0007 — no-ops until the
-- extension is enabled, idempotent by job name after that).
-- open_registrations() already runs every 5m from 0007 and now enqueues
-- registration_open notices on the same tick.
-- ============================================================
do $mig$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('needs-players',     '*/15 * * * *', 'select notify_needs_players()');
    perform cron.schedule('kickoff-reminders', '*/15 * * * *', 'select notify_kickoff_reminders()');
  end if;
end $mig$;
