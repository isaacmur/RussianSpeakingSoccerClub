import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Stack, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { MarqueeSpinner } from "@/components/motif";
import { BackButton, Card, EmptyState, Heading, Num, Screen, Subtle } from "@/components/ui";
import { formatKickoff, matchLabel } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { LeaderboardRow, PlayerMatchHistoryEntry } from "@/lib/types";

// A tapped-through leaderboard row: one player's completed matches this season.
// Reads get_player_match_history() (definer, gated by can_view_reports); the
// season record in the kicker is read from the ["leaderboard"] cache the row was
// tapped from, so no extra fetch — it degrades gracefully if the cache is cold.
export default function PlayerHistory() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const qc = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["player-history", id],
    queryFn: async (): Promise<PlayerMatchHistoryEntry[]> => {
      const { data, error } = await supabase.rpc("get_player_match_history", {
        p_user_id: id,
      });
      if (error) throw error;
      return (data ?? []) as PlayerMatchHistoryEntry[];
    },
  });

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch])
  );

  // Season record from the leaderboard cache — the authoritative line (it folds
  // in manually-entered baselines the app-recorded history below can't show).
  const board = qc.getQueryData<LeaderboardRow[]>(["leaderboard"]);
  const stats = board?.find((r) => r.user_id === id);
  const kicker = stats
    ? `${stats.wins}-${stats.draws}-${stats.losses} · ${stats.goals} ${
        stats.goals === 1 ? "goal" : "goals"
      }`
    : "2026 Season";

  const title = stats?.display_name ?? name ?? "Player";

  return (
    <Screen>
      <Stack.Screen options={{ title }} />
      <BackButton />
      <View className="pt-1">
        <Heading kicker={kicker}>{title}</Heading>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <MarqueeSpinner />
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(m) => m.game_id}
          onRefresh={refetch}
          refreshing={isRefetching}
          ItemSeparatorComponent={() => <View className="h-3" />}
          contentContainerClassName="py-4"
          ListEmptyComponent={
            <EmptyState>No completed matches yet this season.</EmptyState>
          }
          renderItem={({ item }) => <HistoryCard match={item} />}
        />
      )}
    </Screen>
  );
}

const OUTCOME: Record<
  PlayerMatchHistoryEntry["outcome"],
  { label: string; text: string; bg: string }
> = {
  win: { label: "W", text: "text-wonder", bg: "bg-wonder/10" },
  draw: { label: "D", text: "text-steel", bg: "bg-steel/10" },
  loss: { label: "L", text: "text-cyclone-lit", bg: "bg-cyclone-lit/10" },
};

// One match in the history: the outcome from this player's side, the scoreline,
// the date, and their goals. Taps through to the full shared report.
function HistoryCard({ match }: { match: PlayerMatchHistoryEntry }) {
  const o = OUTCOME[match.outcome];
  return (
    <Link
      href={{ pathname: "/report/[id]", params: { id: match.game_id } }}
      asChild
    >
      <Pressable>
        <Card className="gap-2 p-4">
          <View className="flex-row items-center gap-3">
            <View className={`h-8 w-8 items-center justify-center rounded-full ${o.bg}`}>
              <Text className={`font-display text-base ${o.text}`}>{o.label}</Text>
            </View>
            <Text
              className="flex-1 font-display text-lg uppercase text-bone"
              numberOfLines={1}
            >
              {matchLabel(match.kickoff_at)}
            </Text>
            <View className="flex-row items-baseline gap-1.5 pl-2">
              <Num className="font-display text-xl text-bone">{match.team_a_score}</Num>
              <Text className="font-display text-base text-steel">–</Text>
              <Num className="font-display text-xl text-bone">{match.team_b_score}</Num>
            </View>
          </View>
          <View className="flex-row items-center justify-between">
            <Num className="font-body text-sm text-steel">
              {formatKickoff(match.kickoff_at)}
            </Num>
            {match.goals > 0 ? (
              <Text className="font-body-semi text-sm text-luna">
                {match.goals} {match.goals === 1 ? "goal" : "goals"}
              </Text>
            ) : null}
          </View>
        </Card>
      </Pressable>
    </Link>
  );
}
