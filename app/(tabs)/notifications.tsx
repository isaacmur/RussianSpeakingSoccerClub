import { View } from "react-native";
import { Heading, Screen, Subtle } from "@/components/ui";

export default function Notifications() {
  return (
    <Screen>
      <View className="flex-1 justify-center gap-4">
        <Heading>Alerts</Heading>
        <View className="rounded-xl border border-line bg-card p-6">
          <Subtle>Your notification center loads here in Phase 4.</Subtle>
        </View>
      </View>
    </Screen>
  );
}
