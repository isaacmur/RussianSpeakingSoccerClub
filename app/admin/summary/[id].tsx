import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { MarqueeSpinner } from "@/components/motif";
import {
  Badge,
  BackButton,
  Button,
  Card,
  Heading,
  Label,
  Num,
  Screen,
  Subtle,
} from "@/components/ui";
import { notify } from "@/lib/dialogs";
import { formatKickoff, matchLabel } from "@/lib/format";
import { supabase } from "@/lib/supabase";
import { palette } from "@/lib/theme";
import {
  Game,
  Goal,
  MatchResult,
  RegistrationWithName,
} from "@/lib/types";

type Side = "A" | "B" | null;

// Per-attendee editing state, seeded from any prior submission.
type PlayerEntry = {
  user_id: string;
  display_name: string;
  team: Side;
  goals: number;
};

export default function AdminSummary() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const qc = useQueryClient();

  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [summary, setSummary] = useState("");
  const [players, setPlayers] = useState<PlayerEntry[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Game + attendees + any existing result/goals, in one query so the form
  // hydrates from a prior submission (an admin can correct a result).
  const { data, isLoading, isError } = useQuery({
    queryKey: ["summary-load", id],
    queryFn: async () => {
      const [gameRes, regsRes, resultRes, goalsRes] = await Promise.all([
        supabase.from("games").select("*").eq("id", id).single(),
        supabase
          .from("registrations")
          .select("*, profiles(display_name)")
          .eq("game_id", id)
          .eq("status", "registered")
          .order("created_at", { ascending: true }),
        supabase.from("match_results").select("*").eq("game_id", id).maybeSingle(),
        supabase.from("goals").select("*").eq("game_id", id),
      ]);
      if (gameRes.error) throw gameRes.error;
      if (regsRes.error) throw regsRes.error;
      if (resultRes.error) throw resultRes.error;
      if (goalsRes.error) throw goalsRes.error;

      return {
        game: gameRes.data as Game,
        regs: (regsRes.data ?? []) as RegistrationWithName[],
        result: resultRes.data as MatchResult | null,
        goals: (goalsRes.data ?? []) as Goal[],
      };
    },
  });

  const game = data?.game ?? null;

  // Which profiles are ghosts (no app account) — to tag walk-ups in the add
  // picker, since attendance often includes players without a login.
  const ghostIdsQ = useQuery({
    queryKey: ["ghost-ids"],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from("ghost_profiles")
        .select("profile_id");
      if (error) throw error;
      return new Set((data as { profile_id: string }[]).map((g) => g.profile_id));
    },
  });

  // Seed the form once from the loaded bundle. A later refetch must not clobber
  // unsaved edits, so this is gated on `hydrated`.
  useEffect(() => {
    if (!data || hydrated) return;
    const goalBy = new Map<string, number>();
    for (const g of data.goals)
      goalBy.set(g.scorer_id, (goalBy.get(g.scorer_id) ?? 0) + g.count);

    setPlayers(
      data.regs.map((r: RegistrationWithName) => ({
        user_id: r.user_id,
        display_name: r.profiles?.display_name ?? "Player",
        team: (r.team as Side) ?? null,
        goals: goalBy.get(r.user_id) ?? 0,
      }))
    );
    if (data.result) {
      setScoreA(data.result.team_a_score);
      setScoreB(data.result.team_b_score);
      setSummary(data.result.summary ?? "");
    }
    setHydrated(true);
  }, [data, hydrated]);

  const setTeam = (user_id: string, team: Side) =>
    setPlayers((prev) =>
      prev.map((p) =>
        p.user_id === user_id
          ? { ...p, team, goals: team === null ? 0 : p.goals }
          : p
      )
    );

  const bumpGoals = (user_id: string, delta: number) =>
    setPlayers((prev) =>
      prev.map((p) =>
        p.user_id === user_id
          ? { ...p, goals: Math.max(0, p.goals + delta) }
          : p
      )
    );

  // A walk-up who showed up but never signed up. Appended unassigned; the admin
  // gives them a side, and submit_match_result upserts their registration.
  const addAttendee = (user_id: string, display_name: string) =>
    setPlayers((prev) =>
      prev.some((p) => p.user_id === user_id)
        ? prev
        : [...prev, { user_id, display_name, team: null, goals: 0 }]
    );

  // Live A/B goal tally from per-scorer counts — a cross-check against the
  // scoreline the admin punched in (they can legitimately differ: own goals).
  const goalTally = useMemo(() => {
    let a = 0;
    let b = 0;
    for (const p of players) {
      if (p.team === "A") a += p.goals;
      else if (p.team === "B") b += p.goals;
    }
    return { a, b };
  }, [players]);

  const submit = useMutation({
    mutationFn: async () => {
      // Send the FULL roster, including unassigned players: submit_match_result
      // treats the payload as authoritative, so a null team clears a no-show and
      // an added walk-up gets a registered row. Filtering here would leave both
      // stale in the database.
      const teams = players.map((p) => ({ user_id: p.user_id, team: p.team }));
      const goals = players
        .filter((p) => p.team !== null && p.goals > 0)
        .map((p) => ({ scorer_id: p.user_id, team: p.team, count: p.goals }));

      const { error } = await supabase.rpc("submit_match_result", {
        p_game_id: id,
        p_team_a_score: scoreA,
        p_team_b_score: scoreB,
        p_summary: summary,
        p_teams: teams,
        p_goals: goals,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      // The standings (player_stats) and every game list depend on this write.
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
      qc.invalidateQueries({ queryKey: ["matchday"] });
      qc.invalidateQueries({ queryKey: ["admin-schedule"] });
      qc.invalidateQueries({ queryKey: ["match-reports"] });
      qc.invalidateQueries({ queryKey: ["report", id] });
      notify("Result saved", "The standings and match report are updated.");
      router.back();
    },
    onError: (e: unknown) =>
      notify("Couldn't save", e instanceof Error ? e.message : String(e)),
  });

  if (isLoading) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Result" }} />
        <View className="flex-1 items-center justify-center">
          <MarqueeSpinner />
        </View>
      </Screen>
    );
  }

  if (isError || !game) {
    return (
      <Screen>
        <Stack.Screen options={{ title: "Result" }} />
        <View className="flex-1 items-center justify-center">
          <Subtle>This game couldn&apos;t be loaded.</Subtle>
        </View>
      </Screen>
    );
  }

  const tallyMismatch =
    goalTally.a !== scoreA || goalTally.b !== scoreB;

  return (
    <Screen fence={false}>
      <Stack.Screen options={{ title: "Enter result" }} />
      <BackButton />
      <ScrollView
        contentContainerClassName="gap-5 py-4"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Heading kicker={formatKickoff(game.kickoff_at)}>{matchLabel(game.kickoff_at)}</Heading>

        {/* Scoreline */}
        <View className="gap-2">
          <Label>Final score</Label>
          <Card className="flex-row items-center justify-around py-5">
            <Stepper label="Team A" value={scoreA} onChange={setScoreA} />
            <Text className="font-display text-2xl text-steel">–</Text>
            <Stepper label="Team B" value={scoreB} onChange={setScoreB} />
          </Card>
        </View>

        {/* Match report text */}
        <View className="gap-2">
          <Label>Match report</Label>
          <TextInput
            className="min-h-[100px] rounded-xl border border-line bg-plank p-3 font-body text-base text-bone"
            style={{ textAlignVertical: "top" }}
            placeholder="How did it play out?"
            placeholderTextColor={palette.steel}
            multiline
            value={summary}
            onChangeText={setSummary}
          />
        </View>

        {/* Team assignment + goals per attendee */}
        <View className="gap-2">
          <View className="flex-row items-center justify-between">
            <Label>Team sheet &amp; goals</Label>
            <Text
              className={`font-display-semi text-[11px] uppercase tracking-wider ${
                tallyMismatch ? "text-luna" : "text-steel"
              }`}
            >
              Goals {goalTally.a}–{goalTally.b}
            </Text>
          </View>

          {players.length === 0 ? (
            <Card className="p-4">
              <Subtle>No one was registered for this game.</Subtle>
            </Card>
          ) : (
            <Card>
              {players.map((p, i) => (
                <PlayerRow
                  key={p.user_id}
                  entry={p}
                  divider={i > 0}
                  onTeam={(t) => setTeam(p.user_id, t)}
                  onBump={(d) => bumpGoals(p.user_id, d)}
                />
              ))}
            </Card>
          )}

          <AddAttendee
            excludeIds={new Set(players.map((p) => p.user_id))}
            ghostIds={ghostIdsQ.data ?? new Set()}
            onAdd={addAttendee}
          />
          <Subtle>
            Someone didn&apos;t show? Leave them with no side — they won&apos;t
            count. Extra players? Add them above.
          </Subtle>
          {tallyMismatch ? (
            <Subtle>
              Per-scorer goals don&apos;t sum to the final score — fine for own
              goals, worth a second look otherwise.
            </Subtle>
          ) : null}
        </View>

        <Button
          title="Save result"
          loading={submit.isPending}
          onPress={() => submit.mutate()}
        />
        <View className="h-4" />
      </ScrollView>
    </Screen>
  );
}

// ── Score stepper ───────────────────────────────────────────────────────────
function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <View className="items-center gap-2">
      <Text className="font-display-semi text-[11px] uppercase tracking-[1.5px] text-steel">
        {label}
      </Text>
      <View className="flex-row items-center gap-3">
        <StepButton label="−" onPress={() => onChange(Math.max(0, value - 1))} />
        <Num className="w-8 text-center font-display text-3xl text-bone">
          {value}
        </Num>
        <StepButton label="+" onPress={() => onChange(value + 1)} />
      </View>
    </View>
  );
}

function StepButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="h-9 w-9 items-center justify-center rounded-lg border border-line bg-plank"
    >
      <Text className="font-display text-xl text-bone">{label}</Text>
    </Pressable>
  );
}

// ── Attendee row: A/B toggle + goal stepper ─────────────────────────────────
function PlayerRow({
  entry,
  divider,
  onTeam,
  onBump,
}: {
  entry: PlayerEntry;
  divider: boolean;
  onTeam: (t: Side) => void;
  onBump: (delta: number) => void;
}) {
  const assigned = entry.team !== null;
  return (
    <View
      className={`gap-2 px-3 py-3 ${divider ? "border-t border-line/50" : ""}`}
    >
      <View className="flex-row items-center justify-between">
        <Text className="flex-1 font-body text-base text-bone" numberOfLines={1}>
          {entry.display_name}
        </Text>
        <View className="flex-row gap-1.5">
          <SideToggle
            label="A"
            active={entry.team === "A"}
            onPress={() => onTeam(entry.team === "A" ? null : "A")}
          />
          <SideToggle
            label="B"
            active={entry.team === "B"}
            onPress={() => onTeam(entry.team === "B" ? null : "B")}
          />
        </View>
      </View>

      {assigned ? (
        <View className="flex-row items-center justify-between pl-1">
          <Text className="font-display-semi text-[11px] uppercase tracking-wider text-steel">
            Goals
          </Text>
          <View className="flex-row items-center gap-3">
            <StepButton label="−" onPress={() => onBump(-1)} />
            <Num className="w-6 text-center font-body-semi text-lg text-luna">
              {entry.goals}
            </Num>
            <StepButton label="+" onPress={() => onBump(1)} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function SideToggle({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`h-8 w-8 items-center justify-center rounded-lg border ${
        active ? "border-wonder bg-wonder" : "border-line bg-plank"
      }`}
    >
      <Text
        className={`font-display text-sm ${active ? "text-night" : "text-steel"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

// ── Add a walk-up ───────────────────────────────────────────────────────────
// Search every active profile (members + ghosts) and drop one who showed up but
// never signed up onto the team sheet. Mirrors the game-detail add picker.
type RosterEntry = { id: string; display_name: string };

function AddAttendee({
  excludeIds,
  ghostIds,
  onAdd,
}: {
  excludeIds: Set<string>;
  ghostIds: Set<string>;
  onAdd: (userId: string, displayName: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const rosterQ = useQuery<RosterEntry[]>({
    queryKey: ["eligible-roster"],
    enabled: open,
    queryFn: async (): Promise<RosterEntry[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("status", "active")
        .order("display_name", { ascending: true });
      if (error) throw error;
      return data as RosterEntry[];
    },
  });

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const all: RosterEntry[] = rosterQ.data ?? [];
    const list = all.filter((p: RosterEntry) => !excludeIds.has(p.id));
    const filtered = needle
      ? list.filter((p: RosterEntry) =>
          p.display_name.toLowerCase().includes(needle)
        )
      : list;
    return filtered.slice(0, 40);
  }, [rosterQ.data, excludeIds, q]);

  return (
    <Card className="gap-3 p-4">
      <Pressable
        onPress={() => setOpen((o) => !o)}
        className="flex-row items-center justify-between"
      >
        <Text className="font-display text-base uppercase tracking-wide text-luna">
          Add player who showed up
        </Text>
        <Text className="font-display-semi text-xs uppercase tracking-wider text-steel">
          {open ? "Close" : "Open"}
        </Text>
      </Pressable>

      {open ? (
        <View className="gap-2">
          <TextInput
            value={q}
            onChangeText={setQ}
            placeholder="Search players…"
            placeholderTextColor={palette.steel}
            autoCorrect={false}
            className="h-11 rounded-lg border border-line bg-night px-3 font-body text-base text-bone"
          />
          {rosterQ.isLoading ? (
            <Subtle>Loading roster…</Subtle>
          ) : matches.length === 0 ? (
            <Subtle>No players{q ? ` for “${q}”` : ""}.</Subtle>
          ) : (
            matches.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => onAdd(p.id, p.display_name)}
                className="flex-row items-center justify-between rounded-lg border border-line bg-night px-3 py-2.5"
              >
                <Text className="font-body text-base text-bone">
                  {p.display_name}
                </Text>
                {ghostIds.has(p.id) ? (
                  <Badge color={palette.steel}>no app</Badge>
                ) : null}
              </Pressable>
            ))
          )}
        </View>
      ) : null}
    </Card>
  );
}
