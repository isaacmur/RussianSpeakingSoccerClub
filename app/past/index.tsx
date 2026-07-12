import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, View } from "react-native";
import { ReportCard } from "@/app/(viewer)/reports";
import { MarqueeSpinner } from "@/components/motif";
import { BackButton, EmptyState, FilterPill, Heading, Screen } from "@/components/ui";
import { matchDayGroup } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { MatchReportSummary } from "@/lib/types";

// "All" plus the three buckets matchDayGroup() returns. All = no filter.
const FILTERS = ["All", "Saturday", "Sunday", "Weekday"] as const;
type Filter = (typeof FILTERS)[number];

// Active members' history of played matches. Reads the same list_match_reports()
// RPC (and query key) as the viewer Reports tab, so the cache is shared; the
// weekend filter is applied client-side. Reached from Matchday's header link.
export default function PastMatches() {
  const [filter, setFilter] = useState<Filter>("All");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["match-reports"],
    queryFn: async (): Promise<MatchReportSummary[]> => {
      const { data, error } = await supabase.rpc("list_match_reports");
      if (error) throw error;
      return (data ?? []) as MatchReportSummary[];
    },
  });

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch])
  );

  const rows = useMemo<MatchReportSummary[]>(() => {
    const all: MatchReportSummary[] = data ?? [];
    if (filter === "All") return all;
    return all.filter((r: MatchReportSummary) => matchDayGroup(r.kickoff_at) === filter);
  }, [data, filter]);

  return (
    <Screen>
      <BackButton />
      <View className="pt-1">
        <Heading kicker={rows.length > 0 ? `${rows.length} matches` : "2026 Season"}>
          Past matches
        </Heading>
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
          data={rows}
          keyExtractor={(r) => r.game_id}
          onRefresh={refetch}
          refreshing={isRefetching}
          ItemSeparatorComponent={() => <View className="h-3" />}
          contentContainerClassName="py-1 pb-4"
          ListEmptyComponent={
            <EmptyState>
              {filter === "All"
                ? "No match reports yet."
                : `No ${filter.toLowerCase()} matches yet.`}
            </EmptyState>
          }
          renderItem={({ item }) => <ReportCard report={item} />}
        />
      )}
    </Screen>
  );
}
