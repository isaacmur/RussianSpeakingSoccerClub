import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert, FlatList, Pressable, Text, TextInput, View } from "react-native";
import { MarqueeSpinner } from "@/components/motif";
import {
  Button,
  Card,
  EmptyState,
  Heading,
  Label,
  Num,
  Screen,
  Subtle,
} from "@/components/ui";
import { supabase } from "@/lib/supabase";
import { palette, tabularNums } from "@/lib/theme";
import { BaselineStats, Profile, SeasonBaseline } from "@/lib/types";

const STAT_FIELDS: { key: keyof BaselineStats; label: string }[] = [
  { key: "games_played", label: "Played" },
  { key: "wins", label: "Wins" },
  { key: "draws", label: "Draws" },
  { key: "losses", label: "Losses" },
  { key: "plus_minus", label: "+/-" },
  { key: "goals", label: "Goals" },
];

const ZERO: BaselineStats = {
  games_played: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  plus_minus: 0,
  goals: 0,
};

// Pre-app history: admins seed each player's starting stats for the current
// season. These are added to app-computed stats by the player_stats view.
export default function AdminBaselines() {
  const qc = useQueryClient();
  const [openId, setOpenId] = useState<string | null>(null);

  // Current season (America/New_York-derived, authoritative) + the roster of
  // active members + any baselines already saved for this season.
  const { data, isLoading } = useQuery({
    queryKey: ["admin-baselines"],
    queryFn: async () => {
      const [seasonRes, playersRes, baselinesRes] = await Promise.all([
        supabase.rpc("current_season_id"),
        supabase
          .from("profiles")
          .select("*")
          .eq("status", "active")
          .order("display_name", { ascending: true }),
        supabase.from("season_baselines").select("*"),
      ]);
      if (seasonRes.error) throw seasonRes.error;
      if (playersRes.error) throw playersRes.error;
      if (baselinesRes.error) throw baselinesRes.error;

      const seasonId = seasonRes.data as string | null;
      const baselines = (baselinesRes.data as SeasonBaseline[]).filter(
        (b) => b.season_id === seasonId
      );
      return {
        seasonId,
        players: playersRes.data as Profile[],
        byUser: new Map(baselines.map((b) => [b.user_id, b])),
      };
    },
  });

  const save = useMutation({
    mutationFn: async (row: SeasonBaseline) => {
      const { error } = await supabase
        .from("season_baselines")
        .upsert(row, { onConflict: "season_id,user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      setOpenId(null);
      qc.invalidateQueries({ queryKey: ["admin-baselines"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    },
    onError: (e: unknown) =>
      Alert.alert("Save failed", e instanceof Error ? e.message : String(e)),
  });

  if (isLoading) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <MarqueeSpinner />
        </View>
      </Screen>
    );
  }

  if (!data?.seasonId) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center px-6">
          <EmptyState>No current season found. Seed the season row first.</EmptyState>
        </View>
      </Screen>
    );
  }

  const { seasonId, players, byUser } = data;

  return (
    <Screen>
      <View className="pt-1">
        <Heading kicker="Pre-app history">Baselines</Heading>
      </View>
      <FlatList
        data={players}
        keyExtractor={(p) => p.id}
        contentContainerClassName="py-3"
        ItemSeparatorComponent={() => <View className="h-3" />}
        ListEmptyComponent={
          <EmptyState>No active members to set baselines for.</EmptyState>
        }
        renderItem={({ item }) => (
          <PlayerBaseline
            player={item}
            existing={byUser.get(item.id) ?? null}
            open={openId === item.id}
            busy={save.isPending}
            onToggle={() => setOpenId(openId === item.id ? null : item.id)}
            onSave={(stats) =>
              save.mutate({ season_id: seasonId, user_id: item.id, ...stats })
            }
          />
        )}
      />
    </Screen>
  );
}

function PlayerBaseline({
  player,
  existing,
  open,
  busy,
  onToggle,
  onSave,
}: {
  player: Profile;
  existing: SeasonBaseline | null;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onSave: (stats: BaselineStats) => void;
}) {
  const saved: BaselineStats = existing
    ? {
        games_played: existing.games_played,
        wins: existing.wins,
        draws: existing.draws,
        losses: existing.losses,
        plus_minus: existing.plus_minus,
        goals: existing.goals,
      }
    : ZERO;

  const hasBaseline = !!existing && STAT_FIELDS.some((f) => saved[f.key] !== 0);

  return (
    <Card>
      <Pressable
        onPress={onToggle}
        className="flex-row items-center justify-between p-4"
      >
        <View className="flex-1 pr-3">
          <Text className="font-display text-lg uppercase text-bone">
            {player.display_name}
          </Text>
          {hasBaseline ? (
            <Num className="font-body text-sm text-steel">
              P{saved.games_played} · {saved.wins}-{saved.draws}-{saved.losses} ·{" "}
              {saved.plus_minus > 0 ? "+" : ""}
              {saved.plus_minus} · {saved.goals} gls
            </Num>
          ) : (
            <Subtle>No baseline set</Subtle>
          )}
        </View>
        <Text className="font-display-semi text-xs uppercase tracking-wider text-luna">
          {open ? "Close" : "Edit"}
        </Text>
      </Pressable>

      {open && (
        <BaselineEditor
          key={`${player.id}-${existing?.season_id ?? "new"}`}
          initial={saved}
          busy={busy}
          onSave={onSave}
        />
      )}
    </Card>
  );
}

function BaselineEditor({
  initial,
  busy,
  onSave,
}: {
  initial: BaselineStats;
  busy: boolean;
  onSave: (stats: BaselineStats) => void;
}) {
  // Track raw text so a field can be transiently empty / "-" while typing.
  const [draft, setDraft] = useState<Record<keyof BaselineStats, string>>(
    () =>
      Object.fromEntries(
        STAT_FIELDS.map((f) => [f.key, String(initial[f.key])])
      ) as Record<keyof BaselineStats, string>
  );

  const parse = (v: string) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : 0;
  };

  return (
    <View className="gap-3 border-t border-line p-4">
      <View className="flex-row flex-wrap gap-3">
        {STAT_FIELDS.map((f) => (
          <View key={f.key} className="w-[30%] gap-1">
            <Label>{f.label}</Label>
            <TextInput
              value={draft[f.key]}
              onChangeText={(t) =>
                setDraft((d) => ({ ...d, [f.key]: t.replace(/[^0-9-]/g, "") }))
              }
              keyboardType="numbers-and-punctuation"
              placeholderTextColor={palette.steel}
              className="h-11 rounded-lg border border-line bg-night px-3 font-body text-base text-bone"
              // The `tabular-nums` class here was a no-op — Tailwind emits
              // font-variant-numeric, which css-interop never parses. Six stat
              // boxes side by side need fixed-width digits or they jitter as
              // you type. Same reason <Num> exists.
              style={tabularNums}
            />
          </View>
        ))}
      </View>
      <Button
        title="Save baseline"
        loading={busy}
        onPress={() =>
          onSave(
            Object.fromEntries(
              STAT_FIELDS.map((f) => [f.key, parse(draft[f.key])])
            ) as unknown as BaselineStats
          )
        }
      />
    </View>
  );
}
