import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { Button, Screen, Subtle } from "@/components/ui";
import { formatKickoff, statusLabel } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { Game, GameStatus } from "@/lib/types";

const TONE_TEXT: Record<"pitch" | "boot" | "mute" | "ink", string> = {
  pitch: "text-pitch",
  boot: "text-boot",
  mute: "text-mute",
  ink: "text-ink",
};

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

  return (
    <Screen>
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
          <ActivityIndicator color="#1F7A46" />
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
            <View className="items-center py-16">
              <Subtle>No upcoming games. Create a series first.</Subtle>
            </View>
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
    <View className="gap-3 rounded-xl border border-line bg-card p-4">
      <Link href={{ pathname: "/game/[id]", params: { id: game.id } }} asChild>
        <Pressable>
          <Text className="font-display text-base uppercase text-ink">
            {game.title}
          </Text>
          <Subtle>{formatKickoff(game.kickoff_at)}</Subtle>
          <Text
            className={`font-display text-xs uppercase ${TONE_TEXT[status.tone]}`}
          >
            {status.label}
          </Text>
        </Pressable>
      </Link>

      {!done ? (
        <View className="flex-row flex-wrap gap-2">
          {game.status === "scheduled" ? (
            <Chip label="Open reg" tone="pitch" disabled={busy} onPress={() => onSetStatus("registration_open")} />
          ) : null}
          {game.status === "registration_open" || game.status === "filled" ? (
            <Chip label="Lock" tone="ink" disabled={busy} onPress={() => onSetStatus("locked")} />
          ) : null}
          <Chip label="Cancel" tone="boot" disabled={busy} onPress={() => onSetStatus("cancelled")} />
        </View>
      ) : null}
    </View>
  );
}

function Chip({
  label,
  tone,
  disabled,
  onPress,
}: {
  label: string;
  tone: "pitch" | "boot" | "ink";
  disabled: boolean;
  onPress: () => void;
}) {
  const bg = tone === "pitch" ? "bg-pitch" : tone === "boot" ? "bg-boot" : "bg-ink";
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      className={`rounded-lg px-3 py-2 ${bg} ${disabled ? "opacity-50" : ""}`}
    >
      <Text className="text-sm font-semibold uppercase tracking-wide text-white">
        {label}
      </Text>
    </Pressable>
  );
}
