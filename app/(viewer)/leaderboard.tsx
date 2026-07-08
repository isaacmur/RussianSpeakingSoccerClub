import { View } from "react-native";
import { Leaderboard } from "@/components/leaderboard";
import { Button, Heading, Screen } from "@/components/ui";
import { useAuth } from "@/lib/auth";

export default function ViewerLeaderboard() {
  const { signOut } = useAuth();
  return (
    <Screen>
      <View className="flex-row items-center justify-between pt-1">
        <Heading>Table</Heading>
        <Button title="Sign out" variant="ghost" onPress={signOut} />
      </View>
      <Leaderboard />
    </Screen>
  );
}
