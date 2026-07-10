import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { MarqueeSpinner } from "@/components/motif";
import {
  ActionChip,
  BulbString,
  Button,
  Card,
  Field,
  FilterPill,
  Heading,
  Label,
  Num,
  Screen,
  Subtle,
} from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { confirmDestructive, notify } from "@/lib/dialogs";
import { supabase } from "@/lib/supabase";
import { GameSeries } from "@/lib/types";

const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function AdminSeries() {
  const qc = useQueryClient();
  const { profile } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["admin-series"],
    queryFn: async (): Promise<GameSeries[]> => {
      const { data, error } = await supabase
        .from("game_series")
        .select("*")
        .order("day_of_week", { ascending: true });
      if (error) throw error;
      return data as GameSeries[];
    },
  });

  // Form state
  const [title, setTitle] = useState("");
  const [dow, setDow] = useState(6); // default Saturday
  const [time, setTime] = useState("10:00");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState("20");
  const [minPlayers, setMinPlayers] = useState("10");
  const [offset, setOffset] = useState("48");

  const create = useMutation({
    mutationFn: async () => {
      if (!title.trim()) throw new Error("Give the series a title.");
      if (!/^\d{1,2}:\d{2}$/.test(time)) throw new Error("Time must be HH:MM (24h).");
      const { error } = await supabase.from("game_series").insert({
        title: title.trim(),
        day_of_week: dow,
        kickoff_time: `${time}:00`,
        location: location.trim() || null,
        capacity: parseInt(capacity, 10) || 20,
        min_players: parseInt(minPlayers, 10) || 10,
        reg_opens_offset_hours: parseInt(offset, 10) || 48,
        created_by: profile!.id,
      });
      if (error) throw error;
      // Generate the next 4 weeks of games from all active series immediately.
      const { error: mErr } = await supabase.rpc("materialize_games");
      if (mErr) throw mErr;
    },
    onSuccess: () => {
      setTitle("");
      setLocation("");
      qc.invalidateQueries({ queryKey: ["admin-series"] });
      qc.invalidateQueries({ queryKey: ["admin-schedule"] });
      qc.invalidateQueries({ queryKey: ["matchday"] });
      notify("Series created", "Upcoming games have been generated.");
    },
    onError: (e: unknown) =>
      notify("Couldn't create", e instanceof Error ? e.message : String(e)),
  });

  const toggleActive = useMutation({
    mutationFn: async (s: GameSeries) => {
      const { error } = await supabase
        .from("game_series")
        .update({ active: !s.active })
        .eq("id", s.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-series"] }),
    onError: (e: unknown) =>
      notify("Update failed", e instanceof Error ? e.message : String(e)),
  });

  const deleteSeries = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("game_series").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-series"] });
      qc.invalidateQueries({ queryKey: ["admin-schedule"] });
      qc.invalidateQueries({ queryKey: ["matchday"] });
    },
    onError: (e: unknown) =>
      notify("Delete failed", e instanceof Error ? e.message : String(e)),
  });

  const confirmDeleteSeries = (s: GameSeries) => {
    confirmDestructive(
      "Delete series?",
      `"${s.title}" and ALL of its games — past and upcoming, with their registrations, results, and goals — will be permanently deleted. This cannot be undone.`,
      "Delete",
      () => deleteSeries.mutate(s.id)
    );
  };

  const list = data ?? [];

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-5 py-3" showsVerticalScrollIndicator={false}>
        <Heading kicker="Recurring fixtures">Series</Heading>

        {/* New series form */}
        <Card className="gap-4 p-4">
          <Label>New series</Label>
          <Field
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="Saturday Pickup"
          />

          <View className="gap-1.5">
            <Label>Day of week</Label>
            <View className="flex-row flex-wrap gap-2">
              {DAYS_SHORT.map((d, i) => (
                <FilterPill key={d} label={d} active={i === dow} onPress={() => setDow(i)} />
              ))}
            </View>
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field
                label="Kickoff (HH:MM)"
                value={time}
                onChangeText={setTime}
                placeholder="10:00"
                keyboardType="numbers-and-punctuation"
              />
            </View>
            <View className="flex-1">
              <Field
                label="Reg opens (h before)"
                value={offset}
                onChangeText={setOffset}
                keyboardType="number-pad"
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
          </View>

          <Button
            title="Create series"
            loading={create.isPending}
            onPress={() => create.mutate()}
          />
        </Card>

        <BulbString />

        {/* Existing series */}
        <View className="gap-3">
          <Label>All series</Label>
          {isLoading ? (
            <View className="items-center py-6">
              <MarqueeSpinner />
            </View>
          ) : list.length === 0 ? (
            <Subtle>No series yet.</Subtle>
          ) : (
            list.map((s: GameSeries) => (
              <Card key={s.id} className="flex-row items-center justify-between p-4">
                <View className="flex-1 pr-3">
                  <Text className="font-display text-base uppercase text-bone">
                    {s.title}
                  </Text>
                  <Num className="font-body text-sm text-steel">
                    {DAYS_SHORT[s.day_of_week]} · {s.kickoff_time.slice(0, 5)} ·{" "}
                    {s.capacity} cap
                  </Num>
                </View>
                <View className="flex-row gap-2">
                  <ActionChip
                    label={s.active ? "Active" : "Paused"}
                    tone={s.active ? "go" : "neutral"}
                    disabled={toggleActive.isPending || deleteSeries.isPending}
                    onPress={() => toggleActive.mutate(s)}
                  />
                  <ActionChip
                    label="Delete"
                    tone="danger"
                    disabled={toggleActive.isPending || deleteSeries.isPending}
                    onPress={() => confirmDeleteSeries(s)}
                  />
                </View>
              </Card>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
