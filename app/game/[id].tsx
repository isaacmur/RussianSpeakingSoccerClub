import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import { MarqueeSpinner, WonderWheel } from "@/components/motif";
import {
  Badge,
  BulbString,
  Button,
  Card,
  Heading,
  Label,
  Num,
  Screen,
  StatusChip,
  Subtle,
} from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatKickoff, statusLabel } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { palette } from "@/lib/theme";
import { Game, RegistrationWithName } from "@/lib/types";

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
          <MarqueeSpinner />
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

  const short = spotsLeft > 0 && registered.length < game.min_players;

  return (
    <Screen>
      <Stack.Screen options={{ title: game.title }} />
      <ScrollView contentContainerClassName="gap-5 py-4" showsVerticalScrollIndicator={false}>
        {/* Header — the kicker promotes the kickoff time out of body copy. */}
        <View className="gap-2">
          <Heading kicker={formatKickoff(game.kickoff_at)}>{game.title}</Heading>
          <View className="flex-row items-center gap-3">
            <StatusChip label={status.label} tone={status.tone} />
            {game.location ? <Subtle>· {game.location}</Subtle> : null}
          </View>
        </View>

        {/* The Wonder Wheel: one cabin per roster spot. Capacity read as a shape.
            Only element on the screen that earns a glow. */}
        <Card className="items-center gap-3 py-6" glowColor={spotsLeft > 0 ? palette.wonder : palette.cyclone}>
          <WonderWheel
            filled={registered.length}
            capacity={game.capacity}
            waitlist={waitlist.length}
          />

          <View className="items-center gap-1">
            <View className="flex-row items-baseline gap-1">
              <Num className="font-display text-4xl text-bone">{registered.length}</Num>
              <Text className="font-display text-xl text-steel">/</Text>
              <Num className="font-display text-xl text-steel">{game.capacity}</Num>
            </View>
            {spotsLeft > 0 ? (
              <Text
                className={`font-display-semi text-xs uppercase tracking-wider ${
                  short ? "text-luna" : "text-wonder"
                }`}
              >
                {spotsLeft} {spotsLeft === 1 ? "spot" : "spots"} left
              </Text>
            ) : (
              <Badge color={palette.cyclone} lit>
                Full
              </Badge>
            )}
          </View>

          {short ? (
            <Text className="px-6 text-center font-body text-sm text-steel">
              Needs {game.min_players - registered.length} more to hit the{" "}
              {game.min_players} minimum.
            </Text>
          ) : null}

          {waitlist.length > 0 ? (
            <View className="flex-row items-center gap-1.5">
              <View className="h-1.5 w-1.5 rounded-full bg-ferris" />
              <Text className="font-display-semi text-[11px] uppercase tracking-wider text-ferris">
                {waitlist.length} waiting
              </Text>
            </View>
          ) : null}
        </Card>

        {/* Completed games lead with their report — the register/waitlist
            controls below are moot once there's a result. */}
        {game.status === "completed" ? (
          <Link href={{ pathname: "/report/[id]", params: { id } }} asChild>
            <Button title="View match report" variant="ghost" />
          </Link>
        ) : null}

        {/* Your registration + action */}
        <View className="gap-3">
          {mine?.status === "registered" ? (
            <View className="flex-row items-center gap-2">
              <Badge color={palette.wonder}>You&apos;re in</Badge>
            </View>
          ) : mine?.status === "waitlist" ? (
            <View className="flex-row items-center gap-2">
              <Badge color={palette.ferris}>Waitlist</Badge>
              <Num className="font-display-semi text-sm text-ferris">#{myWaitlistPos}</Num>
            </View>
          ) : null}

          {canModify ? (
            mine && mine.status !== "withdrawn" ? (
              <Button
                title={mine.status === "waitlist" ? "Leave waitlist" : "Withdraw"}
                variant="danger"
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
            <Card className="p-3">
              <Subtle>
                {beforeKickoff
                  ? "Registration isn't open for this game."
                  : "This game has kicked off — the list is locked."}
              </Subtle>
            </Card>
          )}
        </View>

        <BulbString />

        {/* Team sheet */}
        <SignupList
          title={`Registered (${registered.length})`}
          rows={registered}
          youId={profile?.id}
        />
        {waitlist.length > 0 ? (
          <SignupList
            title={`Waitlist (${waitlist.length})`}
            rows={waitlist}
            youId={profile?.id}
            spark
          />
        ) : null}
      </ScrollView>
    </Screen>
  );
}

function SignupList({
  title,
  rows,
  youId,
  spark = false,
}: {
  title: string;
  rows: RegistrationWithName[];
  youId?: string;
  spark?: boolean;
}) {
  return (
    <View className="gap-2">
      <Label>{title}</Label>
      <Card>
        {rows.length === 0 ? (
          <View className="p-4">
            <Subtle>No one yet.</Subtle>
          </View>
        ) : (
          rows.map((r, i) => {
            const you = r.user_id === youId;
            return (
              <View
                key={r.id}
                className={`flex-row items-center justify-between px-4 py-3 ${
                  i > 0 ? "border-t border-line/50" : ""
                }`}
              >
                <View className="flex-row items-center gap-3">
                  {/* squad number = position in the list. Inter, not Oswald:
                      this is a column, and Oswald ships no tnum feature. */}
                  <Num className="w-5 font-body-semi text-xs text-steel">{i + 1}</Num>
                  <Text
                    className={`font-body text-base ${you ? "text-wonder" : "text-bone"}`}
                  >
                    {r.profiles?.display_name ?? "Player"}
                  </Text>
                </View>
                {you ? (
                  <Badge color={spark ? palette.ferris : palette.wonder}>You</Badge>
                ) : null}
              </View>
            );
          })
        )}
      </Card>
    </View>
  );
}
