-- 0001_schema.sql
-- Phase 1: the ENTIRE schema in one migration.
-- match_results/goals are created here (not deferred to phase 5) so the
-- player_stats view in phase 2 compiles against existing tables.

-- ============================================================
-- identity
-- ============================================================
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  role text not null default 'player' check (role in ('player','admin')),
  status text not null default 'pending'
    check (status in ('pending','active','viewer','rejected')), -- viewer = match report viewer
  expo_push_token text,
  created_at timestamptz default now()
);

create table notification_prefs (
  user_id uuid primary key references profiles(id) on delete cascade,
  registration_open boolean default true,
  game_filled boolean default true,
  needs_players boolean default true,
  kickoff_reminder boolean default true,
  results_posted boolean default true,
  chat_mentions boolean default true
);

-- Create the profile + default prefs automatically whenever an auth user
-- signs up. display_name comes from the sign-up metadata, falling back to the
-- email local-part. New users always start 'pending' / 'player'.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      split_part(new.email, '@', 1)
    )
  );
  insert into public.notification_prefs (user_id) values (new.id);
  return new;
end $$;

create trigger trg_handle_new_user
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- seasons (calendar year; new season every Jan 1)
-- ============================================================
create table seasons (
  id uuid primary key default gen_random_uuid(),
  year int not null unique,
  name text not null
);

-- Manually-entered starting stats per player, per season (pre-app history).
create table season_baselines (
  season_id uuid not null references seasons(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  games_played int not null default 0,
  wins int not null default 0,
  draws int not null default 0,
  losses int not null default 0,
  plus_minus int not null default 0,
  goals int not null default 0,
  primary key (season_id, user_id)
);

-- ============================================================
-- scheduling
-- ============================================================
create table game_series (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  day_of_week int not null,             -- 0=Sun .. 6=Sat
  kickoff_time time not null,
  duration_min int default 90,
  location text,
  capacity int not null default 20,
  min_players int not null default 10,
  reg_opens_offset_hours int not null default 48,
  active boolean default true,
  created_by uuid references profiles(id)
);

create table games (
  id uuid primary key default gen_random_uuid(),
  series_id uuid references game_series(id),     -- null for one-off / holiday
  season_id uuid references seasons(id),         -- set by trigger from kickoff year
  title text not null,
  kickoff_at timestamptz not null,
  location text,
  capacity int not null,
  min_players int not null,
  registration_opens_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('draft','scheduled','registration_open',
                      'filled','locked','in_progress','completed','cancelled')),
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);
create index on games (kickoff_at);
create index on games (status);
create index on games (season_id);

create table registrations (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  status text not null default 'registered'
    check (status in ('registered','waitlist','withdrawn')),
  team text check (team in ('A','B')),           -- filled at summary entry
  created_at timestamptz default now(),
  unique (game_id, user_id)
);
create index on registrations (game_id, status, created_at);

-- ============================================================
-- results
-- ============================================================
create table match_results (
  game_id uuid primary key references games(id) on delete cascade,
  team_a_score int not null,
  team_b_score int not null,
  summary text,                          -- match report; members + report viewers
  entered_by uuid references profiles(id),
  entered_at timestamptz default now()
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references games(id) on delete cascade,
  scorer_id uuid not null references profiles(id),
  team text not null check (team in ('A','B')),
  count int not null default 1
);

-- ============================================================
-- messaging
-- ============================================================
create table channels (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('league','game')),
  game_id uuid references games(id) on delete cascade,
  name text
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references channels(id) on delete cascade,
  user_id uuid not null references profiles(id),
  body text not null,
  created_at timestamptz default now()
);
create index on messages (channel_id, created_at);

-- ============================================================
-- notifications
-- ============================================================
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  game_id uuid references games(id) on delete set null,
  read boolean default false,
  created_at timestamptz default now()
);
create index on notifications (user_id, read, created_at);
