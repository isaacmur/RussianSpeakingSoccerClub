-- 0015_create_ghost.sql
-- Phase 7 follow-up: let an admin create a single ghost on demand.
--
-- Ghosts were previously only born in the bulk roster import (0014). This adds a
-- create_ghost() RPC so an admin can sign up a new player who hasn't opened the
-- app yet — the person gets a claimable profile now (registerable for games,
-- linkable when they eventually sign up), same shape as an imported ghost.
--
-- A ghost is two rows written together: a `profiles` row (active/player, so it
-- shows on the board and the registration picker) and a `ghost_profiles` row
-- (the "unclaimed" marker + claim-suggestion metadata). Doing both in one
-- SECURITY DEFINER function keeps them atomic — a half-made ghost (profile with
-- no ghost_profiles row) would leak into the Members "active" queue.
--
-- Real signups are untouched: they still come in through handle_new_user with
-- id = auth.uid() and status 'pending'. This never creates an auth user, so
-- notifications to the ghost stay undeliverable by design (see PHASE7 notes).
-- Deliberately no notification_prefs row, matching the 0014 import.

create or replace function create_ghost(
  p_name      text,
  p_email     text default null,
  p_nicknames text default null,
  p_notes     text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id   uuid;
  v_name text := btrim(p_name);
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  if v_name is null or v_name = '' then
    raise exception 'name is required';
  end if;

  -- id is omitted, so it takes the gen_random_uuid() default from 0013 — never
  -- equal to any auth.uid(), which is exactly what keeps a ghost from ever
  -- self-reading/writing or counting as a real member under RLS.
  insert into profiles (display_name, status, role)
  values (v_name, 'active', 'player')
  returning id into v_id;

  insert into ghost_profiles (profile_id, canonical_name, tentative_email, nicknames, notes)
  values (
    v_id,
    v_name,
    nullif(btrim(coalesce(p_email, '')),     ''),  -- drives the email claim-match later
    nullif(btrim(coalesce(p_nicknames, '')), ''),
    nullif(btrim(coalesce(p_notes, '')),     '')
  );

  return v_id;
end $$;

revoke all on function create_ghost(text, text, text, text) from public;
grant execute on function create_ghost(text, text, text, text) to authenticated;
