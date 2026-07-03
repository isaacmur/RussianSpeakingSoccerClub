import { View } from "react-native";
import { Heading, Screen, Subtle } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function Matchday() {
  const { profile } = useAuth();
  return (
    <Screen>
      <View className="flex-1 justify-center gap-4">
        <Heading>Matchday</Heading>
        <Subtle>Welcome, {profile?.display_name}.</Subtle>
        <View className="rounded-xl border border-line bg-card p-6">
          <Subtle>Upcoming & recent games load here in Phase 3.</Subtle>
        </View>
      </View>
    </Screen>
  );
}
