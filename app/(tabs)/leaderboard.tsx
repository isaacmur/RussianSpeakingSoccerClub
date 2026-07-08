import { View } from "react-native";
import { Leaderboard, useSeasonKicker } from "@/components/leaderboard";
import { Heading, Screen } from "@/components/ui";

export default function MemberLeaderboard() {
  return (
    <Screen>
      <View className="pt-1">
        <Heading kicker={useSeasonKicker()}>Table</Heading>
      </View>
      <Leaderboard />
    </Screen>
  );
}
