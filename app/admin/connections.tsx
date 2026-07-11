import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { FlatList, Pressable, Text, TextInput, View } from "react-native";
import { MarqueeSpinner } from "@/components/motif";
import { confirmDestructive, notify } from "@/lib/dialogs";
import {
  Badge,
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
import { palette } from "@/lib/theme";
import { ClaimCandidate, GhostProfile, Profile } from "@/lib/types";

// The Connection panel. When a real person signs up, their fresh account lands
// as a normal `pending` profile with no history. This screen merges that account
// into the matching imported ghost so the ghost's stats/registrations become
// theirs — always admin-confirmed, pre-highlighting the likely match.
//
// Left: real signups (pending, plus any already-admitted account that still
// matches a ghost). Right/below: the unclaimed-ghost reference list.
export default function AdminConnections() {
  const qc = useQueryClient();
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["admin-connections"],
    queryFn: async () => {
      const [candRes, pendingRes, ghostRes] = await Promise.all([
        supabase.rpc("list_claim_candidates"),
        // Ghosts are status='active', so `pending` is real signups only.
        supabase
          .from("profiles")
          .select("*")
          .eq("status", "pending")
          .order("created_at", { ascending: true }),
        supabase
          .from("ghost_profiles")
          .select("*")
          .order("approx_appearances", { ascending: false, nullsFirst: false }),
      ]);
      if (candRes.error) throw candRes.error;
      if (pendingRes.error) throw pendingRes.error;
      if (ghostRes.error) throw ghostRes.error;

      const candidates = (candRes.data ?? []) as ClaimCandidate[];
      const pending = (pendingRes.data ?? []) as Profile[];
      const ghosts = (ghostRes.data ?? []) as GhostProfile[];

      const candById = new Map(candidates.map((c) => [c.real_id, c]));

      // Left column: every pending signup, plus any matched account that isn't
      // pending (already admitted but never linked), de-duplicated by real id.
      const seen = new Set<string>();
      const rows: SignupRow[] = [];
      for (const p of pending) {
        seen.add(p.id);
        const c = candById.get(p.id);
        rows.push({
          id: p.id,
          name: p.display_name,
          email: c?.real_email ?? null,
          candidate: c ?? null,
        });
      }
      for (const c of candidates) {
        if (seen.has(c.real_id)) continue;
        rows.push({
          id: c.real_id,
          name: c.real_name,
          email: c.real_email,
          candidate: c,
        });
      }

      return { rows, ghosts };
    },
  });

  const claim = useMutation({
    mutationFn: async ({ real, ghost }: { real: string; ghost: string }) => {
      const { error } = await supabase.rpc("claim_ghost", {
        p_real: real,
        p_ghost: ghost,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setPickerFor(null);
      qc.invalidateQueries({ queryKey: ["admin-connections"] });
      qc.invalidateQueries({ queryKey: ["admin-members"] });
      qc.invalidateQueries({ queryKey: ["leaderboard"] });
    },
    onError: (e: unknown) =>
      notify("Link failed", e instanceof Error ? e.message : String(e)),
  });

  const confirmClaim = (realName: string, ghostName: string, real: string, ghost: string) =>
    confirmDestructive(
      "Link accounts?",
      `Merge ${ghostName}'s history into ${realName} and remove the ghost. This can't be undone.`,
      "Link",
      () => claim.mutate({ real, ghost })
    );

  if (isLoading) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <MarqueeSpinner />
        </View>
      </Screen>
    );
  }

  const rows = data?.rows ?? [];
  const ghosts = data?.ghosts ?? [];

  return (
    <Screen>
      <View className="pt-1">
        <Heading kicker={`${ghosts.length} unclaimed`}>Connections</Heading>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        onRefresh={refetch}
        refreshing={isRefetching}
        contentContainerClassName="gap-3 py-3"
        ListHeaderComponent={
          <Text className="pb-1 font-body text-sm text-steel">
            Merge a new signup into their imported ghost. Admitting the member to
            the roster is still done separately on Members.
          </Text>
        }
        ListEmptyComponent={
          <EmptyState>No signups waiting to be linked.</EmptyState>
        }
        renderItem={({ item }) => (
          <SignupCard
            row={item}
            ghosts={ghosts}
            pickerOpen={pickerFor === item.id}
            busy={claim.isPending}
            onTogglePicker={() =>
              setPickerFor(pickerFor === item.id ? null : item.id)
            }
            onClaim={(ghost, ghostName) =>
              confirmClaim(item.name, ghostName, item.id, ghost)
            }
          />
        )}
        ListFooterComponent={<GhostReference ghosts={ghosts} />}
      />
    </Screen>
  );
}

type SignupRow = {
  id: string;
  name: string;
  email: string | null;
  candidate: ClaimCandidate | null;
};

function SignupCard({
  row,
  ghosts,
  pickerOpen,
  busy,
  onTogglePicker,
  onClaim,
}: {
  row: SignupRow;
  ghosts: GhostProfile[];
  pickerOpen: boolean;
  busy: boolean;
  onTogglePicker: () => void;
  onClaim: (ghostId: string, ghostName: string) => void;
}) {
  const suggested = row.candidate;

  return (
    <Card className="gap-3 p-4">
      <View>
        <Text className="font-display text-lg uppercase text-bone">{row.name}</Text>
        {row.email ? (
          <Text className="font-body text-sm text-steel">{row.email}</Text>
        ) : null}
      </View>

      {suggested ? (
        <View className="gap-2 rounded-xl border border-luna/40 bg-night p-3">
          <View className="flex-row items-center gap-2">
            <Text className="font-display-semi text-[11px] uppercase tracking-wider text-luna">
              ★ Suggested · {suggested.match_by} match
            </Text>
          </View>
          <View className="flex-row items-center justify-between gap-3">
            <Text className="flex-1 font-body text-base text-bone">
              {suggested.suggested_name}
            </Text>
            <Button
              title="Link"
              loading={busy}
              onPress={() =>
                onClaim(suggested.suggested_ghost, suggested.suggested_name)
              }
            />
          </View>
        </View>
      ) : (
        <Subtle>No automatic match. Pick the ghost by hand.</Subtle>
      )}

      <Pressable onPress={onTogglePicker} hitSlop={8}>
        <Text className="font-display-semi text-xs uppercase tracking-wider text-steel">
          {pickerOpen
            ? "Close"
            : suggested
              ? "Link to a different ghost…"
              : "Choose a ghost…"}
        </Text>
      </Pressable>

      {pickerOpen ? (
        <GhostPicker
          ghosts={ghosts}
          busy={busy}
          onPick={(g) => onClaim(g.profile_id, g.canonical_name)}
        />
      ) : null}
    </Card>
  );
}

// Searchable list of every unclaimed ghost, for a manual link.
function GhostPicker({
  ghosts,
  busy,
  onPick,
}: {
  ghosts: GhostProfile[];
  busy: boolean;
  onPick: (g: GhostProfile) => void;
}) {
  const [q, setQ] = useState("");

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = needle
      ? ghosts.filter((g) =>
          [g.canonical_name, g.nicknames, g.tentative_email]
            .filter(Boolean)
            .some((s) => s!.toLowerCase().includes(needle))
        )
      : ghosts;
    return list.slice(0, 40);
  }, [ghosts, q]);

  return (
    <View className="gap-2 border-t border-line pt-3">
      <TextInput
        value={q}
        onChangeText={setQ}
        placeholder="Search ghosts…"
        placeholderTextColor={palette.steel}
        autoCorrect={false}
        className="h-11 rounded-lg border border-line bg-night px-3 font-body text-base text-bone"
      />
      {matches.length === 0 ? (
        <Subtle>No ghost matches “{q}”.</Subtle>
      ) : (
        matches.map((g) => (
          <Pressable
            key={g.profile_id}
            disabled={busy}
            onPress={() => onPick(g)}
            className={`flex-row items-center justify-between rounded-lg border border-line bg-night px-3 py-2.5 ${
              busy ? "opacity-40" : ""
            }`}
          >
            <View className="flex-1 pr-3">
              <Text className="font-body text-base text-bone">
                {g.canonical_name}
              </Text>
              {g.tentative_email ? (
                <Text className="font-body text-xs text-steel">
                  {g.tentative_email}
                </Text>
              ) : null}
            </View>
            {typeof g.approx_appearances === "number" ? (
              <Num className="font-body-semi text-xs text-steel">
                ~{g.approx_appearances}
              </Num>
            ) : null}
          </Pressable>
        ))
      )}
    </View>
  );
}

// Read-only reference so the admin can see who's still an unclaimed ghost.
function GhostReference({ ghosts }: { ghosts: GhostProfile[] }) {
  if (ghosts.length === 0) return null;
  return (
    <View className="gap-2 pt-4">
      <Label>Unclaimed ghosts · {ghosts.length}</Label>
      <Card>
        {ghosts.map((g, i) => (
          <View
            key={g.profile_id}
            className={`flex-row items-center justify-between px-4 py-2.5 ${
              i > 0 ? "border-t border-line/50" : ""
            }`}
          >
            <View className="flex-1 pr-3">
              <Text className="font-body text-base text-bone">
                {g.canonical_name}
              </Text>
              {g.tentative_email ? (
                <Text className="font-body text-xs text-steel">
                  {g.tentative_email}
                </Text>
              ) : null}
            </View>
            <Badge color={palette.steel}>ghost</Badge>
          </View>
        ))}
      </Card>
    </View>
  );
}
