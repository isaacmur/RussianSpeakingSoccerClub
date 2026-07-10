# Phase 4 — Notifications

Phase 4 is code-complete: the notification fan-out (registration_open,
game_filled, needs_players, kickoff_reminder — spot_opened shipped in Phase 3),
the `send-push` Edge Function, push-token capture in the app, the in-app
**Alerts** center with a live unread tab badge, and the notification-preference
toggles + season stats card on **Profile**.

> **Hosted Supabase** (`xfjrdirhzrajwnvcfsge`), managed through the **web
> dashboard** at https://supabase.com/dashboard — every step below is
> dashboard-only, no CLI required. (CLI equivalents noted where they exist.)

## 1. Apply the migration (SQL Editor)

**Dashboard → SQL Editor → New query** → paste the full contents of
[`supabase/migrations/0008_notifications.sql`](supabase/migrations/0008_notifications.sql)
→ **Run**. It should finish with no errors ("Success. No rows returned").

The file is idempotent-ish in its guarded parts (realtime publication, cron
jobs) but the `create policy` / `create trigger` statements will error if run
twice — if you need to re-run it, drop those first or just fix the one failing
statement.

> CLI alternative: `npx supabase db push`. If you apply it via the SQL Editor,
> the CLI's migration history won't know 0008 was applied — fine if you stay
> dashboard-only; if you ever switch to `db push`, mark it applied with
> `npx supabase migration repair --status applied 0008`.

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

## 2. Deploy the Edge Function (Dashboard editor)

**Dashboard → Edge Functions → Deploy a new function → Via Editor:**

1. Function name: `send-push` (must match exactly — the webhook targets it).
2. Replace the starter code with the full contents of
   [`supabase/functions/send-push/index.ts`](supabase/functions/send-push/index.ts).
3. **Deploy function**.
4. After it deploys, open the function → **Details** and confirm
   **Verify JWT** is **enabled** (it is by default — leave it on).

No secrets to set — hosted functions automatically get `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`.

> CLI alternative: `npx supabase functions deploy send-push`.

## 3. Create the Database Webhook (Dashboard, one-time)

**Dashboard → Database → Webhooks → Create a new hook:**

| Field | Value |
|---|---|
| Name | `send-push-on-notification` |
| Table | `public.notifications` |
| Events | **Insert** only |
| Type | Supabase Edge Function → `send-push` |
| HTTP Headers | `Authorization: Bearer <anon key>` (the dashboard offers to add this for Edge Function hooks) |

The function treats the payload as a pointer and re-reads the row with the
service role, so a caller holding only the anon key can't push arbitrary
content.

## 4. Push on a real device (EAS dev client)

**Remote push does not work in Expo Go (SDK 52 removed it) or on simulators.**
The in-app center, badge, and toggles work everywhere; actual push delivery
needs an app build. The commands below are **Expo/EAS tooling** (run in the
project folder), not the Supabase CLI — building the app has no web-dashboard
equivalent, so this is the one step that stays in the terminal:

1. An Expo/EAS project: `npx eas init` (writes `extra.eas.projectId` into
   `app.json` — `lib/push.ts` silently skips registration until it exists).
2. A dev-client build on a physical device:
   `npx eas build --profile development --platform ios` (or `android`).
3. Sign in as an **active** member → the token request fires on first entry to
   the tabs; accept the permission prompt. Confirm the token landed:
   **Supabase Dashboard → SQL Editor** →
   `select display_name, expo_push_token from profiles;`.

Until then you can still verify the pipeline end-to-end minus the device hop:
webhook logs (Dashboard → Database → Webhooks) and function logs (Dashboard →
Edge Functions → send-push → Logs) show each send attempt, and `no push token`
skips are expected.

Expo's push tester (https://expo.dev/notifications) can send a payload straight
to a captured token to isolate APNs/FCM issues from the webhook chain.

## 5. Verify the DoD

1. **registration_open** — flip a game open (cron, or **Admin · Schedule →
   Open reg**): every active player gets one Alert per game; no duplicates on
   later cron ticks.
2. **game_filled** — fill a capacity-2 game: both registrants get "Game full".
3. **spot_opened** — withdraw one player, promote the waitlister: the promoted
   player's Alert arrives (row from Phase 3, now delivered + badged live).
4. **needs_players** — with a game <12h out and under `min_players`, run
   `select notify_needs_players();` in the SQL Editor (or wait for cron).
5. **kickoff_reminder** — with a game <3h out:
   `select notify_kickoff_reminders();` → registered players only.
6. **Badge + realtime** — with the app open on the Matchday tab, insert any
   notification for that user: the Alerts tab badge increments without a
   refresh; opening the row marks it read and (if it has a game) opens the game.
7. **Prefs** — toggle "Registration opens" off on Profile, reopen a fresh game:
   the in-app row still appears (prefs gate **push only**, by design) but the
   function log shows `pref registration_open off` and no push arrives.

## Notes / carried forward

- **`results_posted` / `chat_mention`** — the pref toggles, type mapping, and
  send path all exist; the rows start being inserted in phases 5–6.
- **Pref semantics** — preferences suppress the *push*, not the in-app row (the
  outline's design: the Edge Function "drops it if the category is off").
  `spot_opened` deliberately has no pref and always sends.
- **First deploy back-fill** — `notify_registration_open()` scans all currently
  open future games, so the first cron tick after applying 0008 notifies for
  games that were already open. One-time, and arguably useful.
- **Dead tokens** — Expo `DeviceNotRegistered` receipts clear
  `profiles.expo_push_token` automatically.
