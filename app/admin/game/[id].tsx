import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { MarqueeSpinner } from "@/components/motif";
import {
  BackButton,
  Button,
  Card,
  Field,
  FilterPill,
  Heading,
  Label,
  Screen,
  Subtle,
} from "@/components/ui";
import { notify } from "@/lib/dialogs";
import { formatKickoff, matchLabel, statusLabel } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { Game, GameStatus } from "@/lib/types";

// Every status is offered — an admin editing a completed or cancelled game may
// need to move it back to any point in the lifecycle to fix a mistake.
const STATUSES: GameStatus[] = [
  "draft",
  "scheduled",
  "registration_open",
  "filled",
  "locked",
  "in_progress",
  "completed",
  "cancelled",
];

const pad = (n: number) => String(n).padStart(2, "0");

export default function AdminEditGame() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("");
  const [minPlayers, setMinPlayers] = useState("");
  const [offset, setOffset] = useState("");
  const [status, setStatus] = useState<GameStatus>("scheduled");
  const [hydrated, setHydrated] = useState(false);

  const { data: game, isLoading, isError } = useQuery({
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

  const isSeries = !!game?.series_id;

  // Seed the form once. Date/time are read off the stored instant in the
  // device's local timezone — the same wall-clock convention the create form
  // writes with, so an untouched kickoff round-trips to the exact same instant.
  useEffect(() => {
    if (!game || hydrated) return;
    const ko = new Date(game.kickoff_at);
    setTitle(game.title);
    setDate(`${ko.getFullYear()}-${pad(ko.getMonth() + 1)}-${pad(ko.getDate())}`);
    setTime(`${pad(ko.getHours())}:${pad(ko.getMinutes())}`);
    setLocation(game.location ?? "");
    setCapacity(String(game.capacity));
    setMinPlayers(String(game.min_players));
    const offH = Math.round(
      (ko.getTime() - new Date(game.registration_opens_at).getTime()) / 3600_000
    );
    setOffset(String(offH));
    setStatus(game.status);
    setHydrated(true);
  }, [game, hydrated]);

  const save = useMutation({
    mutationFn: async () => {
      if (!game) throw new Error("Game not loaded.");
      if (!title.trim()) throw new Error("Give the game a title.");

      // Series games keep their generated kickoff (the schedule owns it); only
      // one-off games rebuild kickoff from the date/time fields.
      let kickoff = new Date(game.kickoff_at);
      if (!isSeries) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim()))
          throw new Error("Date must be YYYY-MM-DD.");
        if (!/^\d{1,2}:\d{2}$/.test(time.trim()))
          throw new Error("Time must be HH:MM (24h).");
        const [y, mo, d] = date.trim().split("-").map(Number);
        const [hh, mm] = time.trim().split(":").map(Number);
        kickoff = new Date(y, mo - 1, d, hh, mm);
        if (isNaN(kickoff.getTime())) throw new Error("Invalid date or time.");
      }

      const cap = parseInt(capacity, 10);
      const min = parseInt(minPlayers, 10);
      if (!Number.isFinite(cap) || cap <= 0)
        throw new Error("Capacity must be a positive number.");
      if (!Number.isFinite(min) || min <= 0)
        throw new Error("Min players must be a positive number.");

      const offsetH = parseInt(offset, 10);
      const opens = new Date(
        kickoff.getTime() - (Number.isFinite(offsetH) ? offsetH : 48) * 3600_000
      );

      const { error } = await supabase
        .from("games")
        .update({
          title: title.trim(),
          kickoff_at: kickoff.toISOString(),
          location: location.trim() || null,
          capacity: cap,
          min_players: min,
          registration_opens_at: opens.toISOString(),
          status,
        })
        .eq("id", game.id);
      if (error) throw error;

      // Flipping status by hand must enqueue that transition's notifications now,
      // not on the next cron tick — mirrors the schedule screen's status chips.
      // Both fan-out functions are admin-guarded and dedupe per game.
      if (status !== game.status) {
        if (status === "registration_open") {
          const { error: nErr } = await supabase.rpc("notify_registration_open");
          if (nErr) throw nErr;
        } else if (status === "locked") {
          const { error: nErr } = await supabase.rpc("notify_registration_closed");
          if (nErr) throw nErr;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["game", id] });
      qc.invalidateQueries({ queryKey: ["game-regs", id] });
      qc.invalidateQueries({ queryKey: ["admin-schedule"] });
      qc.invalidateQueries({ queryKey: ["matchday"] });
      qc.invalidateQueries({ queryKey: ["match-reports"] });
      qc.invalidateQueries({ queryKey: ["report", id] });
      notify("Saved", "The game has been updated.");
      router.back();
    },
    onError: (e: unknown) =>
      notify("Couldn't save", e instanceof Error ? e.message : String(e)),
  });

  if (isLoading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Edit game" }} />
        <View className="flex-1 items-center justify-center">
          <MarqueeSpinner />
        </View>
      </Screen>
    );
  }

  if (isError || !game) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Edit game" }} />
        <BackButton />
        <View className="flex-1 items-center justify-center">
          <Subtle>This game couldn&apos;t be loaded.</Subtle>
        </View>
      </Screen>
    );
  }

  const minOverCap =
    Number.isFinite(parseInt(minPlayers, 10)) &&
    Number.isFinite(parseInt(capacity, 10)) &&
    parseInt(minPlayers, 10) > parseInt(capacity, 10);

  return (
    <Screen>
      <Stack.Screen options={{ title: "Edit game" }} />
      <BackButton />
      <ScrollView
        contentContainerClassName="gap-5 py-3"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Heading kicker={formatKickoff(game.kickoff_at)}>
          {matchLabel(game.kickoff_at)}
        </Heading>

        <Card className="gap-4 p-4">
          <Field label="Title" value={title} onChangeText={setTitle} />

          {isSeries ? (
            <View className="gap-1.5">
              <Label>Date &amp; time</Label>
              <Card className="p-3">
                <Subtle>
                  Set by the series — {formatKickoff(game.kickoff_at)}. Edit the
                  series to move recurring games.
                </Subtle>
              </Card>
            </View>
          ) : (
            <View className="flex-row gap-3">
              <View className="flex-1">
                <Field
                  label="Date (YYYY-MM-DD)"
                  value={date}
                  onChangeText={setDate}
                  placeholder="2026-07-18"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
              <View className="flex-1">
                <Field
                  label="Kickoff (HH:MM)"
                  value={time}
                  onChangeText={setTime}
                  placeholder="10:00"
                  keyboardType="numbers-and-punctuation"
                />
              </View>
            </View>
          )}

          <Field
            label="Location"
            value={location}
            onChangeText={setLocation}
            placeholder="Kaiser Park"
          />

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                label="Capacity"
                value={capacity}
                onChangeText={setCapacity}
                keyboardType="number-pad"
              />
            </View>
            <View className="flex-1">
              <Field
                label="Min players"
                value={minPlayers}
                onChangeText={setMinPlayers}
                keyboardType="number-pad"
              />
            </View>
            <View className="flex-1">
              <Field
                label="Reg opens (h)"
                value={offset}
                onChangeText={setOffset}
                keyboardType="number-pad"
              />
            </View>
          </View>

          {minOverCap ? (
            <Subtle>Min players is above capacity — the game can never fill.</Subtle>
          ) : null}
        </Card>

        <View className="gap-2">
          <Label>Status</Label>
          <View className="flex-row flex-wrap gap-2">
            {STATUSES.map((s) => (
              <FilterPill
                key={s}
                label={statusLabel(s).label}
                active={s === status}
                onPress={() => setStatus(s)}
              />
            ))}
          </View>
          <Subtle>
            Raising capacity promotes waitlisters automatically. Lowering it keeps
            everyone already in.
          </Subtle>
        </View>

        <Button title="Save changes" loading={save.isPending} onPress={() => save.mutate()} />
        <View className="h-4" />
      </ScrollView>
    </Screen>
  );
}
