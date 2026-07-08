import { View } from "react-native";
import { EmptyState, Heading, Screen } from "@/components/ui";

// Shell only. Phase 5 wires published match reports.
export default function ViewerReports() {
  return (
    <Screen>
      <View className="pt-1">
        <Heading kicker="2026 Season">Match reports</Heading>
      </View>
      <View className="flex-1 justify-center">
        <EmptyState>Published match reports load here in Phase 5.</EmptyState>
      </View>
    </Screen>
  );
}
