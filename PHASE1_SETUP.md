# Phase 1 — Run & wire-up

Phase 1 is code-complete: Expo app scaffold, full DB schema, RLS helpers +
profiles policies, email/password auth, status-based routing, and the admin
members panel. Connections to a live Supabase project are deferred — do the
steps below when you're ready to run it end-to-end.

## 1. Install (already done once)

```bash
npm install
```

## 2. Bring up Supabase

**Local (needs Docker Desktop running):**

```bash
npx supabase start          # boots Postgres + Studio + Auth locally
npx supabase db reset       # applies migrations 0001 + 0002 + seed.sql
```

`supabase start` prints an **API URL** and **anon key**. Copy `.env.example`
to `.env` and paste them in:

```
EXPO_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key from `supabase start`>
```

**Hosted instead:** create the project, then
`npx supabase link --project-ref <ref>` and `npx supabase db push`. Use the
project URL + anon key from the dashboard's API settings in `.env`.

> Note: on a physical device `127.0.0.1` won't resolve to your laptop — use your
> machine's LAN IP (e.g. `http://192.168.1.x:54321`) or a hosted project.

## 3. Run the app

```bash
npx expo start
```

Open in Expo Go (or a simulator). You'll land on the sign-in screen.

## 4. Create the first admin

Auth users are created by signing up in the app, so:

1. In the app, **sign up** with `imuravchiksoccer@gmail.com`. The
   `handle_new_user` trigger creates a `profiles` row as `pending`/`player`.
2. Promote it directly (Supabase Studio SQL editor, or `psql`):

```sql
update profiles
set status = 'active', role = 'admin'
where id = (select id from auth.users where email = 'imuravchiksoccer@gmail.com');
```

3. Relaunch the app — you now land in the `(tabs)` shell with the
   **Admin · Members** entry on the Profile tab.

## 5. Verify the DoD

- Sign up a second test account → it appears under **Members → pending**.
- Admit it as `active` → that account relaunches into `(tabs)`.
- Admit as `viewer` → lands in the read-only `(viewer)` group.
- Reject → stays in the `(pending)` group with the rejected message.

## Migrations in this phase

- `supabase/migrations/0001_schema.sql` — all tables (incl. `match_results`/
  `goals`, created early so Phase 2's `player_stats` view compiles) + the
  `handle_new_user` trigger.
- `supabase/migrations/0002_functions_rls.sql` — `is_active_member()`,
  `is_admin()`, `can_view_reports()` (SECURITY DEFINER to avoid RLS recursion);
  RLS enabled on every table; real policies for `profiles` + `notification_prefs`.
