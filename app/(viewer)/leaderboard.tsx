import { View } from "react-native";
import { Leaderboard, useSeasonKicker } from "@/components/leaderboard";
import { Heading, Screen, SignOutLink } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function ViewerLeaderboard() {
  const { signOut } = useAuth();
  return (
    <Screen>
      <View className="flex-row items-start justify-between pt-1">
        <Heading kicker={useSeasonKicker()}>Table</Heading>
        <SignOutLink onPress={signOut} />
      </View>
      <Leaderboard />
    </Screen>
  );
}
