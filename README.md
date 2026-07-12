# Weekend League

A private mobile + web app for a ~100-player Russian-speaking weekend soccer club.
Members sign up with email/password and are admitted by an admin; admins schedule
recurring and one-off games, open registration windows, and enter match results.
The app tracks a season-only leaderboard, publishes match reports, runs a club
chat, and sends email notifications — all on a hosted Supabase backend.

Built with Expo (React Native) so a single codebase ships to **iOS, Android, and
the web** (deployed as a static site on Netlify).

---

## Table of contents

- [Features](#features)
- [Membership tiers](#membership-tiers)
- [Tech stack](#tech-stack)
- [Repository layout](#repository-layout)
- [Data model](#data-model)
- [Game lifecycle](#game-lifecycle)
- [Notifications](#notifications)
- [Getting started](#getting-started)
- [Backend workflow (hosted Supabase)](#backend-workflow-hosted-supabase)
- [Web deployment](#web-deployment)
- [Design system](#design-system)
- [Documentation](#documentation)

---

## Features

- **Admin-gated membership.** Anyone can create an account, but new signups land
  in a `pending` state and see only the leaderboard until an admin admits them.
- **Season leaderboard.** A real league table — squad-number rank badges, `P` /
  `W-D-L` columns, a signed `+/-` column, and a Golden Boot (goals) view. Stats
  combine manually-entered per-season **baselines** (pre-app history) with
  everything computed from games recorded in the app. Seasons are calendar years
  and roll over automatically on January 1.
- **Scheduling.** Admins define recurring **game series** (e.g. "Saturdays, 10:00")
  and one-off games. Registration windows open automatically ahead of kickoff.
- **Registration + waitlist.** Members register while a game is open; once
  capacity is hit, further signups go to the waitlist. Withdrawing frees a spot
  and auto-promotes the next waitlisted player (with a notification).
- **Match reports.** Admins enter the score, a written match report, the Team A/B
  team sheet, and per-scorer goal counts. Reports are readable by members and
  read-only "report viewers".
- **Attendance editing.** Admins can correct who actually played after the fact —
  adding walk-ups who never signed up and clearing no-shows — so the standings
  reflect reality (see `0019_edit_attendance.sql`).
- **Per-player match history.** Tapping a player on the leaderboard opens their
  season history — each match with the side they played, goals, and outcome.
- **Ghost players.** Historical players who never had an account exist as
  claimable "ghost" profiles, so their stats appear on the board and can later be
  merged into a real signup.
- **Club chat.** A league-wide channel plus per-game channels, with `@mentions`.
- **Email notifications.** Registration opening, game filling, low-roster alerts,
  waitlist promotions, kickoff reminders, results, and mentions — each delivered
  as an email to the address the member signs in with, plus an in-app alerts
  center with an unread badge. Per-category preferences are user-controllable.

## Membership tiers

Routing and access are driven entirely by `profiles.status` (and `role`):

| Tier | `status` | Access |
|---|---|---|
| Not authenticated | — | Sign-in / sign-up screens only |
| Pending / rejected | `pending` / `rejected` | **Leaderboard only** (via a security-definer RPC) |
| Report viewer | `viewer` | Leaderboard **+** published match reports, read-only |
| Active member | `active` | Full app — register, chat, notifications, profile |
| Admin | `role = 'admin'` | Full app **+** admin routes and write access |

Access is enforced in Postgres with Row-Level Security. Three SQL helpers —
`is_active_member()`, `is_admin()`, and `can_view_reports()` — back every policy,
so the client can never read or write past what its tier allows. Pending users get
exactly one read path: the `get_leaderboard()` security-definer RPC.

## Tech stack

| Layer | Choice |
|---|---|
| App | [Expo](https://expo.dev) (React Native) + TypeScript, [Expo Router](https://docs.expo.dev/router/introduction/) (file-based routing, typed routes) |
| UI | [NativeWind](https://www.nativewind.dev) (Tailwind for RN), Oswald + Inter fonts, custom "Boardwalk After Dark" design tokens |
| Server state | [TanStack Query](https://tanstack.com/query) |
| Backend | **Hosted [Supabase](https://supabase.com)** — Postgres, Auth, Realtime, Edge Functions, `pg_cron` |
| Notifications | Email to each user's Supabase Auth address, sent by a Deno Edge Function via SMTP |
| Web hosting | Static export (`expo export`) deployed on [Netlify](https://netlify.com) |

> **Backend is hosted-only.** There is no local Supabase, no Supabase CLI, and no
> Docker in this workflow. All backend changes go through the web dashboard — see
> [Backend workflow](#backend-workflow-hosted-supabase).

## Repository layout

```
.
├─ app/                         # Expo Router routes (file-based)
│  ├─ (auth)/                   #   sign-in, sign-up
│  ├─ (pending)/                #   leaderboard-only shell (pending/rejected users)
│  ├─ (viewer)/                 #   leaderboard + reports (read-only viewers)
│  ├─ (tabs)/                   #   active-member shell
│  │  ├─ index.tsx              #     Matchday (upcoming + recent games)
│  │  ├─ leaderboard.tsx        #     Table (Plus-Minus / Golden Boot)
│  │  ├─ chat.tsx               #     Clubhouse chat
│  │  ├─ notifications.tsx      #     Alerts center
│  │  └─ profile.tsx            #     Profile + notification prefs
│  ├─ admin/                    #   admin-only stack
│  │  ├─ members.tsx            #     admit / reject / set role
│  │  ├─ schedule.tsx           #     games
│  │  ├─ series.tsx             #     recurring series
│  │  ├─ baselines.tsx          #     manual season stat entry
│  │  ├─ connections.tsx        #     ghost-player claiming
│  │  ├─ game/[id].tsx          #     manage a game
│  │  └─ summary/[id].tsx       #     enter result / attendance
│  ├─ game/[id].tsx             #   game detail + register/waitlist
│  ├─ report/[id].tsx           #   match report
│  ├─ player/[id].tsx           #   per-player match history
│  ├─ past/                     #   past-games list
│  └─ _layout.tsx               #   routes by session + profile.status
├─ components/                  # leaderboard, shared UI, motif graphics
├─ lib/                         # supabase client, auth, theme, types, helpers
├─ supabase/
│  ├─ migrations/               # 0001…0020 — plain SQL, applied via the dashboard
│  └─ functions/
│     └─ send-notification-email/   # Deno Edge Function (emails notifications)
├─ docs/                        # phase setup guides + planning docs
├─ design-tokens.json           # single source of truth for colors
├─ app.json                     # Expo config
└─ netlify.toml                 # web build + SPA fallback
```

## Data model

The entire schema is created in [`0001_schema.sql`](supabase/migrations/0001_schema.sql);
later migrations add functions, RLS policies, and features. Core tables:

- **`profiles`** — one per auth user (`display_name`, `role`, `status`). Created
  automatically by a trigger on signup.
- **`seasons`** / **`season_baselines`** — calendar-year seasons; per-player
  starting stats for pre-app history.
- **`game_series`** — recurring game templates (day of week, kickoff time,
  capacity, how far ahead registration opens).
- **`games`** — concrete game instances with a `status` lifecycle and a
  `registration_opens_at` window. Season is assigned by trigger from the kickoff
  year, creating the season row on demand.
- **`registrations`** — one row per (game, user): `registered` / `waitlist` /
  `withdrawn`, plus the `team` (A/B) they played once recorded.
- **`match_results`** / **`goals`** — score + written report, and per-scorer goal
  counts.
- **`channels`** / **`messages`** — league and per-game chat.
- **`notifications`** / **`notification_prefs`** — the in-app/email feed and each
  user's per-category toggles.

The season leaderboard is a `player_stats` view (baseline + everything computed
from recorded games, scoped to the current season), exposed to the client only
through the `get_leaderboard()` RPC.

## Game lifecycle

```
draft → scheduled → registration_open → filled → locked → in_progress → completed
                          └─────────── cancelled (any pre-complete state) ────────┘
```

- **scheduled → registration_open** — a `pg_cron` job flips the game once
  `now() >= registration_opens_at`, then notifies players.
- **registration_open → filled** — signups reach `capacity`; extras waitlist.
- **→ locked** — at kickoff; the signup list freezes.
- **→ completed** — admin submits the result.

Teams are **not** chosen at signup — the admin records Team A/B per attendee when
entering the result. Once a game is past the signup phase, capacity no longer
gates the roster, so an admin writing attendance can add walk-ups and clear
no-shows (see [`0019_edit_attendance.sql`](supabase/migrations/0019_edit_attendance.sql)).

## Notifications

Delivery is **email to the user's Supabase Auth (sign-in) address** — not push.
Each notification is a row inserted into `notifications`. A database webhook on
insert calls the [`send-notification-email`](supabase/functions/send-notification-email/)
Edge Function, which resolves the recipient's email with the service role, checks
`notification_prefs` (dropping the send if the category is off), and emails the
title/body via the configured SMTP provider. The in-app alerts center and unread
badge subscribe to the same table over Realtime.

## Getting started

### Prerequisites

- Node.js 22+ (matches the Netlify build; older versions fail the web export)
- npm
- The [Expo Go](https://expo.dev/go) app on a phone, or an iOS/Android simulator,
  for device testing

### Install & run

```bash
npm install
npx expo start
```

Then press `i` / `a` for a simulator, `w` for web, or scan the QR code with Expo
Go. Type-check with:

```bash
npm run typecheck
```

### Environment variables

Copy [`.env.example`](.env.example) to `.env` and fill in the values from the
hosted Supabase project (Dashboard → Project Settings → API):

```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Both are safe to ship in the client bundle — the anon key is RLS-gated. The
service-role key and SMTP API key are **server-side only** and live in the Edge
Function's secrets, never in `.env`.

## Backend workflow (hosted Supabase)

This project targets a **hosted Supabase project managed entirely through the web
dashboard** ([supabase.com/dashboard](https://supabase.com/dashboard)). There is
no CLI or Docker.

- **Migrations** live in [`supabase/migrations/`](supabase/migrations/) as plain
  SQL and are applied by pasting each file into **Dashboard → SQL Editor** and
  running it, in numeric order (`0001` → `0020`).
- **Edge Functions** are deployed via the dashboard editor; their secrets
  (service-role key, SMTP key) are set under Edge Functions → Secrets.
- **Cron, webhooks, and extensions** (`pg_cron`, Database Webhooks) are configured
  directly on the hosted project.
- **Data inspection & RLS testing** happen in the SQL Editor / Table Editor.

Auth is configured with **email confirmation disabled** — the built-in SMTP is
rate-limited and membership is gated by admin approval anyway. First admin is
granted by setting `role='admin', status='active'` directly via SQL. See the
per-phase setup guides in [`docs/`](docs/) for details.

## Web deployment

The web build is a static Expo export served by Netlify (see
[`netlify.toml`](netlify.toml)):

```bash
npx expo export --platform web   # outputs to dist/
```

Netlify serves the static files first, then rewrites any unmatched path (dynamic
`[id]` routes, deep links, refreshes) to `index.html` so Expo Router resolves them
client-side. The build requires Node 22 because static rendering runs the Supabase
Realtime client under Node, which needs a global `WebSocket`.

## Design system

The UI follows a dark **"Boardwalk After Dark"** neon aesthetic (see
[`DESIGN_SYSTEM_PLAN.md`](DESIGN_SYSTEM_PLAN.md)). All color hex values live in a
single source of truth, [`design-tokens.json`](design-tokens.json), shared across
the JS/TypeScript ([`lib/theme.ts`](lib/theme.ts)) and Tailwind
([`tailwind.config.js`](tailwind.config.js)) boundaries so the two never drift.
Display type is Oswald (condensed, uppercase); body type is Inter with tabular
numerals for stat columns. The leaderboard, rendered as a real league table, is
the hero screen; everything else stays quiet around it.

## Documentation

- [`docs/WEEKEND_LEAGUE_PLAN.md`](docs/WEEKEND_LEAGUE_PLAN.md) — full developer
  outline + phased implementation plan (schema, RLS, cron, notifications)
- [`docs/PHASE1_SETUP.md`](docs/PHASE1_SETUP.md) … [`PHASE7_SETUP.md`](docs/PHASE7_SETUP.md)
  — per-phase backend setup steps
- [`docs/PLAYER_IMPORT_PLAN.md`](docs/PLAYER_IMPORT_PLAN.md) — historical player /
  ghost-profile import
- [`DESIGN_SYSTEM_PLAN.md`](DESIGN_SYSTEM_PLAN.md) — visual design system
