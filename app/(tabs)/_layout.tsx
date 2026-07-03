import { Tabs } from "expo-router";

// Active members: the full app shell. Screens are phase-1 placeholders and get
// wired to real data in later phases.
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#1F7A46",
        tabBarInactiveTintColor: "#6B7280",
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Matchday" }} />
      <Tabs.Screen name="leaderboard" options={{ title: "Table" }} />
      <Tabs.Screen name="chat" options={{ title: "Clubhouse" }} />
      <Tabs.Screen name="notifications" options={{ title: "Alerts" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}
