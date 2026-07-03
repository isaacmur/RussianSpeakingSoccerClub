-- 0002_functions_rls.sql
-- Phase 1: access-control helpers + enable RLS on every table.
-- Real policies are written for profiles now. Tables whose UI ships in later
-- phases have RLS enabled with no policy yet (default-deny is safe and avoids
-- retrofitting RLS onto live tables later).

-- ============================================================
-- access-control helpers
-- ============================================================
-- NOTE: these are SECURITY DEFINER so that reading `profiles` from inside a
-- profiles policy does not recurse through RLS (a Postgres/Supabase pitfall).
create or replace function is_active_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles
                where id = auth.uid() and status = 'active');
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles
                where id = auth.uid() and status = 'active' and role = 'admin');
$$;

-- Members and report viewers may read match reports; pending/rejected may not.
create or replace function can_view_reports() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from profiles
                where id = auth.uid() and status in ('active','viewer'));
$$;

-- ============================================================
-- enable RLS on ALL tables (default-deny where no policy is defined yet)
-- ============================================================
alter table profiles          enable row level security;
alter table notification_prefs enable row level security;
alter table seasons           enable row level security;
alter table season_baselines  enable row level security;
alter table game_series       enable row level security;
alter table games             enable row level security;
alter table registrations     enable row level security;
alter table match_results     enable row level security;
alter table goals             enable row level security;
alter table channels          enable row level security;
alter table messages          enable row level security;
alter table notifications     enable row level security;

-- ============================================================
-- profiles policies (shipped in phase 1)
--   read own always; read others only if active; write own; admins write any.
-- ============================================================
create policy p_self_read   on profiles for select using (id = auth.uid());
create policy p_member_read on profiles for select using (is_active_member());
create policy p_self_write  on profiles for update using (id = auth.uid());
create policy p_admin_write on profiles for all    using (is_admin());

-- notification_prefs: a user manages only their own row.
create policy np_self_all on notification_prefs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
