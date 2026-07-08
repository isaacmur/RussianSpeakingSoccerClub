-- 0005_games_registrations_rls.sql
-- Phase 3: RLS for scheduling + registration, plus the pieces the registration
-- flow depends on (dedupe constraint for materialization, realtime publication).

-- Dedupe key so materialize_games() can insert idempotently (on conflict do
-- nothing). series_id is null for one-off games; multiple nulls are allowed by
-- a UNIQUE constraint, so one-offs are never blocked by this.
alter table games
  add constraint games_series_kickoff_uniq unique (series_id, kickoff_at);

-- ============================================================
-- game_series / games: any active member reads; only admins write.
-- ============================================================
create policy gs_member_read on game_series
  for select using (is_active_member());
create policy gs_admin_write on game_series
  for all using (is_admin()) with check (is_admin());

create policy g_member_read on games
  for select using (is_active_member());
create policy g_admin_write on games
  for all using (is_admin()) with check (is_admin());

-- ============================================================
-- registrations
--   select: any active member (needed for the live signup list)
--   insert own: only while the game is registration_open and before kickoff
--   update own: withdraw / re-register, only before kickoff
--   admin: full access (needed for summary entry / manual fixes)
-- Slot assignment (registered vs waitlist) and waitlist promotion are handled
-- by triggers in 0006 — the policies only gate *who* may write *when*.
-- ============================================================
create policy r_member_read on registrations
  for select using (is_active_member());

create policy r_insert_own on registrations
  for insert with check (
    user_id = auth.uid()
    and is_active_member()
    and exists (
      select 1 from games g
      where g.id = game_id
        and g.status = 'registration_open'
        and now() < g.kickoff_at
    )
  );

create policy r_update_own on registrations
  for update using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (select 1 from games g where g.id = game_id and now() < g.kickoff_at)
  );

create policy r_admin_all on registrations
  for all using (is_admin()) with check (is_admin());

-- ============================================================
-- Realtime: the game-detail screen subscribes to registrations filtered by
-- game_id for a live signup list. Add the table to Supabase's realtime
-- publication (guarded so a re-run / already-added table doesn't error).
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'registrations'
  ) then
    alter publication supabase_realtime add table registrations;
  end if;
end $$;
