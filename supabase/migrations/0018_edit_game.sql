-- 0018_edit_game.sql
-- Admins can now edit any game at any stage (see app/admin/game/[id].tsx). A raw
-- UPDATE on games leaves two pieces of derived state stale, so this migration
-- teaches them to follow the edit:
--   1. season_id is set from the kickoff year by a BEFORE INSERT trigger (0003)
--      that never fired on UPDATE. Editing a one-off's kickoff across a New Year
--      boundary would misattribute its standings. Re-run the same derivation
--      whenever kickoff_at changes.
--   2. Raising a game's capacity should let waitlisted players in, but the
--      waitlist engine (0006) only watches the registrations table — nothing
--      reacts to a capacity change on games. Promote the earliest waitlisters up
--      to the new cap and notify them. Lowering capacity does nothing: registered
--      players stay in (the game simply reads over-capacity) — see the product
--      decision in the edit-feature plan.

-- ============================================================
-- 1. season_id follows kickoff_at on update.
-- Reuses set_game_season() from 0003 (it recomputes new.season_id from
-- new.kickoff_at). The INSERT trigger there guards on season_id being null; here
-- we always recompute, but only when the kickoff actually moved.
-- ============================================================
create trigger trg_set_game_season_update
  before update of kickoff_at on games
  for each row
  when (new.kickoff_at is distinct from old.kickoff_at)
  execute function set_game_season();

-- ============================================================
-- 2. Capacity increase promotes the waitlist.
-- SECURITY DEFINER so it can update other players' registrations and insert
-- their notifications past RLS — same reasoning as promote_waitlist() in 0006.
-- Promoting a row fires that BEFORE trigger (which keeps it 'registered' since a
-- slot is now free) and the AFTER promote_waitlist trigger (which no-ops on a
-- waitlist→registered change), so there's no double-promotion or recursion.
-- ============================================================
create or replace function promote_on_capacity_increase() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  reg_count int;
  promoted_user uuid;
begin
  -- Only react to an actual increase; a decrease or no-op leaves the list alone.
  if new.capacity <= old.capacity then
    return new;
  end if;

  loop
    select count(*) into reg_count
    from registrations
    where game_id = new.id and status = 'registered';

    exit when reg_count >= new.capacity;

    -- Promote the earliest waitlister, if any remain.
    promoted_user := null;
    update registrations set status = 'registered'
    where id = (
      select id from registrations
      where game_id = new.id and status = 'waitlist'
      order by created_at asc
      limit 1
    )
    returning user_id into promoted_user;

    exit when promoted_user is null;

    insert into notifications (user_id, type, title, body, game_id)
    values (
      promoted_user, 'spot_opened', 'A spot opened up',
      'You''re off the waitlist and registered to play.', new.id
    );
  end loop;

  return new;
end $$;

create trigger trg_promote_on_capacity_increase
  after update of capacity on games
  for each row execute function promote_on_capacity_increase();
