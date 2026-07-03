import { Tabs } from "expo-router";

// Report viewers: leaderboard + match reports, read-only.
export default function ViewerLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#1F7A46",
        tabBarInactiveTintColor: "#6B7280",
      }}
    >
      <Tabs.Screen name="leaderboard" options={{ title: "Table" }} />
      <Tabs.Screen name="reports" options={{ title: "Reports" }} />
    </Tabs>
  );
}
