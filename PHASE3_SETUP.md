# Phase 3 — Games & Registration

Phase 3 is code-complete: scheduling + registration RLS, automatic
waitlisting, waitlist promotion with a `spot_opened` notification, the
materialize/open/lock scheduling functions (+ pg_cron wiring), the game-detail
screen with a live signup list, and the admin **Series** and **Schedule**
screens.

> **Hosted Supabase** (`xfjrdirhzrajwnvcfsge`), managed through the **web
> dashboard**. See PHASE1_SETUP.md for the migration workflow + the
> disable-email-confirmation step.

## 1. Apply the migrations (SQL Editor)

**Dashboard → SQL Editor → New query** → paste and **Run**, in order:
`0005_games_registrations_rls.sql`, `0006_registration_logic.sql`,
`0007_scheduling.sql` (all in `supabase/migrations/`).

- `0005_games_registrations_rls.sql` — RLS for `game_series` / `games` /
  `registrations`, a `(series_id, kickoff_at)` uniqueness constraint, and adds
  `registrations` to the `supabase_realtime` publication.
- `0006_registration_logic.sql` — `assign_registration_slot` (auto-waitlist on a
  full game) and `promote_waitlist` (promote earliest waitlister + insert a
  `spot_opened` notification) triggers.
- `0007_scheduling.sql` — `materialize_games()`, `open_registrations()`,
  `lock_games()`, and a guarded pg_cron schedule block.

## 2. Enable pg_cron (hosted, one-time)

`pg_cron` isn't enabled by default. **Dashboard → Database → Extensions →
search "pg_cron" → enable.** Then re-run the scheduling `DO` block from
`0007_scheduling.sql` in the SQL Editor so the three jobs register:

| Job | Cadence | Effect |
|---|---|---|
| `materialize-games` | nightly 02:00 UTC | create next 4 weeks of games from active series |
| `open-registrations` | every 5 min | `scheduled → registration_open` at open time |
| `lock-games` | every 5 min | `→ locked` at kickoff |

Verify: `select * from cron.job;` in the SQL Editor.

> Until pg_cron is enabled, you can drive everything manually: the admin
> **Schedule** screen's "Generate games from series" button calls
> `materialize_games()`, and materialization already opens registration
> immediately for any game whose open time has passed. `select open_registrations();`
> / `select lock_games();` also work by hand in the SQL Editor.

## 3. Verify the DoD

1. As admin: **Profile → Admin · Series**, create a series (e.g. Saturday,
   10:00, capacity **2** for easy testing) → games generate.
2. **Admin · Schedule** shows the game; if its window is open it's already
   `registration_open` (else tap **Open reg**).
3. As two members (two devices/simulators), open the game from **Matchday**:
   - Member A registers → appears under Registered, live on both screens.
   - Fill to capacity, then Member B registers → lands on the **Waitlist**.
   - Member A withdraws → Member B is auto-promoted to Registered (watch it
     update live via Realtime) and gets a `spot_opened` row in `notifications`.

**Inspect in the SQL Editor:**

```sql
select status, count(*) from registrations where game_id = '<id>' group by status;
select * from notifications where type = 'spot_opened' order by created_at desc;
```

## Notes / carried forward

- **Notification *delivery*** (email to the user's Supabase Auth address +
  in-app center + badge) is Phase 4. Phase 3
  only *inserts* the `spot_opened` row; `open_registrations` deliberately does
  not enqueue `registration_open` notifications yet (added in Phase 4 with a
  dedupe guard).
- **Game status `filled`** is intentionally not auto-set — a full game stays
  `registration_open` so late signups still flow to the waitlist via the trigger;
  the UI shows "Full" from the registered count. Admins can still Lock/Cancel.
- One-off (non-series) games: schema supports them (`series_id` null), but the
  admin UI currently creates games only via series materialization.
