# Phase 1 — Run & wire-up (hosted Supabase)

Phase 1 is code-complete: Expo app scaffold, full DB schema, RLS helpers +
profiles policies, email/password auth, status-based routing, and the admin
members panel.

> **This project uses hosted Supabase (supabase.com) exclusively.**
> The live project is `xfjrdirhzrajwnvcfsge` — its URL + anon key are already in
> `.env`. All steps below happen in the **web dashboard**
> (https://supabase.com/dashboard). No Supabase CLI or Docker anywhere.

## 1. Install (already done once)

```bash
npm install
```

## 2. Apply the migrations (Dashboard SQL Editor)

The `.env` is already filled in from the project's **API settings** (Dashboard →
Project Settings → API):

```
EXPO_PUBLIC_SUPABASE_URL=https://xfjrdirhzrajwnvcfsge.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key>
```

Schema reaches the hosted DB through the **SQL Editor**: **Dashboard → SQL
Editor → New query**, paste the contents of each file in
`supabase/migrations/` **in numeric order**, and **Run** each one. For this
phase that's `0001_schema.sql` then `0002_functions_rls.sql`. Repeat this for
every new migration added in later phases.

## 3. Turn OFF email confirmation (required — do this before first login)

Hosted projects default to **"Confirm email" ON**, and the built-in email sender
is heavily rate-limited, so confirmation emails often never arrive — which locks
you out at sign-in with *"Email not confirmed."* This league gates membership
through admin approval, so email confirmation is redundant:

**Dashboard → Authentication → Sign In / Providers → Email → toggle
"Confirm email" OFF → Save.**

With it off, sign-up returns a session immediately (no email round-trip) and the
app routes straight to the pending screen.

> Prefer to keep confirmation on? Then configure a real SMTP provider under
> Authentication → Emails first, or the rate limit will block sign-ups.

## 4. Run the app

```bash
npx expo start
```

Open in Expo Go or a simulator — you land on the sign-in screen.

## 5. Create the first admin

1. In the app, **sign up** with `imuravchiksoccer@gmail.com`. With confirmation
   off you get a session immediately; the `handle_new_user` trigger creates a
   `profiles` row as `pending`/`player`.
2. Promote it in the **Dashboard → SQL Editor**:

```sql
update profiles
set status = 'active', role = 'admin'
where id = (select id from auth.users where email = 'imuravchiksoccer@gmail.com');
```

3. Relaunch the app → you land in the `(tabs)` shell with the **Admin · Members**
   and **Admin · Baselines** entries on the Profile tab.

## 6. Verify the DoD

- Sign up a second test account → it appears under **Members → pending**.
- Admit it as `active` → that account relaunches into `(tabs)`.
- Admit as `viewer` → lands in the read-only `(viewer)` group.
- Reject → stays in the `(pending)` group with the rejected message.

## Troubleshooting login

| Symptom | Cause | Fix |
|---|---|---|
| *"Email not confirmed"* on sign-in | Confirmation on; email never confirmed | Do §3, then delete the unconfirmed user (Auth → Users) and sign up again |
| *"email rate limit exceeded"* on sign-up | Built-in SMTP rate limit while confirmation is on | Do §3 (disable confirmation) |
| *"Database error saving new user"* | Migrations not applied | Do §2 (run the migrations in the SQL Editor) |
| *"Invalid login credentials"* | Wrong password, or account was never created | Reset password in Auth → Users, or sign up |
| Board/screens error on `get_leaderboard` | Phase 2 migrations not applied | Run 0003 + 0004 in the SQL Editor (see PHASE2_SETUP.md) |

## Migrations in this phase

- `supabase/migrations/0001_schema.sql` — all tables (incl. `match_results`/
  `goals`, created early so Phase 2's `player_stats` view compiles) + the
  `handle_new_user` trigger.
- `supabase/migrations/0002_functions_rls.sql` — `is_active_member()`,
  `is_admin()`, `can_view_reports()` (SECURITY DEFINER to avoid RLS recursion);
  RLS enabled on every table; real policies for `profiles` + `notification_prefs`.
