-- 0006_registration_logic.sql
-- Phase 3: automatic waitlisting on a full game, and promotion of the earliest
-- waitlister when a registered spot is vacated. Both run SECURITY DEFINER so
-- they can read/modify rows other than the caller's own (RLS would otherwise
-- block promoting another player and inserting their spot_opened notification).

-- BEFORE INSERT/UPDATE: if someone asks to be 'registered' but the game is
-- already at capacity, demote them to 'waitlist'. Only acts on 'registered'
-- intent; explicit 'withdrawn'/'waitlist' values pass through untouched.
create or replace function assign_registration_slot() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cap int;
  reg_count int;
begin
  if new.status <> 'registered' then
    return new;
  end if;

  select capacity into cap from games where id = new.game_id;

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

create trigger trg_assign_registration_slot
  before insert or update on registrations
  for each row execute function assign_registration_slot();

-- AFTER UPDATE/DELETE: when a 'registered' spot is vacated (withdrawal or admin
-- removal) and the game is back under capacity, promote the earliest waitlister
-- and notify them. The promotion is an UPDATE that fires the BEFORE trigger
-- above (which keeps it 'registered' since a slot is now free) and this AFTER
-- trigger again — but with old.status='waitlist', so it no-ops. No recursion.
create or replace function promote_waitlist() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  cap int;
  reg_count int;
  promoted_user uuid;
begin
  -- Did this change actually free a registered slot?
  if tg_op = 'UPDATE' and not (old.status = 'registered' and new.status <> 'registered') then
    return new;
  end if;
  if tg_op = 'DELETE' and old.status <> 'registered' then
    return old;
  end if;

  select capacity into cap from games where id = old.game_id;
  select count(*) into reg_count
  from registrations where game_id = old.game_id and status = 'registered';

  if reg_count < cap then
    update registrations set status = 'registered'
    where id = (
      select id from registrations
      where game_id = old.game_id and status = 'waitlist'
      order by created_at asc
      limit 1
    )
    returning user_id into promoted_user;

    if promoted_user is not null then
      insert into notifications (user_id, type, title, body, game_id)
      values (
        promoted_user, 'spot_opened', 'A spot opened up',
        'You''re off the waitlist and registered to play.', old.game_id
      );
    end if;
  end if;

  return coalesce(new, old);
end $$;

create trigger trg_promote_waitlist
  after update or delete on registrations
  for each row execute function promote_waitlist();
