import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
} from "react-native";
import { Screen, Subtle } from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { Profile, ProfileRole, ProfileStatus } from "@/lib/types";

const FILTERS = ["pending", "active", "viewer", "rejected"] as const;
type Filter = (typeof FILTERS)[number];

function statusColor(status: ProfileStatus): string {
  switch (status) {
    case "active":
      return "text-pitch";
    case "viewer":
      return "text-ink";
    case "rejected":
      return "text-boot";
    default:
      return "text-mute";
  }
}

export default function AdminMembers() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("pending");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["admin-members", filter],
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("status", filter)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as Profile[];
    },
  });

  const update = useMutation({
    mutationFn: async (patch: {
      id: string;
      status?: ProfileStatus;
      role?: ProfileRole;
    }) => {
      const { id, ...fields } = patch;
      const { error } = await supabase
        .from("profiles")
        .update(fields)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      // Row may leave the current filter; refresh all member lists.
      qc.invalidateQueries({ queryKey: ["admin-members"] });
    },
    onError: (e: unknown) =>
      Alert.alert("Update failed", e instanceof Error ? e.message : String(e)),
  });

  return (
    <Screen>
      {/* Status filter */}
      <View className="flex-row gap-2 py-3">
        {FILTERS.map((f) => {
          const active = f === filter;
          return (
            <Pressable
              key={f}
              onPress={() => setFilter(f)}
              className={[
                "rounded-full border px-3 py-1",
                active ? "border-ink bg-ink" : "border-line bg-card",
              ].join(" ")}
            >
              <Text
                className={[
                  "text-sm uppercase tracking-wide",
                  active ? "text-white" : "text-mute",
                ].join(" ")}
              >
                {f}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#1F7A46" />
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(p) => p.id}
          onRefresh={refetch}
          refreshing={isRefetching}
          ItemSeparatorComponent={() => <View className="h-3" />}
          contentContainerClassName="py-2"
          ListEmptyComponent={
            <View className="items-center py-16">
              <Subtle>No {filter} members.</Subtle>
            </View>
          }
          renderItem={({ item }) => (
            <MemberRow
              profile={item}
              busy={update.isPending}
              onAction={(patch) => update.mutate({ id: item.id, ...patch })}
            />
          )}
        />
      )}
    </Screen>
  );
}

function MemberRow({
  profile,
  busy,
  onAction,
}: {
  profile: Profile;
  busy: boolean;
  onAction: (patch: { status?: ProfileStatus; role?: ProfileRole }) => void;
}) {
  const isAdmin = profile.role === "admin";
  return (
    <View className="gap-3 rounded-xl border border-line bg-card p-4">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="font-display text-lg uppercase text-ink">
            {profile.display_name}
          </Text>
          <Text className={`text-sm uppercase ${statusColor(profile.status)}`}>
            {profile.status}
            {isAdmin ? " · admin" : ""}
          </Text>
        </View>
      </View>

      <View className="flex-row flex-wrap gap-2">
        {profile.status !== "active" && (
          <ActionChip
            label="Admit"
            tone="pitch"
            disabled={busy}
            onPress={() => onAction({ status: "active" })}
          />
        )}
        {profile.status !== "viewer" && (
          <ActionChip
            label="Viewer"
            tone="ink"
            disabled={busy}
            onPress={() => onAction({ status: "viewer" })}
          />
        )}
        {profile.status !== "rejected" && (
          <ActionChip
            label="Reject"
            tone="boot"
            disabled={busy}
            onPress={() => onAction({ status: "rejected" })}
          />
        )}
        <ActionChip
          label={isAdmin ? "Revoke admin" : "Make admin"}
          tone="ink"
          disabled={busy}
          onPress={() => onAction({ role: isAdmin ? "player" : "admin" })}
        />
      </View>
    </View>
  );
}

function ActionChip({
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
  const bg =
    tone === "pitch" ? "bg-pitch" : tone === "boot" ? "bg-boot" : "bg-ink";
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
