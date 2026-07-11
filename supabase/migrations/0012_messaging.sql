-- 0012_messaging.sql
-- Phase 6: Messaging.
--
--   * RLS for channels / messages — active members read + post; admins manage.
--   * One league-wide "Clubhouse" channel (seeded) + one channel per game,
--     created by an AFTER-INSERT trigger on games so both materialized and
--     one-off games get a channel with no extra client call. Backfilled for
--     games that already exist.
--   * post_message() — SECURITY DEFINER RPC that writes the message AND fans out
--     chat_mention notifications server-side. Notifications are definer-only
--     inserts (see 0008), so mention delivery has to live here, not on the
--     client. Parsing @mentions in SQL is also the source of truth: a client
--     can't spoof who got mentioned.
--   * messages added to the realtime publication so the chat scrolls live.

-- ============================================================
-- Uniqueness: exactly one league channel, at most one channel per game.
-- Partial unique indexes make the seed + per-game trigger idempotent.
-- ============================================================
create unique index if not exists channels_one_league
  on channels (kind) where kind = 'league';
create unique index if not exists channels_one_per_game
  on channels (game_id) where game_id is not null;

-- ============================================================
-- RLS
--   channels: any active member reads. Rows are created by the seed + the
--     per-game trigger (definer), so there's no member insert path; admins get
--     full access for renames / cleanup.
--   messages: active members read the whole channel and post as themselves;
--     an author may delete their own line; admins can moderate anything.
-- ============================================================
drop policy if exists ch_member_read on channels;
create policy ch_member_read on channels
  for select using (is_active_member());

drop policy if exists ch_admin_write on channels;
create policy ch_admin_write on channels
  for all using (is_admin()) with check (is_admin());

drop policy if exists m_member_read on messages;
create policy m_member_read on messages
  for select using (is_active_member());

drop policy if exists m_insert_own on messages;
create policy m_insert_own on messages
  for insert with check (user_id = auth.uid() and is_active_member());

drop policy if exists m_delete_own on messages;
create policy m_delete_own on messages
  for delete using (user_id = auth.uid());

drop policy if exists m_admin_all on messages;
create policy m_admin_all on messages
  for all using (is_admin()) with check (is_admin());

-- ============================================================
-- League channel (idempotent — guarded by the partial unique index, but the
-- not-exists keeps it explicit).
-- ============================================================
insert into channels (kind, name)
select 'league', 'Clubhouse'
where not exists (select 1 from channels where kind = 'league');

-- ============================================================
-- One channel per game, on insert (covers materialize_games() and one-off
-- admin games alike). SECURITY DEFINER so it runs under the game's inserter
-- (admin or the cron-context materializer) without a channels insert policy.
-- ============================================================
create or replace function create_game_channel() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into channels (kind, game_id, name)
  values ('game', new.id, new.title)
  on conflict (game_id) where game_id is not null do nothing;
  return new;
end $$;

drop trigger if exists trg_create_game_channel on games;
create trigger trg_create_game_channel
  after insert on games
  for each row execute function create_game_channel();

-- Backfill channels for games that predate this migration.
insert into channels (kind, game_id, name)
select 'game', g.id, g.title
from games g
where not exists (select 1 from channels c where c.game_id = g.id);

-- ============================================================
-- post_message — insert a line and fan out @mentions.
--
-- Any active member (other than the author) whose display name appears after an
-- '@' in the body gets a chat_mention notification (the in-app row always
-- appears; the email honours the chat_mentions pref in send-notification-email).
-- The notification's game_id points at the game for a game channel, null for the
-- league channel; the Alerts screen routes chat_mention straight to Clubhouse.
--
-- Match is a case-insensitive substring of '@' || display_name, so names with
-- spaces ("@John Smith") work. A shorter name that is a prefix of a longer one
-- ("Sam" vs "Sammy") can over-match — acceptable in a small private club.
-- ============================================================
create or replace function post_message(p_channel_id uuid, p_body text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  msg_id uuid;
  clean text := btrim(coalesce(p_body, ''));
  ch_game uuid;
  ch_name text;
  sender_name text;
begin
  if not is_active_member() then
    raise exception 'active members only';
  end if;
  if clean = '' then
    raise exception 'empty message';
  end if;
  if not exists (select 1 from channels where id = p_channel_id) then
    raise exception 'no such channel';
  end if;

  insert into messages (channel_id, user_id, body)
  values (p_channel_id, auth.uid(), clean)
  returning id into msg_id;

  select display_name into sender_name from profiles where id = auth.uid();
  select game_id, name into ch_game, ch_name from channels where id = p_channel_id;

  insert into notifications (user_id, type, title, body, game_id)
  select p.id, 'chat_mention',
         coalesce(sender_name, 'Someone') || ' mentioned you',
         '#' || coalesce(ch_name, 'chat') || ': ' || left(clean, 140),
         ch_game
  from profiles p
  where p.status = 'active'
    and p.id <> auth.uid()
    and position(lower('@' || p.display_name) in lower(clean)) > 0;

  return msg_id;
end $$;

revoke all on function post_message(uuid, text) from public;
grant execute on function post_message(uuid, text) to authenticated;

-- ============================================================
-- Realtime: the Clubhouse screen subscribes to messages filtered by channel_id.
-- postgres_changes respects RLS, so members only receive rows they may read.
-- ============================================================
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table messages;
  end if;
end $$;
