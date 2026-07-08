import { Stack } from "expo-router";

// Admin-only stack. Access is gated by the RouteGuard in _layout.tsx (only
// active admins are allowed into the "admin" group).
export default function AdminLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#111A2E" },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: { fontWeight: "700" },
      }}
    >
      <Stack.Screen name="members" options={{ title: "Members" }} />
      <Stack.Screen name="baselines" options={{ title: "Baselines" }} />
    </Stack>
  );
}
