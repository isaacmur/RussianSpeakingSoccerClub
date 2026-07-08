import { Stack } from "expo-router";
import { fonts, palette } from "@/lib/theme";

// Shared game-detail stack. Access is gated by the RouteGuard (active members
// only). A native header gives the back button into Matchday.
export default function GameLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: palette.night },
        headerTintColor: palette.bone,
        // Oswald ships one weight per family — pairing it with fontWeight would
        // ask RN to synthesize a bold the family doesn't contain.
        headerTitleStyle: { fontFamily: fonts.display },
        headerShadowVisible: false,
        headerBackTitle: "Back",
        contentStyle: { backgroundColor: palette.night },
      }}
    >
      <Stack.Screen name="[id]" options={{ title: "Game" }} />
    </Stack>
  );
}
