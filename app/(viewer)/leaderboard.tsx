import { View } from "react-native";
import { Button, Heading, Screen, Subtle } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function ViewerLeaderboard() {
  const { signOut } = useAuth();
  return (
    <Screen>
      <View className="flex-1 justify-center gap-4">
        <Heading>Table</Heading>
        <View className="rounded-xl border border-line bg-card p-6">
          <Subtle>Standings load here in Phase 2.</Subtle>
        </View>
        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </View>
    </Screen>
  );
}
