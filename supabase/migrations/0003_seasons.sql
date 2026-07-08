-- 0003_seasons.sql
-- Phase 2: season derivation + auto-assignment.
-- Must land BEFORE phase 3 inserts any game, since games.season_id is populated
-- by the set_game_season trigger on insert.

-- Seed the first season. Later years are created on demand by set_game_season
-- when a game is scheduled into them, so the Jan 1 rollover needs no cron.
insert into seasons (year, name) values (2026, '2026 Season')
  on conflict (year) do nothing;

-- The "current" season is derived from today's date in league-local time, so a
-- new season begins automatically at midnight Jan 1 (America/New_York).
create or replace function current_season_id() returns uuid
language sql stable as $$
  select id from seasons
  where year = extract(year from (now() at time zone 'America/New_York'))::int
  limit 1;
$$;

-- Auto-assign season and auto-create the season row from a game's kickoff year.
create or replace function set_game_season() returns trigger
language plpgsql as $$
declare y int;
begin
  y := extract(year from (new.kickoff_at at time zone 'America/New_York'))::int;
  insert into seasons (year, name) values (y, y || ' Season')
    on conflict (year) do nothing;
  select id into new.season_id from seasons where year = y;
  return new;
end $$;

create trigger trg_set_game_season
  before insert on games
  for each row when (new.season_id is null)
  execute function set_game_season();
