import { useRouter } from "expo-router";
import { FlatList, Pressable, Text, View } from "react-native";
import { MarqueeSpinner } from "@/components/motif";
import { EmptyState, Heading, Num, Screen, Subtle } from "@/components/ui";
import { timeAgo } from "@/lib/format";
import {
  useMarkAllRead,
  useMarkRead,
  useNotificationsFeed,
  useUnreadCount,
} from "@/lib/notifications";
import { glow, palette } from "@/lib/theme";
import { AppNotification, NotificationType } from "@/lib/types";

// One dot color per type, on the palette's existing meanings: wonder = open /
// positive, cyclone = full, ferris = the waitlist spark + mentions, luna =
// lamplight (reminders, results). Never text in `cyclone` — dots are fills.
const TYPE_DOT: Record<NotificationType, string> = {
  registration_open: palette.wonder,
  game_filled: palette.cyclone,
  needs_players: palette.cyclone,
  spot_opened: palette.ferris,
  kickoff_reminder: palette.luna,
  roster_posted: palette.luna,
  results_posted: palette.luna,
  chat_mention: palette.ferris,
};

export default function Notifications() {
  const feed = useNotificationsFeed();
  const unread = useUnreadCount();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const router = useRouter();

  const rows: AppNotification[] = feed.data ?? [];

  const open = (n: AppNotification) => {
    if (!n.read) markRead.mutate(n.id);
    if (!n.game_id) return;
    // A posted result opens the match report; everything else opens game detail.
    if (n.type === "results_posted")
      router.push({ pathname: "/report/[id]", params: { id: n.game_id } });
    else router.push(`/game/${n.game_id}`);
  };

  return (
    <Screen>
      <View className="flex-row items-start justify-between pt-1">
        <Heading kicker={unread > 0 && `${unread} unread`}>Alerts</Heading>
        {unread > 0 ? (
          <Pressable
            onPress={() => markAllRead.mutate()}
            disabled={markAllRead.isPending}
            hitSlop={12}
            className="pt-1"
          >
            <Text className="font-display-semi text-xs uppercase tracking-wider text-steel">
              Mark all read
            </Text>
          </Pressable>
        ) : null}
      </View>

      {feed.isLoading ? (
        <View className="flex-1 items-center justify-center">
          <MarqueeSpinner />
        </View>
      ) : feed.isError ? (
        <View className="flex-1 items-center justify-center gap-2 px-6">
          <Subtle>Couldn&apos;t load your alerts.</Subtle>
          <Text className="text-center font-body text-sm text-steel">
            {feed.error instanceof Error ? feed.error.message : String(feed.error)}
          </Text>
        </View>
      ) : (
        <FlatList
          className="pt-2"
          data={rows}
          keyExtractor={(n) => n.id}
          onRefresh={feed.refetch}
          refreshing={feed.isRefetching}
          ListEmptyComponent={
            <EmptyState>
              Nothing yet. Registration windows, filled games, and kickoff
              reminders land here.
            </EmptyState>
          }
          renderItem={({ item }) => <NotificationRow n={item} onPress={open} />}
        />
      )}
    </Screen>
  );
}

function NotificationRow({
  n,
  onPress,
}: {
  n: AppNotification;
  onPress: (n: AppNotification) => void;
}) {
  const dot = TYPE_DOT[n.type] ?? palette.steel;

  return (
    <Pressable
      onPress={() => onPress(n)}
      className={`flex-row gap-3 border-b border-line/40 px-2 py-3.5 ${
        n.read ? "" : "bg-plank/40"
      }`}
    >
      {/* Unread rows get a lit bulb; read rows keep an unlit socket so the
          text column doesn't shift as rows are read. */}
      <View className="w-3 items-center pt-1.5">
        <View
          className="h-2 w-2 rounded-full"
          style={{
            backgroundColor: n.read ? palette.line : dot,
            boxShadow: n.read ? undefined : glow(dot, 0.6),
          }}
        />
      </View>

      <View className="flex-1 gap-0.5">
        <Text
          className={`font-display text-base uppercase tracking-wide ${
            n.read ? "text-steel" : "text-bone"
          }`}
        >
          {n.title}
        </Text>
        {n.body ? (
          <Text
            className={`font-body text-sm ${n.read ? "text-steel/70" : "text-steel"}`}
          >
            {n.body}
          </Text>
        ) : null}
      </View>

      <Num className="pt-1 font-body text-xs text-steel">{timeAgo(n.created_at)}</Num>
    </Pressable>
  );
}
