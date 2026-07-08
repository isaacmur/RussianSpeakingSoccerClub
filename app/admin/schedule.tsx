import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Alert, FlatList, Pressable, Text, View } from "react-native";
import { MarqueeSpinner } from "@/components/motif";
import {
  ActionChip,
  Button,
  Card,
  EmptyState,
  Heading,
  Num,
  Screen,
  StatusChip,
} from "@/components/ui";
import { formatKickoff, statusLabel } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { Game, GameStatus } from "@/lib/types";

export default function AdminSchedule() {
  const qc = useQueryClient();

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["admin-schedule"],
    queryFn: async (): Promise<Game[]> => {
      // Upcoming + very recent games; hide the deep past.
      const since = new Date(Date.now() - 12 * 3600_000).toISOString();
      const { data, error } = await supabase
        .from("games")
        .select("*")
        .gte("kickoff_at", since)
        .order("kickoff_at", { ascending: true });
      if (error) throw error;
      return data as Game[];
    },
  });

  const materialize = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("materialize_games");
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-schedule"] });
      qc.invalidateQueries({ queryKey: ["matchday"] });
    },
    onError: (e: unknown) =>
      Alert.alert("Failed", e instanceof Error ? e.message : String(e)),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: GameStatus }) => {
      const { error } = await supabase.from("games").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-schedule"] });
      qc.invalidateQueries({ queryKey: ["matchday"] });
    },
    onError: (e: unknown) =>
      Alert.alert("Update failed", e instanceof Error ? e.message : String(e)),
  });

  const count = data?.length ?? 0;

  return (
    <Screen>
      <View className="pt-1">
        <Heading kicker={count > 0 ? `${count} upcoming` : "Admin"}>Schedule</Heading>
      </View>

      <View className="py-3">
        <Button
          title="Generate games from series"
          variant="ghost"
          loading={materialize.isPending}
          onPress={() => materialize.mutate()}
        />
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
          contentContainerClassName="pb-8"
          ListEmptyComponent={
            <EmptyState>No upcoming games. Create a series first.</EmptyState>
          }
          renderItem={({ item }) => (
            <GameAdminRow
              game={item}
              busy={setStatus.isPending}
              onSetStatus={(status) => setStatus.mutate({ id: item.id, status })}
            />
          )}
        />
      )}
    </Screen>
  );
}

function GameAdminRow({
  game,
  busy,
  onSetStatus,
}: {
  game: Game;
  busy: boolean;
  onSetStatus: (status: GameStatus) => void;
}) {
  const status = statusLabel(game.status);
  const done = game.status === "completed" || game.status === "cancelled";

  return (
    <Card className="gap-3 p-4">
      <Link href={{ pathname: "/game/[id]", params: { id: game.id } }} asChild>
        <Pressable className="gap-1">
          <Text className="font-display text-base uppercase text-bone">
            {game.title}
          </Text>
          <Num className="font-body text-sm text-steel">
            {formatKickoff(game.kickoff_at)}
          </Num>
          <StatusChip label={status.label} tone={status.tone} />
        </Pressable>
      </Link>

      {!done ? (
        <View className="flex-row flex-wrap gap-2">
          {game.status === "scheduled" ? (
            <ActionChip
              label="Open reg"
              tone="go"
              disabled={busy}
              onPress={() => onSetStatus("registration_open")}
            />
          ) : null}
          {game.status === "registration_open" || game.status === "filled" ? (
            <ActionChip label="Lock" disabled={busy} onPress={() => onSetStatus("locked")} />
          ) : null}
          <ActionChip
            label="Cancel"
            tone="danger"
            disabled={busy}
            onPress={() => onSetStatus("cancelled")}
          />
        </View>
      ) : null}
    </Card>
  );
}
