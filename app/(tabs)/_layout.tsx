import Feather from "@expo/vector-icons/Feather";
import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNotificationsChannel, useUnreadCount } from "@/lib/notifications";
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
  // Session-wide wiring lives here because this layout mounts exactly once and
  // only for active members: the single Realtime channel feeding the unread
  // badge. Delivery is email (send-notification-email), so there is no
  // push-token capture.
  useNotificationsChannel();
  const unread = useUnreadCount();
  // The tab bar sits flush against the screen edge. Without reserving the bottom
  // safe-area inset (home indicator on iOS, browser/PWA chrome on web) the
  // labels get clipped at the bottom edge, so pad the bar by the inset.
  const insets = useSafeAreaInsets();

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
          // Content area = height - paddingTop - paddingBottom. It must fit the
          // 22px icon *and* the label line beneath it, or the label's top gets
          // clipped. 68 - 4 - 8 = 56px of room; the safe-area inset is added on
          // top so the home indicator never overlaps the labels.
          height: 68 + insets.bottom,
          paddingBottom: insets.bottom + 8,
          paddingTop: 4,
        },
        tabBarLabelStyle: {
          fontFamily: fonts.displaySemi,
          fontSize: 10,
          letterSpacing: 0.8,
          lineHeight: 14,
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
            // Unread count on the Alerts bell. Cyclone fill + night text —
            // never neon-on-neon (see Badge in components/ui.tsx).
            ...(t.name === "notifications" && unread > 0
              ? {
                  tabBarBadge: unread > 99 ? "99+" : unread,
                  tabBarBadgeStyle: {
                    backgroundColor: palette.cyclone,
                    color: palette.night,
                    fontFamily: fonts.bodySemi,
                    fontSize: 11,
                  },
                }
              : {}),
          }}
        />
      ))}
    </Tabs>
  );
}
