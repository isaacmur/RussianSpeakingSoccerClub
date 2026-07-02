# Weekend League — Developer Outline & Phased Implementation Plan

This document combines the original developer outline for the Weekend League app with the phased implementation plan derived from it.

---

# Part 1 — Developer Outline

Private mobile app for a ~100-player weekend soccer league with a few admins. Members sign up with email/password and are admitted by an admin. Admins schedule recurring + one-off games, open registration windows, and enter match summaries. Push notifications, live updates, and a season-only leaderboard.

## 1. Stack

| Layer | Choice |
|---|---|
| App | Expo (React Native) + TypeScript, Expo Router |
| UI | NativeWind (Tailwind) |
| Server state | TanStack Query |
| Backend | Supabase — Postgres, Auth, Realtime, Storage, Edge Functions, `pg_cron` |
| Push | Expo Push Service (routes to APNs/FCM) |
| Build/dist | EAS Build/Submit → TestFlight + Play internal testing |

## 2. Repo layout

> Note: the implementation plan (Part 2) flattens this layout — `app/`, `supabase/`, `eas.json` live at the repo root rather than nested under a `weekend-league/` subfolder, since this repo *is* the Weekend League project.

```
weekend-league/
├─ app/
│  ├─ app/                       # expo-router routes
│  │  ├─ (auth)/                 # sign-in, sign-up
│  │  ├─ (pending)/              # leaderboard-only view for non-active users
│  │  │  └─ leaderboard.tsx
│  │  ├─ (viewer)/               # leaderboard + match reports, read-only
│  │  │  ├─ leaderboard.tsx
│  │  │  └─ reports.tsx
│  │  ├─ (tabs)/                 # active members
│  │  │  ├─ index.tsx            # upcoming games
│  │  │  ├─ leaderboard.tsx
│  │  │  ├─ chat.tsx
│  │  │  ├─ notifications.tsx
│  │  │  └─ profile.tsx
│  │  ├─ game/[id].tsx           # game detail + register/waitlist
│  │  ├─ admin/                  # admin-only stack
│  │  │  ├─ members.tsx
│  │  │  ├─ schedule.tsx
│  │  │  ├─ series.tsx
│  │  │  ├─ baselines.tsx        # manual season stat entry
│  │  │  └─ summary/[id].tsx     # match summary entry
│  │  └─ _layout.tsx             # routes by auth state + profile.status
│  ├─ lib/supabase.ts
│  ├─ lib/push.ts                # token registration + handlers
│  └─ components/
├─ supabase/
│  ├─ migrations/                # 0001_schema.sql, 0002_rls.sql, 0003_functions.sql, 0004_cron.sql
│  └─ functions/send-push/       # Edge Function (Deno)
└─ eas.json
```

## 3. Schema

```sql
-- ---------- identity ----------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  avatar_url text,
  role text not null default 'player' check (role in ('player','admin')),
  status text not null default 'pending'
    check (status in ('pending','active','viewer','rejected')),  -- viewer = match report viewer
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

-- ---------- seasons (calendar year; new season every Jan 1) ----------
create table seasons (
  id uuid primary key default gen_random_uuid(),
  year int not null unique,               -- 2026, 2027, ...
  name text not null                      -- "2026 Season"
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

-- ---------- scheduling ----------
create table game_series (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  day_of_week int not null,               -- 0=Sun .. 6=Sat
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
  series_id uuid references game_series(id),      -- null for one-off / holiday
  season_id uuid references seasons(id),          -- set by trigger from kickoff year
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
  team text check (team in ('A','B')),            -- filled at summary entry
  created_at timestamptz default now(),
  unique (game_id, user_id)
);
create index on registrations (game_id, status, created_at);

-- ---------- results ----------
create table match_results (
  game_id uuid primary key references games(id) on delete cascade,
  team_a_score int not null,
  team_b_score int not null,
  summary text,                          -- match report; shown to members + report viewers
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

-- ---------- messaging ----------
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

-- ---------- notifications ----------
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
```

## 4. Seasons & Jan 1 rollover

Seasons are calendar years. The "current" season is derived from the current date in league-local time, so a new season begins automatically at midnight on January 1 — no manual step.

```sql
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
```

Any game scheduled into 2027 lands in the 2027 season, created on demand — so the Jan 1 boundary needs no cron. Seed the first season manually: `insert into seasons(year,name) values (2026,'2026 Season');`

## 5. Leaderboard (season-only, baseline + computed)

Final stats = manually-entered baseline **plus** everything computed from app-recorded games, scoped to the current season.

```sql
create view player_stats as
with cur as (select current_season_id() as sid),
per_game as (
  select r.user_id,
    case when r.team='A' then mr.team_a_score else mr.team_b_score end as gf,
    case when r.team='A' then mr.team_b_score else mr.team_a_score end as ga
  from registrations r
  join match_results mr on mr.game_id = r.game_id
  join games g          on g.id = r.game_id
  where r.status='registered' and r.team is not null
    and g.season_id = (select sid from cur)
),
computed as (
  select user_id,
    count(*)                        as games_played,
    count(*) filter (where gf > ga) as wins,
    count(*) filter (where gf = ga) as draws,
    count(*) filter (where gf < ga) as losses,
    sum(gf - ga)                    as plus_minus
  from per_game group by user_id
),
computed_goals as (
  select gl.scorer_id as user_id, sum(gl.count) as goals
  from goals gl join games g on g.id = gl.game_id
  where g.season_id = (select sid from cur)
  group by gl.scorer_id
),
base as (
  select user_id, games_played, wins, draws, losses, plus_minus, goals
  from season_baselines where season_id = (select sid from cur)
),
ids as (
  select user_id from computed
  union select user_id from computed_goals
  union select user_id from base
)
select
  i.user_id,
  coalesce(b.games_played,0) + coalesce(c.games_played,0) as games_played,
  coalesce(b.wins,0)         + coalesce(c.wins,0)         as wins,
  coalesce(b.draws,0)        + coalesce(c.draws,0)        as draws,
  coalesce(b.losses,0)       + coalesce(c.losses,0)       as losses,
  coalesce(b.plus_minus,0)   + coalesce(c.plus_minus,0)   as plus_minus,
  coalesce(b.goals,0)        + coalesce(cg.goals,0)       as goals
from ids i
left join computed       c  on c.user_id  = i.user_id
left join computed_goals cg on cg.user_id = i.user_id
left join base           b  on b.user_id  = i.user_id;
```

Admins enter baselines through `admin/baselines.tsx` (write to `season_baselines`). Primary board sorts by `plus_minus`; Golden Boot tab sorts by `goals`.

## 6. Access control

Two helpers drive every policy:

```sql
create or replace function is_active_member() returns boolean
language sql stable as $$
  select exists(select 1 from profiles
                where id = auth.uid() and status = 'active');
$$;

create or replace function is_admin() returns boolean
language sql stable as $$
  select exists(select 1 from profiles
                where id = auth.uid() and status = 'active' and role = 'admin');
$$;

-- Members and report viewers may read match reports; pending/rejected may not.
create or replace function can_view_reports() returns boolean
language sql stable as $$
  select exists(select 1 from profiles
                where id = auth.uid() and status in ('active','viewer'));
$$;
```

### Membership tiers
- **Not authenticated:** auth screens only.
- **`pending` / `rejected`:** **leaderboard only.** No table access — served through a `security definer` RPC that bypasses RLS for read-only stats.
- **`viewer` (match report viewer):** leaderboard **plus** published match reports (score, summary, scorers), read-only. No registration, chat, or notification management.
- **`active` (playing member):** full app.
- **Admin** (`role='admin'`): full app + admin routes and write access to games/series/results/members/baselines.

### Leaderboard RPC (the one thing pending users can read)

```sql
create or replace function get_leaderboard()
returns table(user_id uuid, display_name text, games_played int, wins int,
              draws int, losses int, plus_minus int, goals int)
language sql stable security definer set search_path = public as $$
  select ps.user_id, pr.display_name, ps.games_played, ps.wins, ps.draws,
         ps.losses, ps.plus_minus, ps.goals
  from player_stats ps
  join profiles pr on pr.id = ps.user_id
  order by ps.plus_minus desc, ps.goals desc;
$$;
revoke all on function get_leaderboard() from public;
grant execute on function get_leaderboard() to authenticated;
```

Every screen (pending and active) reads the board via `rpc('get_leaderboard')`, so no client needs direct select on the underlying tables.

### RLS sketch (enable RLS on all tables)

```sql
-- profiles: read own always; read others only if active; write own; admins write any.
create policy p_self_read   on profiles for select using (id = auth.uid());
create policy p_member_read on profiles for select using (is_active_member());
create policy p_self_write  on profiles for update using (id = auth.uid());
create policy p_admin_write on profiles for all    using (is_admin());

-- games / game_series / seasons / channels / messages / notifications:
--   select: is_active_member();  write: is_admin()  (messages: insert own)
-- registrations:
--   select: is_active_member()
--   insert own: is_active_member() AND game is 'registration_open' AND now() < kickoff_at
--   delete own: is_active_member() AND now() < kickoff_at
--   admin: all
-- match_results / goals: select can_view_reports() (members + report viewers); write is_admin()
-- season_baselines: select is_active_member(); write is_admin()
```

Registration-window and pre-kickoff checks are enforced in the `using`/`with check` clauses so the client can't sign up late or after lock.

## 7. Game lifecycle

```
draft → scheduled → registration_open → filled → locked → in_progress → completed
                            └──────────── cancelled (any pre-complete state) ────────┘
```

- `scheduled → registration_open`: cron flips when `now() >= registration_opens_at` → notify players.
- `registration_open → filled`: signups hit `capacity`; extra signups become `waitlist` → notify.
- `→ locked`: at `kickoff_at`; signup list frozen.
- `→ completed`: admin submits summary → notify.

**Teams** are not set at signup. Admin records Team A/B per attendee when entering the summary (pre-picked or captain-picked on the field). `registrations.team` is written then.

**Waitlist promotion:** on withdrawal from a full game, a trigger promotes the earliest `waitlist` row to `registered` and inserts a `spot_opened` notification.

## 8. Cron (`pg_cron`, UTC)

```
nightly  02:00 : materialize games from active series (keep next 4 weeks)
every 5m       : scheduled → registration_open past open time; enqueue notifications
every 15m      : games within 12h with registered < min_players & no prior alert → needs_players
every 5m       : registration_open/filled → locked at kickoff_at
```

## 9. Notifications

Each notification is a row insert. A database webhook on `notifications` insert calls the `send-push` Edge Function, which loads the target's `expo_push_token` + `notification_prefs`, drops it if the category is off, and POSTs to Expo. The in-app center and badge subscribe to the same table via Realtime.

| type | trigger | recipients |
|---|---|---|
| `registration_open` | cron flips game open | active players |
| `game_filled` | signups reach capacity | registrants |
| `needs_players` | < min_players near kickoff | active players |
| `spot_opened` | waitlist promotion | promoted player |
| `kickoff_reminder` | N h before kickoff | registered players |
| `roster_posted` | admin publishes pre-picked teams (optional) | that game's players |
| `results_posted` | admin submits summary | that game's players |
| `chat_mention` | @mention in a channel | mentioned user |

`send-push` (Deno) skeleton: read `record.user_id` from the webhook payload → fetch token + pref for `record.type` → if enabled, `POST https://exp.host/--/api/v2/push/send` with `{ to, title, body, data:{ game_id } }`.

## 10. Realtime subscriptions

- `registrations` filtered by `game_id` → live signup list + spots remaining on game detail.
- `messages` filtered by `channel_id` → live chat.
- `notifications` filtered by `user_id` → live badge + center.
- `player_stats` isn't realtime; refetch the leaderboard RPC on focus and after a summary is submitted.

## 11. App routing logic (`app/_layout.tsx`)

```
session? no  → (auth)
session? yes → load profile.status
  status = active            → (tabs)   [+ admin stack if role=admin]
  status = viewer            → (viewer): leaderboard + match reports, read-only
  status = pending|rejected  → (pending)/leaderboard   (only screen available)
```

Register the Expo push token on first `active` login; write it to `profiles.expo_push_token`.

## 12. Build sequence (original outline)

1. **Foundation** — Expo + NativeWind + Expo Router scaffold; Supabase project; `profiles` + email/password auth; `_layout` routing by status; admin **Members** panel (admit as member or report viewer / reject / set role); `is_active_member`/`is_admin`/`can_view_reports` + base RLS.
2. **Seasons & leaderboard** — `seasons`, `season_baselines`, season trigger, `player_stats` view, `get_leaderboard` RPC; leaderboard screen (Plus-Minus / Golden Boot tabs) wired for both pending and active users; admin **baselines** entry screen.
3. **Games & registration** — `game_series`, `games`, `registrations`; materialization + window cron; register/waitlist with auto-promotion; live signup list via Realtime; admin schedule + series screens.
4. **Notifications** — push token capture; `send-push` Edge Function + webhook; full taxonomy; prefs screen; in-app center + badge.
5. **Results & reports** — admin summary panel: score, a **match-report text box**, Team A/B per attendee, and **goal scorers with counts**; writes `match_results` (incl. `summary`) + `goals` + `registrations.team`. Reports readable by members and report viewers; leaderboard refresh on submit.
6. **Messaging** — league channel + per-game channels; realtime chat + @mentions.
7. **Distribution** — EAS Build → TestFlight + Play internal testing; polish empty/loading states.

> Note: the phased plan in Part 2 keeps this same overall order but resequences *when* certain tables/functions are created to close dependency gaps (see "Key ordering fixes" below).

## 13. Config

- **Env:** `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`; Edge Function holds the service-role key server-side only.
- **Timezone:** store UTC, run cron in UTC, display and compute season boundaries in `America/New_York`.
- **Accounts:** Apple Developer + Google Play developer account for store/testing distribution.
- **Seed:** insert the current season row and the league-wide chat channel on first deploy; grant the first admin by setting `role='admin', status='active'` directly.

## 14. UI / design system

Visual direction is a **team sheet / scoreboard** aesthetic — amateur-football materials rather than generic sports-SaaS. Interactive reference: `WeekendLeagueMockup.jsx` (web React prototype; tokens below map 1:1 to NativeWind classes in the Expo build).

**Palette**

| Token | Hex | Use |
|---|---|---|
| ink | `#111A2E` | scoreboard headers, primary text, dark surfaces |
| chalk | `#F4F1E8` | app background (warm paper) |
| card | `#FFFFFF` | cards, rows |
| line | `#E7E2D3` | hairline dividers / borders |
| pitch | `#1F7A46` | positive: registration open, positive +/-, primary CTA, "you" |
| boot | `#F1571C` | goals, Golden Boot, urgent "needs players", full/waitlist |
| mute | `#6B7280` | secondary text |

**Type:** condensed heavy uppercase for display (headings, scorelines, ranks, CTAs) via an `Arial Narrow`/`Oswald` stack; system sans for body; tabular numerals on every stat. Green and orange are the only accents — green stays restrained (positive states), orange carries goals and anything urgent.

**Signature element:** the leaderboard rendered as a real league table — squad-number rank badges, `P` / `W-D-L` columns, and a bold `+/-` column colored by sign. It's the hero; other screens stay quiet.

**Screen inventory (in the mockup):** Matchday (upcoming + recent, recent games open their match report) · Game detail (capacity meter, register/waitlist, team sheet) · Table (Plus-Minus / Golden Boot tabs) · Match report (score, summary text, scorer chips) · Clubhouse chat · Alerts · Profile (stats + notification toggles). Admin: result entry (score steppers, **match-report text box**, A/B team assignment, **per-scorer goal counts** with a live A/B goal tally, notify) and members panel (admit as **member** or **report viewer**, or reject). Report viewers get the table + match reports only; pending users get the leaderboard only.

The preview includes a **Member / Report viewer / Pending / Admin** switch to view each access state.

---

# Part 2 — Phased Implementation Plan

## Context

The `RussianSpeakingSoccerClub` repo is currently empty (just a `README.md`) — this is a greenfield build. The user supplied the complete developer outline above describing a private mobile app for a ~100-player weekend soccer league: Expo/React Native + Supabase, with membership tiers (pending/viewer/active/admin), scheduled games with registration windows, a season-only leaderboard seeded from manual baselines, push notifications, realtime updates, and messaging. The outline already contains a full schema, RLS design, cron jobs, and its own 7-step "build sequence" (Part 1, section 12) — this plan operationalizes that sequence into concrete, ordered engineering tasks with explicit dependency ordering, so implementation can proceed phase-by-phase across future sessions without re-deriving the architecture each time.

Two layout/process decisions confirmed with the user:
- **Flatten the repo layout** — `app/`, `supabase/`, `eas.json` live at the repo root (not nested under a `weekend-league/` subfolder as literally shown in the outline).
- **Plan document only** — no GitHub issues are being created for phase tracking at this stage.

The phase order below follows the outline's section 12 build sequence, but restructures *when tables/functions get created* to close dependency gaps the outline doesn't sequence explicitly (e.g. `player_stats` in phase 2 selects from `match_results`/`goals`, which the outline's own sequence doesn't create until phase 5 — so those tables move into the phase-1 schema migration instead).

## Phase 0 — Prerequisites (non-code, can start immediately, parallel to Phase 1)

- Create the Supabase project (hosted); record project URL + anon key.
- Start Apple Developer Program + Google Play Console enrollment now — approval can take days, and this is currently the outline's single biggest schedule risk if left until distribution (phase 7).
- Install Supabase CLI + Docker for local dev (`supabase init` / `supabase start`).
- Reserve app bundle identifiers for EAS.
- Confirm first-admin account: `imuravchiksoccer@gmail.com` (granted `role='admin', status='active'` directly via SQL after phase 1's `profiles` table exists).

**DoD:** Supabase project exists and CLI is linked; Apple/Google developer applications submitted.

## Phase 1 — Foundation

Scaffold the app, stand up the **entire** schema (not just `profiles`), and get auth + status-based routing + admin member approval working end-to-end.

**Order of work:**
1. `npx create-expo-app`, TypeScript, Expo Router, NativeWind config.
2. `supabase init`, `supabase start` (local Postgres).
3. `supabase/migrations/0001_schema.sql` — create **all** tables from the outline's schema section in one migration: `profiles`, `notification_prefs`, `seasons`, `season_baselines`, `game_series`, `games`, `registrations`, `match_results`, `goals`, `channels`, `messages`, `notifications`. Creating `match_results`/`goals` here (rather than deferring to phase 5) is required so the `player_stats` view in phase 2 compiles.
4. `supabase/migrations/0002_functions_rls.sql` — `is_active_member()`, `is_admin()`, `can_view_reports()`, then `enable row level security` on **all** tables. Write real policies for `profiles` now; for tables whose UI ships later, enabling RLS with no policy yet is safe (default-deny) and avoids retrofitting RLS onto live tables later.
5. `lib/supabase.ts` client; `(auth)/` sign-in + sign-up screens (email/password).
6. `app/_layout.tsx` — route by session presence, then `profiles.status` (pending/rejected → `(pending)`, viewer → `(viewer)`, active → `(tabs)` [+ admin stack if role=admin]).
7. `(pending)/leaderboard.tsx` stub screen (real data wired in phase 2).
8. `admin/members.tsx` — list pending profiles; admit as `active` or `viewer`, reject, set role.

**DoD:** An admin logs in, sees a pending signup, promotes them to `active`; that member relaunches the app and lands in the `(tabs)` shell (screens can be empty placeholders at this point).

**Testing:** Supabase Studio to inspect rows; SQL editor role-simulation (`set role authenticated; set request.jwt.claim.sub = '<uid>'`) to verify RLS policies directly; Expo Go / simulator for the auth + routing flow.

## Phase 2 — Seasons & Leaderboard

- `0003_seasons.sql` — seed the 2026 `seasons` row; `current_season_id()`; `set_game_season()` trigger on `games`. This must exist **before** phase 3 ever inserts a game, since `games.season_id` depends on the trigger firing on insert.
- `0004_player_stats.sql` — `player_stats` view + `get_leaderboard()` security-definer RPC with `revoke/grant execute`.
- RLS: `season_baselines` select `is_active_member()`, write `is_admin()`.
- Leaderboard screens for all three read tiers — `(pending)/leaderboard.tsx`, `(viewer)/leaderboard.tsx`, `(tabs)/leaderboard.tsx` — all calling `rpc('get_leaderboard')` via TanStack Query; Plus-Minus / Golden Boot tabs (client-side sort toggle).
- `admin/baselines.tsx` — per-player season baseline entry form.

**DoD:** With zero games/results in the database, the leaderboard renders correctly (all zeros, or baseline-only numbers) for pending, viewer, and active roles alike, purely from `season_baselines` + the empty `player_stats` view.

**Risk to verify:** confirm `get_leaderboard()` is actually callable by a `pending`-status user (the security-definer bypass is the one read path pending users get) — test this explicitly, not just for active/admin.

**Testing:** Insert baseline rows via Studio; call the RPC from the SQL editor and from the app under each of the four profile states.

## Phase 3 — Games & Registration

- `0005_registrations_rls.sql` — RLS for `game_series`/`games` (select `is_active_member()`, write `is_admin()`); `registrations` (select `is_active_member()`; insert-own gated on `status='registration_open' AND now() < kickoff_at`; delete-own gated on `now() < kickoff_at`; admin full access).
- `0006_waitlist_trigger.sql` — withdrawal trigger promotes the earliest `waitlist` row to `registered` and inserts a `spot_opened` row into `notifications` (table already exists from phase 1; consumption wired in phase 4).
- Materialization + state-transition logic from the outline's cron section, written first as plain SQL functions callable manually (`select fn()`), then scheduled with `pg_cron` — **only against the hosted Supabase project**, since `pg_cron` isn't reliably available on local Docker. This means phase 3 needs an explicit "push migrations to hosted, enable the `pg_cron` extension" checkpoint before cron can be verified end-to-end.
- `admin/schedule.tsx`, `admin/series.tsx`.
- `game/[id].tsx` — capacity meter, register/waitlist action, Realtime subscription on `registrations` filtered by `game_id`.

**DoD:** Admin creates a series → a game materializes; a member registers; capacity fills and the next signup lands on the waitlist; withdrawing a registered player promotes the waitlisted one, visible live via Realtime on a second device/session.

**Testing:** Manually invoke cron SQL functions before scheduling them; Studio to watch `games.status` transitions; two simulator/device sessions to confirm Realtime propagation.

## Phase 4 — Notifications

- `lib/push.ts` — Expo push token capture, registered once per session but gated on `status='active'` (not just session presence), per the outline's routing logic.
- `supabase/functions/send-push/index.ts` (Deno Edge Function) + a Database Webhook on `notifications` insert.
- Wire the full notification taxonomy: `registration_open`, `game_filled`, `needs_players`, `spot_opened`, `kickoff_reminder`, plus placeholders for `results_posted`/`chat_mention` (fully wired in phases 5–6).
- `(tabs)/notifications.tsx` + unread badge via Realtime subscription on `notifications` filtered by `user_id`; `profile.tsx` notification-preference toggles.

**DoD:** Registering for a game, a `needs_players` window, and a waitlist promotion each produce both a push and an in-app notification with correct badge count; toggling off a preference suppresses that category.

**Risk:** push testing needs a real device with an EAS dev-client build (not Expo Go, whose push support is limited/deprecated in places) — flag this early rather than discovering it during testing.

**Testing:** Supabase Dashboard → Database → Webhook logs; Expo's push notification tool to send test payloads; a physical device for real APNs/FCM delivery.

## Phase 5 — Results & Reports

- `admin/summary/[id].tsx` — score steppers, match-report text box, Team A/B assignment per attendee, per-scorer goal counts with a live A/B tally; persist `match_results` + `goals` + `registrations.team` atomically (one RPC or Edge Function, to avoid partial writes on failure).
- RLS: `match_results`/`goals` select `can_view_reports()` (active + viewer), write `is_admin()`.
- On submit: fire `results_posted` notification; invalidate/refetch the leaderboard query.
- `(tabs)/index.tsx` — recent games open their match report; `(viewer)/reports.tsx`.

**DoD:** Admin submits a result; leaderboard numbers update immediately across active/viewer/pending views; a seeded viewer-role account can read the report but cannot register or use chat.

## Phase 6 — Messaging

- `0008_messages_rls.sql`; seed the league-wide channel; per-game channels created alongside game materialization.
- Realtime subscription on `messages`; client-side `@mention` parsing inserts a `chat_mention` notification.
- `(tabs)/chat.tsx`.

**DoD:** Two devices exchange live messages; mentioning a user triggers their notification/push.

## Phase 7 — Distribution

- `eas.json` build profiles (dev/preview/production); EAS Submit to TestFlight + Play internal testing.
- Empty/loading/error state polish across all screens; apply the design tokens (ink/chalk/card/line/pitch/boot/mute, condensed uppercase display type) per the outline's UI section.
- Final RLS audit across all tables before the TestFlight link goes out to real testers.

**DoD:** Internal testers install via TestFlight/Play and complete the full flow: sign up → get admitted → register for a game → get notified → view the result → use chat.

## Cross-Cutting Notes

- **Commit/PR granularity:** one PR per phase (0 excluded, since it's non-code) — each bundles its migrations, RLS, screens, and any Edge Function so the phase's DoD is reviewable as a unit.
- **Local vs. hosted Supabase:** iterate migrations against `supabase start` (local Docker) with `supabase db reset`; push to the hosted project with `supabase db push` once a phase's migrations stabilize. `pg_cron` and Database Webhooks need explicit hosted-project checkpoints in phases 3–4 since they aren't fully testable locally.
- **Key ordering fixes vs. the raw outline** (call these out explicitly when implementing, since the outline's own section numbering doesn't sequence them this way):
  - `match_results` / `goals` tables created in phase 1's schema migration, not phase 5, so `player_stats` (phase 2) compiles.
  - `is_active_member` / `is_admin` / `can_view_reports` created before any RLS policy references them (start of phase 1).
  - `set_game_season` trigger created in phase 2, before phase 3 creates its first game row.

### Critical files (flattened repo root)
- `./supabase/migrations/0001_schema.sql`, `0002_functions_rls.sql`, `0003_seasons.sql`, `0004_player_stats.sql`, `0005_registrations_rls.sql`, `0006_waitlist_trigger.sql`, `0008_messages_rls.sql`
- `./supabase/functions/send-push/index.ts`
- `./app/_layout.tsx`, `./app/(auth)/`, `./app/(pending)/`, `./app/(viewer)/`, `./app/(tabs)/`, `./app/admin/`, `./app/game/[id].tsx`
- `./lib/supabase.ts`, `./lib/push.ts`
- `./eas.json`

## Verification

Each phase's DoD above doubles as its acceptance test — run it manually via Expo Go/simulator or an EAS dev-client build against the local (phases 1–2) or hosted (phases 3+) Supabase project, using Supabase Studio and the SQL editor to inspect table state and simulate RLS as different roles. There is no existing automated test harness in this repo; introducing one (e.g. Detox/Maestro for the mobile flows, pgTAP for RLS) is out of scope for this plan but worth revisiting once phase 1 lands.
