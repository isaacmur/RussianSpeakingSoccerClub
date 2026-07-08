import Feather from "@expo/vector-icons/Feather";
import { Tabs } from "expo-router";
import { fonts, palette } from "@/lib/theme";

// Active members: the full app shell.
//
// The tab bar had no icons at all before — five text labels. Feather ships with
// @expo/vector-icons, already a dependency.
//
// Import the family directly, never `{ Feather } from "@expo/vector-icons"` —
// the package root re-exports every family and drags ~3.5 MB of icon TTFs
// (MaterialCommunityIcons alone is 1.1 MB) into the bundle.
type Icon = React.ComponentProps<typeof Feather>["name"];

const TABS: { name: string; title: string; icon: Icon }[] = [
  { name: "index", title: "Matchday", icon: "calendar" },
  { name: "leaderboard", title: "Table", icon: "bar-chart-2" },
  { name: "chat", title: "Clubhouse", icon: "message-square" },
  { name: "notifications", title: "Alerts", icon: "bell" },
  { name: "profile", title: "Profile", icon: "user" },
];

export default function TabsLayout() {
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
      {TABS.map((t) => (
        <Tabs.Screen
          key={t.name}
          name={t.name}
          options={{
            title: t.title,
            tabBarIcon: ({ color, size }) => (
              <Feather name={t.icon} color={color} size={size ?? 22} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
