import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import { Button, Screen, Subtle } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatKickoff, statusLabel } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { Game, RegistrationWithName } from "@/lib/types";

// Literal classes so NativeWind's compiler keeps them (dynamic `text-${tone}`
// would be purged).
const TONE_TEXT: Record<"pitch" | "boot" | "mute" | "ink", string> = {
  pitch: "text-pitch",
  boot: "text-boot",
  mute: "text-mute",
  ink: "text-ink",
};

export default function GameDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const qc = useQueryClient();

  const gameQ = useQuery({
    queryKey: ["game", id],
    queryFn: async (): Promise<Game> => {
      const { data, error } = await supabase
        .from("games")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data as Game;
    },
  });

  const regsQ = useQuery({
    queryKey: ["game-regs", id],
    queryFn: async (): Promise<RegistrationWithName[]> => {
      const { data, error } = await supabase
        .from("registrations")
        .select("*, profiles(display_name)")
        .eq("game_id", id)
        .neq("status", "withdrawn")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as RegistrationWithName[];
    },
  });

  // Live signup list: any registration change for this game refetches the list
  // (and the game row, whose status may flip to filled/locked).
  useEffect(() => {
    const channel = supabase
      .channel(`game-regs-${id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "registrations",
          filter: `game_id=eq.${id}`,
        },
        () => {
          qc.invalidateQueries({ queryKey: ["game-regs", id] });
          qc.invalidateQueries({ queryKey: ["game", id] });
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [id, qc]);

  const mutate = useMutation({
    mutationFn: async (next: "join" | "leave") => {
      if (next === "join") {
        // Upsert to 'registered'; a BEFORE trigger demotes to waitlist if full.
        const { error } = await supabase
          .from("registrations")
          .upsert(
            { game_id: id, user_id: profile!.id, status: "registered" },
            { onConflict: "game_id,user_id" }
          );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("registrations")
          .update({ status: "withdrawn" })
          .eq("game_id", id)
          .eq("user_id", profile!.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["game-regs", id] });
      qc.invalidateQueries({ queryKey: ["game", id] });
    },
    onError: (e: unknown) =>
      Alert.alert("Couldn't update", e instanceof Error ? e.message : String(e)),
  });

  if (gameQ.isLoading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Game" }} />
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#1F7A46" />
        </View>
      </Screen>
    );
  }

  if (gameQ.isError || !gameQ.data) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Game" }} />
        <View className="flex-1 items-center justify-center">
          <Subtle>This game couldn&apos;t be loaded.</Subtle>
        </View>
      </Screen>
    );
  }

  const game = gameQ.data;
  const regs: RegistrationWithName[] = regsQ.data ?? [];
  const registered = regs.filter((r) => r.status === "registered");
  const waitlist = regs.filter((r) => r.status === "waitlist");
  const mine = regs.find((r) => r.user_id === profile?.id) ?? null;

  const spotsLeft = Math.max(0, game.capacity - registered.length);
  const beforeKickoff = new Date(game.kickoff_at).getTime() > Date.now();
  const canModify =
    beforeKickoff &&
    (game.status === "registration_open" || game.status === "filled");
  const status = statusLabel(game.status);
  const myWaitlistPos =
    mine?.status === "waitlist"
      ? waitlist.findIndex((r) => r.id === mine.id) + 1
      : 0;

  return (
    <Screen>
      <Stack.Screen options={{ title: game.title }} />
      <ScrollView contentContainerClassName="gap-5 py-4">
        {/* Header */}
        <View className="gap-1">
          <Text className="font-display text-3xl uppercase text-ink">
            {game.title}
          </Text>
          <Subtle>{formatKickoff(game.kickoff_at)}</Subtle>
          {game.location ? <Subtle>{game.location}</Subtle> : null}
          <Text
            className={`font-display text-sm uppercase ${TONE_TEXT[status.tone]}`}
          >
            {status.label}
          </Text>
        </View>

        {/* Capacity meter */}
        <View className="gap-2 rounded-xl border border-line bg-card p-4">
          <View className="flex-row items-center justify-between">
            <Text className="font-display text-lg uppercase text-ink">
              {registered.length}/{game.capacity} in
            </Text>
            <Text
              className={`font-display text-sm uppercase ${
                spotsLeft > 0 ? "text-pitch" : "text-boot"
              }`}
            >
              {spotsLeft > 0 ? `${spotsLeft} spots left` : "Full"}
            </Text>
          </View>
          <CapacityBar filled={registered.length} capacity={game.capacity} />
          {registered.length < game.min_players ? (
            <Subtle>
              Needs {game.min_players - registered.length} more to hit the{" "}
              {game.min_players} minimum.
            </Subtle>
          ) : null}
        </View>

        {/* Your registration + action */}
        <View className="gap-2">
          {mine?.status === "registered" ? (
            <Text className="font-display text-base uppercase text-pitch">
              You&apos;re in ✓
            </Text>
          ) : mine?.status === "waitlist" ? (
            <Text className="font-display text-base uppercase text-boot">
              On the waitlist · #{myWaitlistPos}
            </Text>
          ) : null}

          {canModify ? (
            mine && mine.status !== "withdrawn" ? (
              <Button
                title={mine.status === "waitlist" ? "Leave waitlist" : "Withdraw"}
                variant="ghost"
                loading={mutate.isPending}
                onPress={() => mutate.mutate("leave")}
              />
            ) : (
              <Button
                title={spotsLeft > 0 ? "Register" : "Join waitlist"}
                loading={mutate.isPending}
                onPress={() => mutate.mutate("join")}
              />
            )
          ) : (
            <View className="rounded-xl border border-line bg-card p-3">
              <Subtle>
                {beforeKickoff
                  ? "Registration isn't open for this game."
                  : "This game has kicked off — the list is locked."}
              </Subtle>
            </View>
          )}
        </View>

        {/* Signup list */}
        <SignupList title={`Registered (${registered.length})`} rows={registered} youId={profile?.id} />
        {waitlist.length > 0 ? (
          <SignupList title={`Waitlist (${waitlist.length})`} rows={waitlist} youId={profile?.id} />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function CapacityBar({ filled, capacity }: { filled: number; capacity: number }) {
  const pct = capacity > 0 ? Math.min(100, (filled / capacity) * 100) : 0;
  const full = filled >= capacity;
  return (
    <View className="h-2 overflow-hidden rounded-full bg-line">
      <View
        className={`h-full ${full ? "bg-boot" : "bg-pitch"}`}
        style={{ width: `${pct}%` }}
      />
    </View>
  );
}

function SignupList({
  title,
  rows,
  youId,
}: {
  title: string;
  rows: RegistrationWithName[];
  youId?: string;
}) {
  return (
    <View className="gap-2">
      <Text className="font-display text-sm uppercase tracking-wide text-mute">
        {title}
      </Text>
      <View className="rounded-xl border border-line bg-card">
        {rows.length === 0 ? (
          <View className="p-4">
            <Subtle>No one yet.</Subtle>
          </View>
        ) : (
          rows.map((r, i) => (
            <View
              key={r.id}
              className={`flex-row items-center justify-between px-4 py-3 ${
                i > 0 ? "border-t border-line" : ""
              }`}
            >
              <Text className="text-base text-ink">
                {r.profiles?.display_name ?? "Player"}
              </Text>
              {r.user_id === youId ? (
                <Text className="font-display text-xs uppercase text-pitch">
                  You
                </Text>
              ) : null}
            </View>
          ))
        )}
      </View>
    </View>
  );
}
