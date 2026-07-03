import { View } from "react-native";
import { Heading, Screen, Subtle } from "@/components/ui";

export default function MemberLeaderboard() {
  return (
    <Screen>
      <View className="flex-1 justify-center gap-4">
        <Heading>Table</Heading>
        <View className="rounded-xl border border-line bg-card p-6">
          <Subtle>Standings load here in Phase 2.</Subtle>
        </View>
      </View>
    </Screen>
  );
}
