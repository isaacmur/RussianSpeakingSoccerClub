import { useQuery } from "@tanstack/react-query";
import { Link, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { MarqueeSpinner } from "@/components/motif";
import { Card, EmptyState, Heading, Num, Screen, StatusChip, Subtle } from "@/components/ui";
import { formatKickoff, statusLabel } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { Game } from "@/lib/types";

export default function Matchday() {
  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["matchday"],
    queryFn: async (): Promise<Game[]> => {
      const since = new Date(Date.now() - 6 * 3600_000).toISOString();
      const { data, error } = await supabase
        .from("games")
        .select("*")
        .gte("kickoff_at", since)
        .not("status", "in", "(draft,cancelled)")
        .order("kickoff_at", { ascending: true });
      if (error) throw error;
      return data as Game[];
    },
  });

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch])
  );

  return (
    <Screen>
      <View className="pt-1">
        <Heading kicker="Kaiser Park · Brooklyn">Matchday</Heading>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <MarqueeSpinner />
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(g) => g.id}
          onRefresh={refetch}
          refreshing={isRefetching}
          ItemSeparatorComponent={() => <View className="h-3" />}
          contentContainerClassName="py-4"
          ListEmptyComponent={<EmptyState>No upcoming games yet.</EmptyState>}
          renderItem={({ item }) => <GameCard game={item} />}
        />
      )}
    </Screen>
  );
}

function GameCard({ game }: { game: Game }) {
  const status = statusLabel(game.status);
  // Completed games open their match report; everything else opens game detail
  // (capacity meter, register/waitlist, team sheet).
  const href =
    game.status === "completed"
      ? { pathname: "/report/[id]" as const, params: { id: game.id } }
      : { pathname: "/game/[id]" as const, params: { id: game.id } };
  return (
    <Link href={href} asChild>
      {/* No <Neon> here: this renders per-row, and a real two-layer shadow on
          every FlatList item stalls scrolling on mid-range Android. The lit
          StatusChip dot carries the state instead. */}
      <Pressable>
        <Card className="gap-2 p-4">
          <View className="flex-row items-center justify-between">
            <Text className="flex-1 font-display text-lg uppercase text-bone" numberOfLines={1}>
              {game.title}
            </Text>
            <StatusChip label={status.label} tone={status.tone} />
          </View>

          <Num className="font-body text-sm text-steel">{formatKickoff(game.kickoff_at)}</Num>

          {game.location ? (
            <View className="flex-row items-center gap-1.5">
              <View className="h-1 w-1 rounded-full bg-line" />
              <Subtle>{game.location}</Subtle>
            </View>
          ) : null}
        </Card>
      </Pressable>
    </Link>
  );
}
