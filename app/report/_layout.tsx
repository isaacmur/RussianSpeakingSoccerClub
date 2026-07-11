import { Stack } from "expo-router";
import { fonts, palette } from "@/lib/theme";

// Shared match-report stack. Read-only, reachable by both active members
// (from Matchday) and report viewers (from the Reports tab) — the RouteGuard
// allows the "report" group for either tier.
export default function ReportLayout() {
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
      <Stack.Screen name="[id]" options={{ title: "Report" }} />
    </Stack>
  );
}
