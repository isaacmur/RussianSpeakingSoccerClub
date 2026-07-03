import { View } from "react-native";
import { Button, Heading, Screen, Subtle } from "@/components/ui";
import { useAuth } from "@/lib/auth";

// Pending / rejected users get the leaderboard only. Real standings are wired
// to get_leaderboard() in phase 2 — this is the phase-1 stub.
export default function PendingLeaderboard() {
  const { profile, signOut } = useAuth();
  const rejected = profile?.status === "rejected";

  return (
    <Screen>
      <View className="flex-1 justify-center gap-4">
        <Heading>Leaderboard</Heading>
        {rejected ? (
          <Subtle>
            Your request to join wasn&apos;t approved. You can still view the
            season standings.
          </Subtle>
        ) : (
          <Subtle>
            You&apos;re on the list! An admin will review your request soon. Until
            then you can watch the season standings here.
          </Subtle>
        )}
        <View className="rounded-xl border border-line bg-card p-6">
          <Subtle>Standings load here in Phase 2.</Subtle>
        </View>
        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </View>
    </Screen>
  );
}
