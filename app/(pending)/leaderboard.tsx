import { Text, View } from "react-native";
import { Leaderboard } from "@/components/leaderboard";
import { Button, Heading, Screen } from "@/components/ui";
import { useAuth } from "@/lib/auth";

// Pending / rejected users get the leaderboard only — served entirely through
// the get_leaderboard() security-definer RPC (they have no table read access).
export default function PendingLeaderboard() {
  const { profile, signOut } = useAuth();
  const rejected = profile?.status === "rejected";

  return (
    <Screen>
      <View className="flex-row items-center justify-between pt-1">
        <Heading>Table</Heading>
        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </View>

      <View className="mt-2 rounded-xl border border-line bg-card p-3">
        <Text className="text-sm text-mute">
          {rejected
            ? "Your request to join wasn't approved. You can still follow the season standings."
            : "You're on the list — an admin will review your request soon. Until then, follow the season standings here."}
        </Text>
      </View>

      <Leaderboard />
    </Screen>
  );
}
