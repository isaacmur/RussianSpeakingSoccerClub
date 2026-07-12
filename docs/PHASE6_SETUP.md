# Phase 6 — Messaging

Phase 6 is code-complete: the **Clubhouse** chat tab (a league-wide channel plus
one channel per live/recent game), live message delivery over Realtime, and
`@mention` → `chat_mention` notifications — the last unwired notification type
now flows.

> **Hosted Supabase** (`xfjrdirhzrajwnvcfsge`), managed through the **web
> dashboard**. See PHASE1_SETUP.md for the migration workflow.

## 1. Apply the migration (SQL Editor)

**Dashboard → SQL Editor → New query** → paste the full contents of
[`supabase/migrations/0012_messaging.sql`](supabase/migrations/0012_messaging.sql)
→ **Run**. It should finish with no errors.

`0012_messaging.sql` —

- **Uniqueness:** partial unique indexes for *one* league channel and *at most
  one* channel per game, so the seed and the per-game trigger are idempotent.
- **RLS** for `channels` / `messages`: active members read every channel and
  post as themselves; a message author may delete their own line; admins manage
  anything. Channels are created only by the seed + the trigger (definer), so
  there is no member insert path on `channels`.
- **League channel** — seeds one `kind='league'` "Clubhouse" channel.
- **`create_game_channel()`** — AFTER-INSERT trigger on `games` that makes a
  `kind='game'` channel per game (so both `materialize_games()` output and
  one-off admin games get one), plus a one-time backfill for existing games.
- **`post_message(channel_id, body)`** — the send path, `SECURITY DEFINER`. It
  inserts the message and, in the same call, fans out one `chat_mention`
  notification to every **active** member (other than the author) whose display
  name appears after an `@` in the body. Notifications are definer-only inserts
  (see 0008), so the mention fan-out has to live server-side — the client can't
  insert them, and can't spoof who was mentioned.
- **Realtime** — adds `messages` to the `supabase_realtime` publication;
  `postgres_changes` respects RLS, so a client only receives channels it may
  read.

The `create policy` statements are each paired with a `drop policy if exists`,
so a clean re-run is fine.

## 2. Verify the DoD

1. As an active member, open the **Clubhouse** tab. The **Clubhouse** (league)
   channel is selected by default; a pill per upcoming/recent game sits beside
   it — tap to switch channels.
2. Send a message. It appears immediately, right-aligned in `wonder`.
3. On a **second device/session** (another active member), the message arrives
   **live** — no refresh. Reply; it lands on the first device the same way.
4. Type `@` and part of a member's name → an autocomplete bar appears above the
   composer; tap to insert the full `@Name`. Send it.
5. The mentioned member gets a **chat_mention** Alert (badge + row) and, unless
   they toggled **Chat mentions** off on Profile, an **email** to their sign-in
   address. Tapping the Alert opens **Clubhouse**.

**Inspect in the SQL Editor:**

```sql
select id, kind, name, game_id from channels order by kind;
select body, created_at from messages
  where channel_id = (select id from channels where kind='league')
  order by created_at desc limit 10;
-- a mention you just sent should have produced rows here:
select user_id, title, body from notifications where type='chat_mention'
  order by created_at desc limit 10;
```

## Notes / carried forward

- **Mention matching** is a case-insensitive substring of `@` + `display_name`,
  so names with spaces (`@John Smith`) work. A name that is a prefix of another
  (`Sam` vs `Sammy`) can over-match; acceptable in a small private club. The
  composer's autocomplete inserts the exact display name, so intentional
  mentions always resolve.
- **Delivery reuses Phase 4** — `send-notification-email` already maps
  `chat_mention` → the `chat_mentions` pref column and sends only to `active`
  recipients, so this phase just starts inserting the rows. Report **viewers**
  are not active members: they have no chat access and receive no mentions.
- **Channel scope** — every game gets a channel in the DB, but the Clubhouse
  switcher only surfaces the league channel plus game channels whose kickoff is
  within a ~10-day window and not cancelled, so stale games don't pile up.
- **`chat_mention` was the last unwired notification type.** With Phase 6 the
  full taxonomy from the outline is live.
