# RussianSpeakingSoccerClub — Weekend League

Private Expo (React Native) app for a ~100-player weekend soccer league:
admin-gated membership, scheduled games with registration windows, a
season-only leaderboard, match reports, and notifications.

## How this project runs

- **Backend: hosted Supabase only** (supabase.com, project
  `xfjrdirhzrajwnvcfsge`). The URL and anon key are already in `.env`.
  There is **no local Supabase, no Supabase CLI, and no Docker** in this
  workflow — all backend changes (migrations, Edge Functions, webhooks,
  cron, data inspection) go through the web dashboard at
  https://supabase.com/dashboard.
- **Migrations** live in `supabase/migrations/` as plain SQL and are applied
  by pasting them into **Dashboard → SQL Editor** and running them, in order.
- **Notifications are delivered by email** to the address the user signs in
  with (their Supabase Auth email). The in-app Alerts center and unread badge
  read the same `notifications` table via Realtime.

## Run the app

```bash
npm install
npx expo start
```

## Docs

- [WEEKEND_LEAGUE_PLAN.md](WEEKEND_LEAGUE_PLAN.md) — full outline + phased plan
- [PHASE1_SETUP.md](PHASE1_SETUP.md) — auth, schema, first admin
- [PHASE2_SETUP.md](PHASE2_SETUP.md) — seasons & leaderboard
- [PHASE3_SETUP.md](PHASE3_SETUP.md) — games & registration
- [PHASE4_SETUP.md](PHASE4_SETUP.md) — notifications
- [DESIGN_SYSTEM_PLAN.md](DESIGN_SYSTEM_PLAN.md) — visual design system
