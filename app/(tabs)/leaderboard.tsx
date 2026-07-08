import { View } from "react-native";
import { Leaderboard } from "@/components/leaderboard";
import { Heading, Screen } from "@/components/ui";

export default function MemberLeaderboard() {
  return (
    <Screen>
      <View className="pt-1">
        <Heading>Table</Heading>
      </View>
      <Leaderboard />
    </Screen>
  );
}
