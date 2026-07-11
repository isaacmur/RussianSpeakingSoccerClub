import { Stack } from "expo-router";
import { fonts, palette } from "@/lib/theme";

// Admin-only stack. Access is gated by the RouteGuard in _layout.tsx (only
// active admins are allowed into the "admin" group).
//
// `luna` is the admin accent throughout — lamplight rather than neon. An admin
// screen should never look like a member screen, because the buttons here
// rewrite other people's seasons.
export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: palette.night },
        headerTintColor: palette.luna,
        headerTitleStyle: { fontFamily: fonts.display, color: palette.bone },
        headerShadowVisible: false,
        headerBackTitle: "Back",
        contentStyle: { backgroundColor: palette.night },
      }}
    >
      <Stack.Screen name="members" options={{ title: "Members" }} />
      <Stack.Screen name="baselines" options={{ title: "Baselines" }} />
      <Stack.Screen name="series" options={{ title: "Series" }} />
      <Stack.Screen name="schedule" options={{ title: "Schedule" }} />
      <Stack.Screen name="summary/[id]" options={{ title: "Enter result" }} />
    </Stack>
  );
}
