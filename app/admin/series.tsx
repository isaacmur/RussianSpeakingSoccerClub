import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Button, Field, Screen, Subtle } from "@/components/ui";
import { useAuth } from "@/lib/auth";
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
      Alert.alert("Series created", "Upcoming games have been generated.");
    },
    onError: (e: unknown) =>
      Alert.alert("Couldn't create", e instanceof Error ? e.message : String(e)),
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
      Alert.alert("Update failed", e instanceof Error ? e.message : String(e)),
  });

  return (
    <Screen>
      <ScrollView contentContainerClassName="gap-6 py-4">
        {/* New series form */}
        <View className="gap-4 rounded-xl border border-line bg-card p-4">
          <Text className="font-display text-lg uppercase text-ink">
            New series
          </Text>
          <Field
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="Saturday Pickup"
          />

          <View className="gap-1">
            <Text className="text-sm font-medium uppercase tracking-wide text-mute">
              Day of week
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {DAYS_SHORT.map((d, i) => {
                const on = i === dow;
                return (
                  <Pressable
                    key={d}
                    onPress={() => setDow(i)}
                    className={`rounded-lg border px-3 py-2 ${
                      on ? "border-ink bg-ink" : "border-line bg-card"
                    }`}
                  >
                    <Text
                      className={`text-sm uppercase ${on ? "text-white" : "text-mute"}`}
                    >
                      {d}
                    </Text>
                  </Pressable>
                );
              })}
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
            placeholder="Riverside Fields"
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
        </View>

        {/* Existing series */}
        <View className="gap-3">
          <Text className="font-display text-lg uppercase text-ink">Series</Text>
          {isLoading ? (
            <ActivityIndicator color="#1F7A46" />
          ) : (data ?? []).length === 0 ? (
            <Subtle>No series yet.</Subtle>
          ) : (
            (data ?? []).map((s: GameSeries) => (
              <View
                key={s.id}
                className="flex-row items-center justify-between rounded-xl border border-line bg-card p-4"
              >
                <View className="flex-1 pr-3">
                  <Text className="font-display text-base uppercase text-ink">
                    {s.title}
                  </Text>
                  <Subtle>
                    {DAYS_SHORT[s.day_of_week]} · {s.kickoff_time.slice(0, 5)} ·{" "}
                    {s.capacity} cap
                  </Subtle>
                </View>
                <Pressable
                  onPress={() => toggleActive.mutate(s)}
                  disabled={toggleActive.isPending}
                  className={`rounded-lg px-3 py-2 ${s.active ? "bg-pitch" : "bg-mute"}`}
                >
                  <Text className="text-sm font-semibold uppercase text-white">
                    {s.active ? "Active" : "Paused"}
                  </Text>
                </Pressable>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}
