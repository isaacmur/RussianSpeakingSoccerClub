import { View } from "react-native";
import { EmptyState, Heading, Screen } from "@/components/ui";

// Shell only. Phase 4 wires the notification center and the unread badge; the
// kicker becomes "{n} unread" then, and collapses to nothing at zero.
export default function Notifications() {
  return (
    <Screen>
      <View className="pt-1">
        <Heading>Alerts</Heading>
      </View>
      <View className="flex-1 justify-center">
        <EmptyState>Your notification center loads here in Phase 4.</EmptyState>
      </View>
    </Screen>
  );
}
