import { Stack } from "expo-router";
import { fonts, palette } from "@/lib/theme";

// Shared per-player match-history stack. Read-only, opened by tapping a
// leaderboard row — reachable by both active members and report viewers (the
// RouteGuard allows the "player" group for either tier, same as "report").
export default function PlayerLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: palette.night },
        headerTintColor: palette.bone,
        headerTitleStyle: { fontFamily: fonts.display },
        headerShadowVisible: false,
        headerBackTitle: "Back",
        contentStyle: { backgroundColor: palette.night },
      }}
    >
      <Stack.Screen name="[id]" options={{ title: "Player" }} />
    </Stack>
  );
}
