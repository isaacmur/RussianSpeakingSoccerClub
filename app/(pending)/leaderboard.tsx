import { Text, View } from "react-native";
import { Leaderboard, useSeasonKicker } from "@/components/leaderboard";
import { Card, Heading, Screen, SignOutLink } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { palette } from "@/lib/theme";

// Pending / rejected users get the leaderboard only — served entirely through
// the get_leaderboard() security-definer RPC (they have no table read access).
export default function PendingLeaderboard() {
  const { profile, signOut } = useAuth();
  const rejected = profile?.status === "rejected";

  return (
    <Screen>
      <View className="flex-row items-start justify-between pt-1">
        <Heading kicker={useSeasonKicker()}>Table</Heading>
        <SignOutLink onPress={signOut} />
      </View>

      {/* Rejection burns cyclone; waiting glows luna — lamplight, not alarm. */}
      <Card
        className="mt-3 p-4"
        glowColor={rejected ? palette.cyclone : palette.luna}
      >
        <Text
          className={`font-display-semi text-[11px] uppercase tracking-[1.5px] ${
            rejected ? "text-cyclone-lit" : "text-luna"
          }`}
        >
          {rejected ? "Not approved" : "Awaiting approval"}
        </Text>
        <Text className="mt-1.5 font-body text-sm leading-5 text-steel">
          {rejected
            ? "Your request to join wasn't approved. You can still follow the season standings."
            : "You're on the list — an admin will review your request soon. Until then, follow the season standings here."}
        </Text>
      </Card>

      <Leaderboard />
    </Screen>
  );
}
