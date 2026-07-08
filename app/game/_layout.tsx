import { Stack } from "expo-router";

// Shared game-detail stack. Access is gated by the RouteGuard (active members
// only). A native header gives the back button into Matchday.
export default function GameLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#111A2E" },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "700" },
        headerBackTitle: "Back",
      }}
    >
      <Stack.Screen name="[id]" options={{ title: "Game" }} />
    </Stack>
  );
}
