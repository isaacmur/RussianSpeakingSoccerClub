// Family subpath, not the package root — the root pulls in every icon TTF.
import Feather from "@expo/vector-icons/Feather";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "expo-router";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import {
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
import { supabase } from "@/lib/supabase";
import { palette } from "@/lib/theme";
import { LeaderboardRow, NotificationPrefs } from "@/lib/types";

const ADMIN_LINKS = [
  { href: "/admin/schedule", label: "Schedule" },
  { href: "/admin/series", label: "Series" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/baselines", label: "Baselines" },
] as const;

type PrefKey = keyof Omit<NotificationPrefs, "user_id">;

// Display order mirrors how often each fires; `spot_opened` has no toggle by
// design — being pulled off the waitlist always notifies.
const PREF_ITEMS: { key: PrefKey; label: string }[] = [
  { key: "registration_open", label: "Registration opens" },
  { key: "game_filled", label: "Game filled" },
  { key: "needs_players", label: "Needs players" },
  { key: "kickoff_reminder", label: "Kickoff reminder" },
  { key: "results_posted", label: "Results posted" },
  { key: "chat_mentions", label: "Chat mentions" },
];

export default function ProfileScreen() {
  const { profile, session, signOut } = useAuth();
  const isAdmin = profile?.role === "admin";

  // The kicker promotes status/role out of body copy — it's the context the
  // display name doesn't carry.
  const kicker = profile
    ? `${profile.status}${isAdmin ? " · admin" : ""}`
    : undefined;

  return (
    <Screen>
      <ScrollView
        contentContainerClassName="gap-5 pb-6 pt-2"
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Heading kicker={kicker}>{profile?.display_name ?? "Player"}</Heading>
          <Subtle>{session?.user.email}</Subtle>
        </View>

        <SeasonStats userId={profile?.id} />

        <NotificationToggles userId={profile?.id} />

        {isAdmin ? (
          <>
            <BulbString />
            <View className="gap-2">
              {/* luna is the admin accent — lamplight, not neon. An admin surface
                  should never look like a member surface. */}
              <Label>Admin</Label>
              {ADMIN_LINKS.map((l) => (
                <Link key={l.href} href={l.href} asChild>
                  <Pressable>
                    <Card className="flex-row items-center justify-between p-4">
                      <Text className="font-display text-base uppercase tracking-wide text-luna">
                        {l.label}
                      </Text>
                      <Feather name="chevron-right" size={18} color={palette.steel} />
                    </Card>
                  </Pressable>
                </Link>
              ))}
            </View>
          </>
        ) : null}

        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </ScrollView>
    </Screen>
  );
}

// ── Season stats ──────────────────────────────────────────────────────────
// Your row out of the same ["leaderboard"] cache the Table screen fills — no
// second RPC, and it stays consistent with the standings.
function SeasonStats({ userId }: { userId?: string }) {
  const { data } = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async (): Promise<LeaderboardRow[]> => {
      const { data, error } = await supabase.rpc("get_leaderboard");
      if (error) throw error;
      return (data ?? []) as LeaderboardRow[];
    },
  });

  const rows: LeaderboardRow[] = data ?? [];
  const idx = rows.findIndex((r) => r.user_id === userId);
  const me = idx >= 0 ? rows[idx] : null;

  return (
    <View className="gap-2">
      <Label>{me ? `This season · #${idx + 1} on the table` : "This season"}</Label>
      <Card className="flex-row justify-between px-5 py-4">
        {me ? (
          <>
            <Stat label="P" value={String(me.games_played)} />
            <Stat label="W-D-L" value={`${me.wins}-${me.draws}-${me.losses}`} />
            <Stat
              label="+/-"
              value={`${me.plus_minus > 0 ? "+" : ""}${me.plus_minus}`}
              color={
                me.plus_minus > 0
                  ? palette.wonder
                  : me.plus_minus < 0
                    ? palette.cycloneLit
                    : palette.bone
              }
            />
            <Stat label="Gls" value={String(me.goals)} color={palette.luna} />
          </>
        ) : (
          <Subtle>No games on your record yet this season.</Subtle>
        )}
      </Card>
    </View>
  );
}

function Stat({
  label,
  value,
  color = palette.bone,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <View className="items-center gap-1">
      <Num className="font-body-semi text-xl" style={{ color }}>
        {value}
      </Num>
      <Label>{label}</Label>
    </View>
  );
}

// ── Notification toggles ──────────────────────────────────────────────────
// One row in notification_prefs per user (created by the sign-up trigger);
// RLS np_self_all scopes reads and writes to it. Toggles flip optimistically —
// a switch that lags its tap reads as broken.
function NotificationToggles({ userId }: { userId?: string }) {
  const qc = useQueryClient();

  const prefsQ = useQuery({
    queryKey: ["notification-prefs"],
    enabled: !!userId,
    queryFn: async (): Promise<NotificationPrefs | null> => {
      const { data, error } = await supabase
        .from("notification_prefs")
        .select("*")
        .maybeSingle();
      if (error) throw error;
      return data as NotificationPrefs | null;
    },
  });

  const toggle = useMutation({
    mutationFn: async (patch: { key: PrefKey; value: boolean }) => {
      // Upsert, not update: heals a missing row (pre-trigger accounts) instead
      // of silently updating zero rows.
      const { error } = await supabase
        .from("notification_prefs")
        .upsert(
          { user_id: userId!, [patch.key]: patch.value },
          { onConflict: "user_id" }
        );
      if (error) throw error;
    },
    onMutate: async (patch: { key: PrefKey; value: boolean }) => {
      await qc.cancelQueries({ queryKey: ["notification-prefs"] });
      qc.setQueryData<NotificationPrefs | null>(
        ["notification-prefs"],
        (old?: NotificationPrefs | null) =>
          old ? { ...old, [patch.key]: patch.value } : old
      );
    },
    onError: () => qc.invalidateQueries({ queryKey: ["notification-prefs"] }),
  });

  // Missing row = server defaults = everything on.
  const value = (key: PrefKey): boolean => prefsQ.data?.[key] ?? true;

  return (
    <View className="gap-2">
      <Label>Notifications</Label>
      <Card>
        {PREF_ITEMS.map((item, i) => (
          <View
            key={item.key}
            className={`flex-row items-center justify-between px-4 py-3 ${
              i > 0 ? "border-t border-line/50" : ""
            }`}
          >
            <Text className="font-body text-base text-bone">{item.label}</Text>
            <Switch
              value={value(item.key)}
              disabled={!userId || prefsQ.isLoading}
              onValueChange={(v) => toggle.mutate({ key: item.key, value: v })}
              trackColor={{ false: palette.line, true: palette.wonder }}
              thumbColor={palette.bone}
              ios_backgroundColor={palette.line}
            />
          </View>
        ))}
      </Card>
      <Subtle>Waitlist promotions always notify — that spot is yours.</Subtle>
    </View>
  );
}
