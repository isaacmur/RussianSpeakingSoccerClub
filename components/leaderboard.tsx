import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { Subtle } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { LeaderboardRow } from "@/lib/types";

type Board = "table" | "boot";

async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase.rpc("get_leaderboard");
  if (error) throw error;
  return (data ?? []) as LeaderboardRow[];
}

// The signature element: the season standings rendered as a real league table.
// Reused by every read tier (pending / viewer / active) — all read through the
// get_leaderboard() RPC, so no client needs direct select on the stat tables.
export function Leaderboard() {
  const { profile } = useAuth();
  const [board, setBoard] = useState<Board>("table");

  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: fetchLeaderboard,
  });

  // player_stats isn't realtime — refresh whenever the screen regains focus
  // (e.g. after an admin submits a summary elsewhere).
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch])
  );

  // The RPC returns rows sorted by plus_minus; Golden Boot re-sorts by goals.
  const rows = useMemo(() => {
    const list = [...(data ?? [])];
    if (board === "boot") {
      list.sort((a, b) => b.goals - a.goals || b.plus_minus - a.plus_minus);
    }
    return list;
  }, [data, board]);

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator color="#1F7A46" />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center gap-2 px-6">
        <Subtle>Couldn&apos;t load the standings.</Subtle>
        <Text className="text-center text-sm text-mute">
          {error instanceof Error ? error.message : String(error)}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1">
      <BoardTabs board={board} onChange={setBoard} />
      <TableHeader board={board} />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.user_id}
        onRefresh={refetch}
        refreshing={isRefetching}
        ItemSeparatorComponent={() => <View className="h-px bg-line" />}
        ListEmptyComponent={
          <View className="items-center py-16">
            <Subtle>No standings yet this season.</Subtle>
          </View>
        }
        renderItem={({ item, index }) => (
          <Row
            row={item}
            rank={index + 1}
            board={board}
            isYou={item.user_id === profile?.id}
          />
        )}
      />
    </View>
  );
}

function BoardTabs({
  board,
  onChange,
}: {
  board: Board;
  onChange: (b: Board) => void;
}) {
  const tabs: { key: Board; label: string }[] = [
    { key: "table", label: "Plus-Minus" },
    { key: "boot", label: "Golden Boot" },
  ];
  return (
    <View className="flex-row gap-2 py-3">
      {tabs.map((t) => {
        const active = t.key === board;
        return (
          <Pressable
            key={t.key}
            onPress={() => onChange(t.key)}
            className={[
              "rounded-full border px-4 py-1.5",
              active ? "border-ink bg-ink" : "border-line bg-card",
            ].join(" ")}
          >
            <Text
              className={[
                "font-display text-sm uppercase tracking-wide",
                active ? "text-white" : "text-mute",
              ].join(" ")}
            >
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Column layout shared by header + rows. Tabular numerals keep stats aligned.
function TableHeader({ board }: { board: Board }) {
  return (
    <View className="flex-row items-center border-b border-line px-2 pb-2">
      <Text className="w-8 text-center text-xs uppercase text-mute">#</Text>
      <Text className="flex-1 pl-2 text-xs uppercase text-mute">Player</Text>
      {board === "boot" ? (
        <Text className="w-12 text-right text-xs uppercase text-mute">Gls</Text>
      ) : (
        <>
          <Text className="w-8 text-center text-xs uppercase text-mute">P</Text>
          <Text className="w-16 text-center text-xs uppercase text-mute">
            W-D-L
          </Text>
          <Text className="w-12 text-right text-xs uppercase text-mute">+/-</Text>
        </>
      )}
    </View>
  );
}

function Row({
  row,
  rank,
  board,
  isYou,
}: {
  row: LeaderboardRow;
  rank: number;
  board: Board;
  isYou: boolean;
}) {
  return (
    <View
      className={[
        "flex-row items-center px-2 py-3",
        isYou ? "bg-pitch/10" : "",
      ].join(" ")}
    >
      {/* squad-number rank badge */}
      <View className="w-8 items-center">
        <View className="h-7 w-7 items-center justify-center rounded-md bg-ink">
          <Text className="font-display text-sm text-white tabular-nums">
            {rank}
          </Text>
        </View>
      </View>

      <View className="flex-1 flex-row items-center pl-2">
        <Text
          className="font-display text-base uppercase text-ink"
          numberOfLines={1}
        >
          {row.display_name}
        </Text>
        {isYou && (
          <Text className="ml-2 font-display text-xs uppercase text-pitch">
            You
          </Text>
        )}
      </View>

      {board === "boot" ? (
        <Text className="w-12 text-right font-display text-base text-boot tabular-nums">
          {row.goals}
        </Text>
      ) : (
        <>
          <Text className="w-8 text-center text-base text-ink tabular-nums">
            {row.games_played}
          </Text>
          <Text className="w-16 text-center text-base text-mute tabular-nums">
            {row.wins}-{row.draws}-{row.losses}
          </Text>
          <Text
            className={[
              "w-12 text-right font-display text-base tabular-nums",
              row.plus_minus > 0
                ? "text-pitch"
                : row.plus_minus < 0
                  ? "text-boot"
                  : "text-mute",
            ].join(" ")}
          >
            {row.plus_minus > 0 ? "+" : ""}
            {row.plus_minus}
          </Text>
        </>
      )}
    </View>
  );
}
