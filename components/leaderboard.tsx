import { useQuery } from "@tanstack/react-query";
import { Link, useFocusEffect } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { MarqueeSpinner } from "@/components/motif";
import { EmptyState, Label, MarqueeRank, Num, Subtle } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { LeaderboardRow } from "@/lib/types";

type Board = "table" | "boot";

const SEASON = "2026 Season";

async function fetchLeaderboard(): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase.rpc("get_leaderboard");
  if (error) throw error;
  return (data ?? []) as LeaderboardRow[];
}

/**
 * Kicker for the Table screens, e.g. "2026 Season · 47 players".
 *
 * Shares the ["leaderboard"] cache entry with <Leaderboard> rather than issuing
 * a second RPC — all three read tiers mount both. Degrades to the bare season
 * before the first fetch resolves, so the heading never reflows.
 */
export function useSeasonKicker(): string {
  const { data } = useQuery({ queryKey: ["leaderboard"], queryFn: fetchLeaderboard });
  const n = data?.length ?? 0;
  return n > 0 ? `${SEASON} · ${n} ${n === 1 ? "player" : "players"}` : SEASON;
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

  // Only the read tiers that can open a match report (active + viewer) get
  // tappable rows — pending/rejected can see the standings but no match data,
  // so their rows stay inert. Mirrors the RouteGuard gate on the "player" group.
  const clickable = profile?.status === "active" || profile?.status === "viewer";

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
        <MarqueeSpinner />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center gap-2 px-6">
        <Subtle>Couldn&apos;t load the standings.</Subtle>
        <Text className="text-center font-body text-sm text-steel">
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
        ListEmptyComponent={<EmptyState>No standings yet this season.</EmptyState>}
        renderItem={({ item, index }) => (
          <Row
            row={item}
            rank={index + 1}
            board={board}
            isYou={item.user_id === profile?.id}
            clickable={clickable}
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
              active ? "border-bone bg-bone" : "border-line bg-plank",
            ].join(" ")}
          >
            <Text
              className={[
                "font-display-semi text-xs uppercase tracking-wider",
                active ? "text-night" : "text-steel",
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

// Column layout shared by header + rows.
//
// Every digit below is <Num> (applies fontVariant: tabular-nums, since the
// `tabular-nums` Tailwind class compiles to font-variant-numeric which
// css-interop drops) AND is set in Inter, never Oswald.
//
// Oswald has no `tnum` OpenType feature at all — measured against its hmtx
// table, its digits span 385–550 units per em (16.5% spread; "1" is a third
// narrower than "0"). fontVariant cannot fix a feature the font doesn't ship,
// so an Oswald column jitters no matter what. Inter's digits are proportional
// by default too, but it *has* tnum, so <Num> makes them uniform.
//
// Rule: Oswald for standalone numerals (hero counts, rank badges — centered in
// their own box, so width never matters). Inter for anything in a column.
function TableHeader({ board }: { board: Board }) {
  return (
    <View className="flex-row items-center border-b border-line px-2 pb-2">
      <View className="w-8 items-center">
        <Label>#</Label>
      </View>
      <View className="flex-1 pl-3">
        <Label>Player</Label>
      </View>
      {board === "boot" ? (
        <View className="w-12 items-end">
          <Label>Gls</Label>
        </View>
      ) : (
        <>
          <View className="w-8 items-center">
            <Label>P</Label>
          </View>
          <View className="w-20 items-center">
            <Label>W-D-L</Label>
          </View>
          <View className="w-12 items-end">
            <Label>+/-</Label>
          </View>
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
  clickable,
}: {
  row: LeaderboardRow;
  rank: number;
  board: Board;
  isYou: boolean;
  clickable: boolean;
}) {
  // Boardwalk plank rhythm — alternating board joints underfoot. Deliberately
  // at the edge of perception; it should feel like a surface, not a stripe.
  const plank = rank % 2 === 0 ? "bg-plank/40" : "";

  const body = (
    <View
      className={`flex-row items-center border-b border-line/40 px-2 py-3 ${plank} ${
        isYou ? "bg-wonder/10" : ""
      }`}
    >
      <MarqueeRank rank={rank} />

      <View className="flex-1 flex-row items-center pl-3">
        <Text
          className={`font-display text-base uppercase ${isYou ? "text-wonder" : "text-bone"}`}
          numberOfLines={1}
        >
          {row.display_name}
        </Text>
        {isYou && (
          <Text className="ml-2 font-display-semi text-[10px] uppercase tracking-wider text-wonder">
            You
          </Text>
        )}
      </View>

      {board === "boot" ? (
        <Num className="w-12 text-right font-body-semi text-base text-luna">{row.goals}</Num>
      ) : (
        <>
          <Num className="w-8 text-center font-body text-base text-bone">
            {row.games_played}
          </Num>
          <Num
            className="w-20 text-center font-body text-base text-steel"
            numberOfLines={1}
          >
            {row.wins}-{row.draws}-{row.losses}
          </Num>
          <Num
            className={[
              "w-12 text-right font-body-semi text-base",
              row.plus_minus > 0
                ? "text-wonder"
                : row.plus_minus < 0
                  ? "text-cyclone-lit"
                  : "text-steel",
            ].join(" ")}
          >
            {row.plus_minus > 0 ? "+" : ""}
            {row.plus_minus}
          </Num>
        </>
      )}
    </View>
  );

  if (!clickable) return body;

  return (
    <Link
      href={{
        pathname: "/player/[id]",
        params: { id: row.user_id, name: row.display_name },
      }}
      asChild
    >
      <Pressable>{body}</Pressable>
    </Link>
  );
}
