import { useQuery } from "@tanstack/react-query";
import { Link, useFocusEffect } from "expo-router";
import { useCallback } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { MarqueeSpinner } from "@/components/motif";
import { Card, EmptyState, Heading, Num, Screen, Subtle } from "@/components/ui";
import { formatKickoff, matchLabel } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { MatchReportSummary } from "@/lib/types";

// Report viewers' home for published match reports. Reads the definer RPC
// (viewers have no direct table access); active members reach the same reports
// from Matchday's recent list.
export default function ViewerReports() {
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

  const count = data?.length ?? 0;

  return (
    <Screen>
      <View className="pt-1">
        <Heading kicker={count > 0 ? `${count} published` : "2026 Season"}>
          Match reports
        </Heading>
      </View>

      {isLoading ? (
        <View className="flex-1 items-center justify-center">
          <MarqueeSpinner />
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(r) => r.game_id}
          onRefresh={refetch}
          refreshing={isRefetching}
          ItemSeparatorComponent={() => <View className="h-3" />}
          contentContainerClassName="py-4"
          ListEmptyComponent={<EmptyState>No match reports yet.</EmptyState>}
          renderItem={({ item }) => <ReportCard report={item} />}
        />
      )}
    </Screen>
  );
}

export function ReportCard({ report }: { report: MatchReportSummary }) {
  return (
    <Link
      href={{ pathname: "/report/[id]", params: { id: report.game_id } }}
      asChild
    >
      <Pressable>
        <Card className="gap-2 p-4">
          <View className="flex-row items-center justify-between">
            <Text
              className="flex-1 font-display text-lg uppercase text-bone"
              numberOfLines={1}
            >
              {matchLabel(report.kickoff_at)}
            </Text>
            <View className="flex-row items-baseline gap-1.5 pl-3">
              <Num className="font-display text-xl text-bone">
                {report.team_a_score}
              </Num>
              <Text className="font-display text-base text-steel">–</Text>
              <Num className="font-display text-xl text-bone">
                {report.team_b_score}
              </Num>
            </View>
          </View>
          <Num className="font-body text-sm text-steel">
            {formatKickoff(report.kickoff_at)}
          </Num>
          {report.summary ? (
            <Subtle>
              {report.summary.length > 90
                ? report.summary.slice(0, 90).trimEnd() + "…"
                : report.summary}
            </Subtle>
          ) : null}
        </Card>
      </Pressable>
    </Link>
  );
}
