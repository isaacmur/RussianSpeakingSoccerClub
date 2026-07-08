import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, FlatList, Text, View } from "react-native";
import { MarqueeSpinner } from "@/components/motif";
import {
  ActionChip,
  Card,
  EmptyState,
  FilterPill,
  Heading,
  Screen,
} from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { Profile, ProfileRole, ProfileStatus } from "@/lib/types";

const FILTERS = ["pending", "active", "viewer", "rejected"] as const;
type Filter = (typeof FILTERS)[number];

// Membership state, not game state — so this doesn't route through statusLabel().
function statusText(status: ProfileStatus): string {
  switch (status) {
    case "active":
      return "text-wonder";
    case "viewer":
      return "text-bone";
    case "rejected":
      return "text-cyclone-lit";
    default:
      return "text-luna"; // pending — lamplight, waiting to be let in
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

  const count = data?.length ?? 0;

  return (
    <Screen>
      <View className="pt-1">
        <Heading kicker={count > 0 ? `${count} ${filter}` : "Admin"}>Members</Heading>
      </View>

      <View className="flex-row gap-2 py-3">
        {FILTERS.map((f) => (
          <FilterPill
            key={f}
            label={f}
            active={f === filter}
            onPress={() => setFilter(f)}
          />
        ))}
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <MarqueeSpinner />
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(p) => p.id}
          onRefresh={refetch}
          refreshing={isRefetching}
          ItemSeparatorComponent={() => <View className="h-3" />}
          contentContainerClassName="py-2"
          ListEmptyComponent={<EmptyState>No {filter} members.</EmptyState>}
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
    <Card className="gap-3 p-4">
      <View>
        <Text className="font-display text-lg uppercase text-bone">
          {profile.display_name}
        </Text>
        <Text
          className={`font-display-semi text-[11px] uppercase tracking-wider ${statusText(
            profile.status
          )}`}
        >
          {profile.status}
          {isAdmin ? " · admin" : ""}
        </Text>
      </View>

      <View className="flex-row flex-wrap gap-2">
        {profile.status !== "active" && (
          <ActionChip
            label="Admit"
            tone="go"
            disabled={busy}
            onPress={() => onAction({ status: "active" })}
          />
        )}
        {profile.status !== "viewer" && (
          <ActionChip
            label="Viewer"
            disabled={busy}
            onPress={() => onAction({ status: "viewer" })}
          />
        )}
        {profile.status !== "rejected" && (
          <ActionChip
            label="Reject"
            tone="danger"
            disabled={busy}
            onPress={() => onAction({ status: "rejected" })}
          />
        )}
        <ActionChip
          label={isAdmin ? "Revoke admin" : "Make admin"}
          disabled={busy}
          onPress={() => onAction({ role: isAdmin ? "player" : "admin" })}
        />
      </View>
    </Card>
  );
}
