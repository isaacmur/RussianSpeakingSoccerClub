import { Link } from "expo-router";
import { View } from "react-native";
import { Button, Heading, Screen, Subtle } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function ProfileScreen() {
  const { profile, session, signOut } = useAuth();
  const isAdmin = profile?.role === "admin";

  return (
    <Screen>
      <View className="flex-1 gap-6 pt-8">
        <View className="gap-1">
          <Heading>{profile?.display_name}</Heading>
          <Subtle>{session?.user.email}</Subtle>
          <Subtle>
            {profile?.status}
            {isAdmin ? " · admin" : ""}
          </Subtle>
        </View>

        <View className="rounded-xl border border-line bg-card p-6">
          <Subtle>Your stats & notification toggles load here in Phase 4.</Subtle>
        </View>

        {isAdmin ? (
          <Link href="/admin/members" asChild>
            <Button title="Admin · Members" variant="ghost" />
          </Link>
        ) : null}

        <View className="flex-1 justify-end pb-6">
          <Button title="Sign out" variant="ghost" onPress={signOut} />
        </View>
      </View>
    </Screen>
  );
}
