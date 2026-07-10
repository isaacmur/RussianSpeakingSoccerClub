-- 0009_game_delete_tombstones.sql
-- Admins can hard-delete games, but series games live inside the 28-day window
-- that materialize_games() regenerates — without a tombstone, a deleted series
-- game reappears at the next materialization (nightly cron, or the admin
-- "Generate games from series" button). Record deleted (series_id, kickoff_at)
-- slots and teach the materializer to skip them.

create table deleted_game_slots (
  series_id uuid not null references game_series(id) on delete cascade,
  kickoff_at timestamptz not null,
  deleted_at timestamptz not null default now(),
  primary key (series_id, kickoff_at)
);

alter table deleted_game_slots enable row level security;
-- No policies: nothing reads or writes this table except the SECURITY DEFINER
-- trigger below and materialize_games() (also SECURITY DEFINER).

-- SECURITY DEFINER so the tombstone insert isn't blocked by RLS when the
-- delete is issued by an admin from the client.
create or replace function tombstone_deleted_game() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.series_id is not null then
    insert into deleted_game_slots (series_id, kickoff_at)
    values (old.series_id, old.kickoff_at)
    on conflict do nothing;
  end if;
  return old;
end $$;

create trigger trg_tombstone_deleted_game
  before delete on games
  for each row execute function tombstone_deleted_game();

-- Same as 0007, plus the not-exists guard against tombstoned slots.
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
        select s.id, s.title, ko, s.location, s.capacity, s.min_players, opens,
               case when now() >= opens then 'registration_open' else 'scheduled' end
        where not exists (
          select 1 from deleted_game_slots t
          where t.series_id = s.id and t.kickoff_at = ko
        )
        on conflict (series_id, kickoff_at) do nothing;
        if found then n := n + 1; end if;
      end if;
    end loop;
  end loop;

  return n;
end $$;
