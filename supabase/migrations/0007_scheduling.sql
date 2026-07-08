-- 0007_scheduling.sql
-- Phase 3: materialize games from active series and drive status transitions.
-- Written as plain functions first (callable manually: `select materialize_games()`),
-- then scheduled with pg_cron on the hosted project (see the DO block at the end).
--
-- All three are SECURITY DEFINER so pg_cron (which runs with no auth.uid()) can
-- execute them. The guard blocks non-admin *interactive* callers while letting
-- the cron context (auth.uid() is null) through.

-- Create the next 4 weeks of games for every active series. Idempotent via the
-- games_series_kickoff_uniq constraint. Kickoff is built from the series'
-- local wall-clock time in America/New_York, then stored as an instant.
create or replace function materialize_games() returns int
language plpgsql security definer set search_path = public as $$
declare
  s record;
  d date;
  ko timestamptz;
  opens timestamptz;
  n int := 0;
begin
  if auth.uid() is not null and not is_admin() then
    raise exception 'admins only';
  end if;

  for s in select * from game_series where active loop
    for d in
      select generate_series(current_date, current_date + 28, interval '1 day')::date
    loop
      if extract(dow from d)::int = s.day_of_week then
        ko := (d + s.kickoff_time) at time zone 'America/New_York';
        opens := ko - make_interval(hours => s.reg_opens_offset_hours);
        insert into games (series_id, title, kickoff_at, location, capacity,
                           min_players, registration_opens_at, status)
        values (s.id, s.title, ko, s.location, s.capacity, s.min_players, opens,
                case when now() >= opens then 'registration_open' else 'scheduled' end)
        on conflict (series_id, kickoff_at) do nothing;
        if found then n := n + 1; end if;
      end if;
    end loop;
  end loop;

  return n;
end $$;

-- scheduled -> registration_open once the open time has passed (and kickoff
-- hasn't). Notification enqueue for this transition is wired in phase 4.
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
  return n;
end $$;

-- Freeze the signup list at kickoff.
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
  return n;
end $$;

grant execute on function materialize_games() to authenticated;
grant execute on function open_registrations() to authenticated;
grant execute on function lock_games() to authenticated;

-- ============================================================
-- Schedule with pg_cron (hosted project only). Enable the pg_cron extension
-- first: Dashboard -> Database -> Extensions -> pg_cron. This block no-ops if
-- the extension isn't present, so the migration still applies. cron.schedule is
-- idempotent by job name, so re-running is safe.
-- ============================================================
do $mig$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('materialize-games',  '0 2 * * *',   'select materialize_games()');
    perform cron.schedule('open-registrations', '*/5 * * * *', 'select open_registrations()');
    perform cron.schedule('lock-games',         '*/5 * * * *', 'select lock_games()');
  end if;
end $mig$;
