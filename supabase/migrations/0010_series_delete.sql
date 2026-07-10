-- 0010_series_delete.sql
-- Let admins hard-delete a series together with all of its games. Two pieces:
--
-- 1. games.series_id had no ON DELETE action (default NO ACTION), so deleting
--    a series with games failed with an FK violation. Recreate it as CASCADE —
--    each game's own children (registrations, results, goals, summaries)
--    already cascade from 0001.
--
-- 2. The 0009 tombstone trigger fires for every cascade-deleted game and would
--    insert a deleted_game_slots row referencing the series mid-deletion — an
--    FK violation that aborts the whole delete. Guard it: only tombstone while
--    the parent series still exists. During a series-delete cascade the series
--    row is already gone from the snapshot, so the trigger no-ops — which is
--    also semantically right, since a deleted series can't regenerate games.

alter table games
  drop constraint games_series_id_fkey,
  add constraint games_series_id_fkey
    foreign key (series_id) references game_series(id) on delete cascade;

create or replace function tombstone_deleted_game() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.series_id is not null
     and exists (select 1 from game_series where id = old.series_id) then
    insert into deleted_game_slots (series_id, kickoff_at)
    values (old.series_id, old.kickoff_at)
    on conflict do nothing;
  end if;
  return old;
end $$;
