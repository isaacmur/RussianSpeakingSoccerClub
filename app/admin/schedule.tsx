import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { MarqueeSpinner } from "@/components/motif";
import {
  ActionChip,
  BackButton,
  Button,
  Card,
  EmptyState,
  Field,
  Heading,
  Label,
  Num,
  Screen,
  StatusChip,
} from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { confirmDestructive, notify } from "@/lib/dialogs";
import { formatKickoff, matchLabel, statusLabel } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { Game, GameStatus } from "@/lib/types";

export default function AdminSchedule() {
  const qc = useQueryClient();
  const router = useRouter();
  const { profile } = useAuth();

  const [showOneOff, setShowOneOff] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("20");
  const [minPlayers, setMinPlayers] = useState("10");
  const [offset, setOffset] = useState("48");

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
      notify("Failed", e instanceof Error ? e.message : String(e)),
  });

  const createOneOff = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Give the game a title.");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date.trim()))
        throw new Error("Date must be YYYY-MM-DD.");
      if (!/^\d{1,2}:\d{2}$/.test(time.trim()))
        throw new Error("Time must be HH:MM (24h).");

      // Built in the device's local timezone — same wall-clock convention the
      // series materializer uses (America/New_York).
      const [y, mo, d] = date.trim().split("-").map(Number);
      const [hh, mm] = time.trim().split(":").map(Number);
      const kickoff = new Date(y, mo - 1, d, hh, mm);
      if (isNaN(kickoff.getTime())) throw new Error("Invalid date or time.");
      if (kickoff.getTime() <= Date.now())
        throw new Error("Kickoff must be in the future.");

      const offsetH = parseInt(offset, 10) || 48;
      const opens = new Date(kickoff.getTime() - offsetH * 3600_000);

      const { error } = await supabase.from("games").insert({
        series_id: null,
        title: title.trim(),
        kickoff_at: kickoff.toISOString(),
        location: location.trim() || null,
        capacity: parseInt(capacity, 10) || 20,
        min_players: parseInt(minPlayers, 10) || 10,
        registration_opens_at: opens.toISOString(),
        status: Date.now() >= opens.getTime() ? "registration_open" : "scheduled",
        created_by: profile!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitle("");
      setDate("");
      setLocation("");
      setShowOneOff(false);
      qc.invalidateQueries({ queryKey: ["admin-schedule"] });
      qc.invalidateQueries({ queryKey: ["matchday"] });
      notify("Game created", "The one-off game is on the schedule.");
    },
    onError: (e: unknown) =>
      notify("Couldn't create", e instanceof Error ? e.message : String(e)),
  });

  const deleteGame = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("games").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-schedule"] });
      qc.invalidateQueries({ queryKey: ["matchday"] });
    },
    onError: (e: unknown) =>
      notify("Delete failed", e instanceof Error ? e.message : String(e)),
  });

  const confirmDelete = (game: Game) => {
    confirmDestructive(
      "Delete game?",
      `"${game.title}" and all its registrations, results, and goals will be permanently deleted. This cannot be undone.`,
      "Delete",
      () => deleteGame.mutate(game.id)
    );
  };

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: GameStatus }) => {
      const { error } = await supabase.from("games").update({ status }).eq("id", id);
      if (error) throw error;
      // Opening/closing registration by hand must enqueue its notifications
      // now, not on the next 5-min cron tick. Both fan-out functions are
      // admin-guarded and dedupe per game, so they're safe to call immediately.
      if (status === "registration_open") {
        const { error: notifyErr } = await supabase.rpc("notify_registration_open");
        if (notifyErr) throw notifyErr;
      } else if (status === "locked") {
        const { error: notifyErr } = await supabase.rpc("notify_registration_closed");
        if (notifyErr) throw notifyErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-schedule"] });
      qc.invalidateQueries({ queryKey: ["matchday"] });
    },
    onError: (e: unknown) =>
      notify("Update failed", e instanceof Error ? e.message : String(e)),
  });

  const count = data?.length ?? 0;

  return (
    <Screen>
      <BackButton />
      <View className="pt-1">
        <Heading kicker={count > 0 ? `${count} upcoming` : "Admin"}>Schedule</Heading>
      </View>

      <View className="gap-3 py-3">
        <Button
          title="Generate games from series"
          variant="ghost"
          loading={materialize.isPending}
          onPress={() => materialize.mutate()}
        />
        <Button
          title={showOneOff ? "Hide one-off form" : "New one-off game"}
          variant="ghost"
          onPress={() => setShowOneOff((v) => !v)}
        />

        {showOneOff ? (
          <Card className="gap-4 p-4">
            <Label>One-off game</Label>
            <Field
              label="Title"
              value={title}
              onChangeText={setTitle}
              placeholder="Holiday Special"
            />
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
            <Button
              title="Create game"
              loading={createOneOff.isPending}
              onPress={() => createOneOff.mutate()}
            />
          </Card>
        ) : null}
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
              busy={setStatus.isPending || deleteGame.isPending}
              onSetStatus={(status) => setStatus.mutate({ id: item.id, status })}
              onDelete={() => confirmDelete(item)}
              onEdit={() =>
                router.push({
                  pathname: "/admin/game/[id]",
                  params: { id: item.id },
                })
              }
              onEnterResult={() =>
                router.push({
                  pathname: "/admin/summary/[id]",
                  params: { id: item.id },
                })
              }
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
  onDelete,
  onEdit,
  onEnterResult,
}: {
  game: Game;
  busy: boolean;
  onSetStatus: (status: GameStatus) => void;
  onDelete: () => void;
  onEdit: () => void;
  onEnterResult: () => void;
}) {
  const status = statusLabel(game.status);
  const done = game.status === "completed" || game.status === "cancelled";
  // Results can be entered once the game is locked / underway / over, or any
  // time kickoff has passed — the point at which there's a score to record.
  const canEnterResult =
    game.status === "locked" ||
    game.status === "in_progress" ||
    game.status === "completed" ||
    (game.status !== "cancelled" &&
      new Date(game.kickoff_at).getTime() < Date.now());

  return (
    <Card className="gap-3 p-4">
      <Link href={{ pathname: "/game/[id]", params: { id: game.id } }} asChild>
        <Pressable className="gap-1">
          <Text className="font-display text-base uppercase text-bone">
            {matchLabel(game.kickoff_at)}
          </Text>
          <Num className="font-body text-sm text-steel">
            {formatKickoff(game.kickoff_at)}
          </Num>
          <StatusChip label={status.label} tone={status.tone} />
        </Pressable>
      </Link>

      <View className="flex-row flex-wrap gap-2">
        <ActionChip label="Edit" disabled={busy} onPress={onEdit} />
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
        {canEnterResult ? (
          <ActionChip
            label={game.status === "completed" ? "Edit result" : "Enter result"}
            tone="go"
            disabled={busy}
            onPress={onEnterResult}
          />
        ) : null}
        {!done ? (
          <ActionChip
            label="Cancel"
            tone="danger"
            disabled={busy}
            onPress={() => onSetStatus("cancelled")}
          />
        ) : null}
        <ActionChip label="Delete" tone="danger" disabled={busy} onPress={onDelete} />
      </View>
    </Card>
  );
}
