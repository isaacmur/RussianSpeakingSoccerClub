import { useQuery } from "@tanstack/react-query";
import { Link, Stack, useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { MarqueeSpinner } from "@/components/motif";
import {
  BackButton,
  BulbString,
  Button,
  Card,
  Heading,
  Label,
  Num,
  Screen,
  Subtle,
} from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { formatKickoff, matchLabel } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { palette } from "@/lib/theme";
import { MatchReport, ReportRosterEntry } from "@/lib/types";

export default function ReportDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { profile } = useAuth();
  const isAdmin = profile?.role === "admin";

  const { data, isLoading, isError } = useQuery({
    queryKey: ["report", id],
    queryFn: async (): Promise<MatchReport> => {
      const { data, error } = await supabase.rpc("get_match_report", {
        p_game_id: id,
      });
      if (error) throw error;
      return data as MatchReport;
    },
  });

  if (isLoading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Report" }} />
        <View className="flex-1 items-center justify-center">
          <MarqueeSpinner />
        </View>
      </Screen>
    );
  }

  const game = data?.game ?? null;
  const result = data?.result ?? null;

  if (isError || !game) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Report" }} />
        <BackButton />
        <View className="flex-1 items-center justify-center">
          <Subtle>This report couldn&apos;t be loaded.</Subtle>
        </View>
      </Screen>
    );
  }

  const roster: ReportRosterEntry[] = data?.roster ?? [];
  const teamA = roster.filter((r) => r.team === "A");
  const teamB = roster.filter((r) => r.team === "B");

  return (
    <Screen>
      <Stack.Screen options={{ title: matchLabel(game.kickoff_at) }} />
      <BackButton />
      <ScrollView
        contentContainerClassName="gap-5 py-4"
        showsVerticalScrollIndicator={false}
      >
        <Heading kicker={formatKickoff(game.kickoff_at)}>{matchLabel(game.kickoff_at)}</Heading>

        {isAdmin ? (
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Link href={{ pathname: "/admin/summary/[id]", params: { id } }} asChild>
                <Button title="Edit result" variant="ghost" />
              </Link>
            </View>
            <View className="flex-1">
              <Link href={{ pathname: "/admin/game/[id]", params: { id } }} asChild>
                <Button title="Edit game" variant="ghost" />
              </Link>
            </View>
          </View>
        ) : null}

        {result ? (
          <>
            {/* Scoreboard: the two sides and the final line. Winner burns wonder. */}
            <Card className="flex-row items-center justify-center gap-4 py-6">
              <SideScore
                label="Team A"
                score={result.team_a_score}
                won={result.team_a_score > result.team_b_score}
              />
              <Text className="font-display text-2xl text-steel">–</Text>
              <SideScore
                label="Team B"
                score={result.team_b_score}
                won={result.team_b_score > result.team_a_score}
              />
            </Card>

            {result.summary ? (
              <View className="gap-2">
                <Label>Match report</Label>
                <Card className="p-4">
                  <Text className="font-body text-base leading-6 text-bone">
                    {result.summary}
                  </Text>
                </Card>
              </View>
            ) : null}

            <BulbString />

            <View className="flex-row gap-3">
              <TeamSheet title="Team A" rows={teamA} />
              <TeamSheet title="Team B" rows={teamB} />
            </View>
          </>
        ) : (
          <Card className="p-4">
            <Subtle>
              The result for this game hasn&apos;t been posted yet.
            </Subtle>
          </Card>
        )}
      </ScrollView>
    </Screen>
  );
}

function SideScore({
  label,
  score,
  won,
}: {
  label: string;
  score: number;
  won: boolean;
}) {
  return (
    <View className="items-center gap-1">
      <Num
        className={`font-display text-5xl ${won ? "text-wonder" : "text-bone"}`}
      >
        {score}
      </Num>
      <Text className="font-display-semi text-[11px] uppercase tracking-[1.5px] text-steel">
        {label}
      </Text>
    </View>
  );
}

// One team's sheet — names with a goal tally per scorer. Half-width, sits beside
// its opposite number.
function TeamSheet({
  title,
  rows,
}: {
  title: string;
  rows: ReportRosterEntry[];
}) {
  return (
    <View className="flex-1 gap-2">
      <Label>{title}</Label>
      <Card>
        {rows.length === 0 ? (
          <View className="p-3">
            <Subtle>—</Subtle>
          </View>
        ) : (
          rows.map((r, i) => (
            <View
              key={r.user_id}
              className={`flex-row items-center justify-between px-3 py-2.5 ${
                i > 0 ? "border-t border-line/50" : ""
              }`}
            >
              <Text
                className="flex-1 font-body text-sm text-bone"
                numberOfLines={1}
              >
                {r.display_name}
              </Text>
              {r.goals > 0 ? (
                <View className="ml-2 flex-row items-center gap-1">
                  <View
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: palette.luna }}
                  />
                  <Num className="font-body-semi text-sm text-luna">
                    {r.goals}
                  </Num>
                </View>
              ) : null}
            </View>
          ))
        )}
      </Card>
    </View>
  );
}
