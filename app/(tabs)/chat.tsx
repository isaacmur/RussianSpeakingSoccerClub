import { View } from "react-native";
import { EmptyState, Heading, Screen } from "@/components/ui";

// Shell only. The interior gets built in Phase 6 — in this language, rather
// than retrofitted into it.
export default function Chat() {
  return (
    <Screen>
      <View className="pt-1">
        <Heading kicker="League chat">Clubhouse</Heading>
      </View>
      <View className="flex-1 justify-center">
        <EmptyState>League &amp; game chat load here in Phase 6.</EmptyState>
      </View>
    </Screen>
  );
}
