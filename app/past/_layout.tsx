import { Stack } from "expo-router";
import { fonts, palette } from "@/lib/theme";

// Past-matches stack for active members. Reached from Matchday's header link;
// the cards inside push into the shared "report" group. The RouteGuard allows
// the "past" group for active members only.
export default function PastLayout() {
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
      <Stack.Screen name="index" options={{ title: "Past matches" }} />
    </Stack>
  );
}
