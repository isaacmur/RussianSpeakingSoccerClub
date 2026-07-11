import Feather from "@expo/vector-icons/Feather";
import { useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { MarqueeSpinner } from "@/components/motif";
import { EmptyState, Heading, Num, Screen, Subtle } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import {
  useActiveMembers,
  useChannels,
  useMessages,
  useMessagesChannel,
  useSendMessage,
} from "@/lib/chat";
import {
  applyMention,
  matchLabel,
  splitMentions,
  timeAgo,
  trailingMentionQuery,
} from "@/lib/format";
import { palette } from "@/lib/theme";
import { ChannelWithGame, MemberRef, MessageWithAuthor } from "@/lib/types";

// Game channels for games long past aren't worth a pill. Keep the league
// channel always, plus game channels whose kickoff is upcoming or recent.
const RECENT_WINDOW_MS = 10 * 24 * 60 * 60 * 1000; // 10 days

function orderChannels(channels: ChannelWithGame[]): ChannelWithGame[] {
  const league = channels.filter((c) => c.kind === "league");
  const now = Date.now();
  const games = channels
    .filter(
      (c) =>
        c.kind === "game" &&
        c.games &&
        c.games.status !== "cancelled" &&
        now - new Date(c.games.kickoff_at).getTime() < RECENT_WINDOW_MS
    )
    // Soonest/most-recent first.
    .sort(
      (a, b) =>
        Math.abs(new Date(a.games!.kickoff_at).getTime() - now) -
        Math.abs(new Date(b.games!.kickoff_at).getTime() - now)
    );
  return [...league, ...games];
}

const channelLabel = (c: ChannelWithGame): string =>
  c.kind === "league"
    ? c.name ?? "Clubhouse"
    : c.games?.kickoff_at
      ? matchLabel(c.games.kickoff_at)
      : c.name ?? "Game";

export default function Chat() {
  const { profile } = useAuth();
  const channelsQ = useChannels();
  const membersQ = useActiveMembers();

  const channels = useMemo(
    () => orderChannels(channelsQ.data ?? []),
    [channelsQ.data]
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Default to the league channel once channels resolve.
  const activeId =
    selectedId && channels.some((c) => c.id === selectedId)
      ? selectedId
      : channels[0]?.id ?? null;
  const active = channels.find((c) => c.id === activeId) ?? null;

  const messagesQ = useMessages(activeId);
  useMessagesChannel(activeId);
  const send = useSendMessage(activeId);

  const members: MemberRef[] = membersQ.data ?? [];
  const memberNames = useMemo(
    () => members.map((m) => m.display_name),
    [members]
  );

  const [text, setText] = useState("");
  const query = trailingMentionQuery(text);
  const suggestions: MemberRef[] =
    query !== null
      ? members
          .filter(
            (m) =>
              m.id !== profile?.id &&
              m.display_name.toLowerCase().includes(query.toLowerCase())
          )
          .slice(0, 5)
      : [];

  const submit = () => {
    const body = text.trim();
    if (!body || send.isPending) return;
    setText("");
    send.mutate(body, { onError: () => setText(body) });
  };

  const rows: MessageWithAuthor[] = messagesQ.data ?? [];

  return (
    <Screen>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
      >
        <View className="pt-1">
          <Heading kicker={active ? channelLabel(active) : "League chat"}>
            Clubhouse
          </Heading>
        </View>

        {/* Channel switcher: Clubhouse + a pill per live/recent game. */}
        {channels.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            className="flex-grow-0"
            contentContainerClassName="items-center gap-2 py-2 pr-4"
          >
            {channels.map((c) => (
              <ChannelPill
                key={c.id}
                label={channelLabel(c)}
                icon={c.kind === "league" ? "message-square" : "calendar"}
                active={c.id === activeId}
                onPress={() => setSelectedId(c.id)}
              />
            ))}
          </ScrollView>
        ) : null}

        {messagesQ.isLoading ? (
          <View className="flex-1 items-center justify-center">
            <MarqueeSpinner />
          </View>
        ) : (
          <FlatList
            className="flex-1"
            data={rows}
            inverted
            keyExtractor={(m) => m.id}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            contentContainerClassName="gap-2 py-3"
            ListEmptyComponent={
              // The list is inverted, so its empty component renders upside
              // down — flip it back. (scaleY via style: NativeWind's transform
              // utilities silently no-op in RN, see <Num> in components/ui.)
              <View className="mt-24" style={{ transform: [{ scaleY: -1 }] }}>
                <EmptyState>
                  No messages yet. Say hello — the whole club sees this channel.
                </EmptyState>
              </View>
            }
            renderItem={({ item }) => (
              <MessageRow
                m={item}
                mine={item.user_id === profile?.id}
                names={memberNames}
              />
            )}
          />
        )}

        {/* Mention autocomplete: sits directly above the composer. */}
        {suggestions.length > 0 ? (
          <View className="rounded-xl border border-line bg-plank">
            {suggestions.map((s, i) => (
              <Pressable
                key={s.id}
                onPress={() => setText(applyMention(text, s.display_name))}
                className={`flex-row items-center gap-2 px-3 py-2.5 ${
                  i > 0 ? "border-t border-line/50" : ""
                }`}
              >
                <Feather name="at-sign" size={13} color={palette.ferris} />
                <Text className="font-body text-sm text-bone">{s.display_name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        <Composer
          text={text}
          onChangeText={setText}
          onSubmit={submit}
          sending={send.isPending}
        />
      </KeyboardAvoidingView>
    </Screen>
  );
}

// ── Channel pill ────────────────────────────────────────────────────────────
function ChannelPill({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`h-9 flex-row items-center gap-1.5 rounded-full border px-3 ${
        active ? "border-bone bg-bone" : "border-line bg-plank"
      }`}
    >
      <Feather name={icon} size={12} color={active ? palette.night : palette.steel} />
      <Text
        className={`font-display-semi text-xs uppercase tracking-wider ${
          active ? "text-night" : "text-steel"
        }`}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ── Message row ─────────────────────────────────────────────────────────────
// Own lines burn wonder and hug the right; everyone else sits on plank at the
// left with their name above. Mentions of real members glow inside the bubble.
function MessageRow({
  m,
  mine,
  names,
}: {
  m: MessageWithAuthor;
  mine: boolean;
  names: string[];
}) {
  const segments = splitMentions(m.body, names);

  return (
    <View className={mine ? "items-end" : "items-start"}>
      {!mine ? (
        <Text className="px-1 pb-0.5 font-display-semi text-[11px] uppercase tracking-wider text-steel">
          {m.profiles?.display_name ?? "Player"}
        </Text>
      ) : null}

      <View
        className={`max-w-[82%] rounded-2xl px-3 py-2 ${
          mine ? "bg-wonder" : "border border-line bg-plank"
        }`}
      >
        <Text className={`font-body text-[15px] ${mine ? "text-night" : "text-bone"}`}>
          {segments.map((s, i) =>
            s.mention ? (
              <Text
                key={i}
                className={
                  mine ? "font-body-semi" : "font-body-semi text-wonder"
                }
              >
                {s.text}
              </Text>
            ) : (
              s.text
            )
          )}
        </Text>
      </View>

      <Num
        className={`px-1 pt-0.5 font-body text-[10px] text-steel ${
          mine ? "text-right" : ""
        }`}
      >
        {timeAgo(m.created_at)}
      </Num>
    </View>
  );
}

// ── Composer ────────────────────────────────────────────────────────────────
function Composer({
  text,
  onChangeText,
  onSubmit,
  sending,
}: {
  text: string;
  onChangeText: (t: string) => void;
  onSubmit: () => void;
  sending: boolean;
}) {
  const canSend = text.trim().length > 0 && !sending;
  return (
    <View className="flex-row items-end gap-2 border-t border-line/60 py-2">
      <TextInput
        className="max-h-28 min-h-11 flex-1 rounded-2xl border border-line bg-plank px-3 py-2.5 font-body text-base text-bone"
        placeholder="Message the club…"
        placeholderTextColor={palette.steel}
        value={text}
        onChangeText={onChangeText}
        multiline
      />
      <Pressable
        onPress={onSubmit}
        disabled={!canSend}
        className={`h-11 w-11 items-center justify-center rounded-full ${
          canSend ? "bg-wonder" : "border border-line bg-plank"
        }`}
      >
        <Feather
          name="arrow-up"
          size={20}
          color={canSend ? palette.night : palette.steel}
        />
      </Pressable>
    </View>
  );
}
