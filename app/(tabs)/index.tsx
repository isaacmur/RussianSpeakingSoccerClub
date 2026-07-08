import { useQuery } from "@tanstack/react-query";
import { Link, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { Heading, Screen, Subtle } from "@/components/ui";
import { formatKickoff, statusLabel } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { Game } from "@/lib/types";

const TONE_TEXT: Record<"pitch" | "boot" | "mute" | "ink", string> = {
  pitch: "text-pitch",
  boot: "text-boot",
  mute: "text-mute",
  ink: "text-ink",
};

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
        <Heading>Matchday</Heading>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#1F7A46" />
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(g) => g.id}
          onRefresh={refetch}
          refreshing={isRefetching}
          ItemSeparatorComponent={() => <View className="h-3" />}
          contentContainerClassName="py-4"
          ListEmptyComponent={
            <View className="items-center py-16">
              <Subtle>No upcoming games yet.</Subtle>
            </View>
          }
          renderItem={({ item }) => <GameCard game={item} />}
        />
      )}
    </Screen>
  );
}

function GameCard({ game }: { game: Game }) {
  const status = statusLabel(game.status);
  return (
    <Link href={{ pathname: "/game/[id]", params: { id: game.id } }} asChild>
      <Pressable className="gap-1 rounded-xl border border-line bg-card p-4">
        <View className="flex-row items-center justify-between">
          <Text className="font-display text-lg uppercase text-ink">
            {game.title}
          </Text>
          <Text className={`font-display text-xs uppercase ${TONE_TEXT[status.tone]}`}>
            {status.label}
          </Text>
        </View>
        <Subtle>{formatKickoff(game.kickoff_at)}</Subtle>
        {game.location ? <Subtle>{game.location}</Subtle> : null}
      </Pressable>
    </Link>
  );
}
