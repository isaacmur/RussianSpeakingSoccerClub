# Phase 4 — Notifications

Phase 4 covers the notification fan-out (registration_open, game_filled,
needs_players, kickoff_reminder — spot_opened shipped in Phase 3), delivery,
the in-app **Alerts** center with a live unread tab badge, and the
notification-preference toggles + season stats card on **Profile**.

> **Hosted Supabase** (`xfjrdirhzrajwnvcfsge`), managed through the **web
> dashboard** at https://supabase.com/dashboard — every step below is
> dashboard-only. No Supabase CLI, no Docker.

> **Delivery channel: EMAIL.** Notifications are delivered as **emails to the
> address each user signs in with** (their Supabase Auth email,
> `auth.users.email`). There is no mobile push (no Expo push tokens, no
> APNs/FCM, no EAS build requirement for notifications). The in-app Alerts
> center and badge are unaffected — they read the `notifications` table live
> via Realtime.
>
> **Status:** the fan-out migration, in-app center, badge, and pref toggles are
> built, and the email function exists in the repo at
> [`supabase/functions/send-notification-email/index.ts`](supabase/functions/send-notification-email/index.ts)
> — it still has to be **deployed** and wired to the webhook per §2–3. The old
> `send-push` function (Expo push) is retired.

## 1. Apply the migration (SQL Editor)

**Dashboard → SQL Editor → New query** → paste the full contents of
[`supabase/migrations/0008_notifications.sql`](supabase/migrations/0008_notifications.sql)
→ **Run**. It should finish with no errors ("Success. No rows returned").

The file is idempotent-ish in its guarded parts (realtime publication, cron
jobs) but the `create policy` / `create trigger` statements will error if run
twice — if you need to re-run it, drop those first or just fix the one failing
statement.

`0008_notifications.sql` —

- RLS on `notifications` (read/update own only) and adds the table to the
  `supabase_realtime` publication (the badge + center subscribe to it).
- `notify_registration_open()` — one notice per newly-opened game to every
  active player; now called from `open_registrations()` on the same cron tick.
- `notify_game_filled` trigger — the registration that hits capacity notifies
  all registrants (game-level dedupe).
- `notify_needs_players()` / `notify_kickoff_reminders()` — cron functions:
  games inside 12h still short of `min_players` alert all active players;
  registered players get a reminder 3h before kickoff.
- Two new pg_cron jobs (`needs-players`, `kickoff-reminders`, every 15 min) in
  the same guarded block as 0007 — if you enabled pg_cron in Phase 3 they
  register when the script runs; verify in the SQL Editor with
  `select * from cron.job;` (you should now see 5 jobs).

> **If `cron.job` does not exist**, pg_cron was never enabled and the guarded
> blocks in 0007/0008 silently no-op'd — **no cron jobs are registered** and
> registration opening / locking / materialization / reminders are not
> running. Fix: **Dashboard → Database → Extensions → enable `pg_cron`**, then
> register all five jobs in the SQL Editor:
>
> ```sql
> select cron.schedule('materialize-games',  '0 2 * * *',    'select materialize_games()');
> select cron.schedule('open-registrations', '*/5 * * * *',  'select open_registrations()');
> select cron.schedule('lock-games',         '*/5 * * * *',  'select lock_games()');
> select cron.schedule('needs-players',      '*/15 * * * *', 'select notify_needs_players()');
> select cron.schedule('kickoff-reminders',  '*/15 * * * *', 'select notify_kickoff_reminders()');
> select jobname, schedule from cron.job order by jobname;
> ```

## 2. Set up email sending

Two pieces, both dashboard-side:

1. **Email provider: Brevo** — the built-in Supabase mailer is heavily
   rate-limited and meant only for auth emails. This project uses Brevo's
   transactional API. In Brevo: verify a sender address (**Senders & IPs →
   Senders**) and create a REST API key (**Settings → SMTP & API → API Keys**
   — the `xkeysib-…` key, not the SMTP key). Store as Edge Function secrets
   (**Dashboard → Edge Functions → Secrets**): `BREVO_API_KEY`,
   `NOTIFY_FROM_EMAIL` (the verified sender), optional `NOTIFY_FROM_NAME`.
   Free tier is 300 emails/day — a league-wide fan-out (~100 active players)
   costs ~100 of those per event, so budget or upgrade accordingly.
2. **`send-notification-email` Edge Function** — deploy via **Dashboard →
   Edge Functions → Deploy a new function → Via Editor**. On each
   `notifications` insert (delivered by the webhook in §3) it should:
   - re-read the notification row with the service role (treat the webhook
     payload as a pointer, so a caller holding only the anon key can't email
     arbitrary content);
   - look up the recipient's **auth email** (`auth.admin.getUserById(user_id)`
     → `user.email`) — the address they log in with is the address that gets
     the mail;
   - check `notification_prefs` for the notification's type and **drop the
     email if that category is toggled off** (the in-app row always stays —
     prefs gate delivery only);
   - send `title` + `body` through the SMTP provider's API.

   Hosted functions automatically get `SUPABASE_URL` and
   `SUPABASE_SERVICE_ROLE_KEY`; keep **Verify JWT** enabled.

> The old `supabase/functions/send-push/index.ts` (Expo push) is retired. If a
> `send-push` function is still deployed on the project, delete it from
> **Dashboard → Edge Functions** once the email function replaces it.

## 3. Create the Database Webhook (Dashboard, one-time)

**Dashboard → Database → Webhooks → Create a new hook:**

| Field | Value |
|---|---|
| Name | `send-email-on-notification` |
| Table | `public.notifications` |
| Events | **Insert** only |
| Type | Supabase Edge Function → `send-notification-email` |
| HTTP Headers | `Authorization: Bearer <anon key>` (the dashboard offers to add this for Edge Function hooks) |

## 4. Verify the DoD

1. **registration_open** — flip a game open (cron, or **Admin · Schedule →
   Open reg**): every active player gets one Alert per game (and one email to
   their sign-in address); no duplicates on later cron ticks.
2. **game_filled** — fill a capacity-2 game: both registrants get "Game full".
3. **spot_opened** — withdraw one player, promote the waitlister: the promoted
   player's Alert + email arrive (row from Phase 3, now delivered + badged live).
4. **needs_players** — with a game <12h out and under `min_players`, run
   `select notify_needs_players();` in the SQL Editor (or wait for cron).
5. **kickoff_reminder** — with a game <3h out:
   `select notify_kickoff_reminders();` → registered players only.
6. **Badge + realtime** — with the app open on the Matchday tab, insert any
   notification for that user: the Alerts tab badge increments without a
   refresh; opening the row marks it read and (if it has a game) opens the game.
7. **Prefs** — toggle "Registration opens" off on Profile, reopen a fresh game:
   the in-app row still appears (prefs gate **email only**, by design) but no
   email is sent for that category.

Debugging: webhook attempts show under **Dashboard → Database → Webhooks**,
and each send under **Dashboard → Edge Functions → send-notification-email →
Logs**.

## Notes / carried forward

- **`results_posted` / `chat_mention`** — the pref toggles, type mapping, and
  send path all exist; the rows start being inserted in phases 5–6.
- **Pref semantics** — preferences suppress the *email*, not the in-app row:
  the Edge Function drops the send if the category is off. `spot_opened`
  deliberately has no pref and always sends.
- **First deploy back-fill** — `notify_registration_open()` scans all currently
  open future games, so the first cron tick after applying 0008 notifies for
  games that were already open. One-time, and arguably useful.
- **Cleanup from the push era** — `profiles.expo_push_token` and
  `lib/push.ts` (token capture) are vestigial under email delivery and can be
  removed in a later pass; they are harmless in the meantime.
