// Family subpath, not the package root — the root pulls in every icon TTF.
import Feather from "@expo/vector-icons/Feather";
import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";
import { BulbString, Button, Card, Heading, Label, Screen, Subtle } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { palette } from "@/lib/theme";

const ADMIN_LINKS = [
  { href: "/admin/schedule", label: "Schedule" },
  { href: "/admin/series", label: "Series" },
  { href: "/admin/members", label: "Members" },
  { href: "/admin/baselines", label: "Baselines" },
] as const;

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
      <View className="flex-1 gap-5 pt-2">
        <View>
          <Heading kicker={kicker}>{profile?.display_name ?? "Player"}</Heading>
          <Subtle>{session?.user.email}</Subtle>
        </View>

        <Card className="p-6">
          <Subtle>Your stats &amp; notification toggles load here in Phase 4.</Subtle>
        </Card>

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

        <View className="flex-1 justify-end pb-6">
          <Button title="Sign out" variant="ghost" onPress={signOut} />
        </View>
      </View>
    </Screen>
  );
}
