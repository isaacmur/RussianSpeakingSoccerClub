// Family subpath, not the package root — the root pulls in every icon TTF.
import Feather from "@expo/vector-icons/Feather";
import { Tabs } from "expo-router";
import { fonts, palette } from "@/lib/theme";

// Report viewers: leaderboard + match reports, read-only.
export default function ViewerLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.wonder,
        tabBarInactiveTintColor: palette.steel,
        tabBarStyle: {
          backgroundColor: palette.night,
          borderTopColor: palette.line,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.displaySemi,
          fontSize: 10,
          letterSpacing: 0.8,
          textTransform: "uppercase",
        },
      }}
    >
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: "Table",
          tabBarIcon: ({ color, size }) => (
            <Feather name="bar-chart-2" color={color} size={size ?? 22} />
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: "Reports",
          tabBarIcon: ({ color, size }) => (
            <Feather name="file-text" color={color} size={size ?? 22} />
          ),
        }}
      />
    </Tabs>
  );
}
