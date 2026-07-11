import "../global.css";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Oswald_600SemiBold } from "@expo-google-fonts/oswald/600SemiBold";
import { Oswald_700Bold } from "@expo-google-fonts/oswald/700Bold";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Slot, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { MarqueeSpinner } from "@/components/motif";
import { useAuth, AuthProvider } from "@/lib/auth";
import { ProfileStatus } from "@/lib/types";

// Hold the native splash until the fonts are in memory. Without this the app
// paints one frame in the system face before Oswald/Inter register — a visible
// flash, and the whole condensed identity depends on those files being ready.
void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

// Which route group each membership state belongs in.
function groupForStatus(status: ProfileStatus): string {
  switch (status) {
    case "active":
      return "(tabs)";
    case "viewer":
      return "(viewer)";
    case "pending":
    case "rejected":
    default:
      return "(pending)";
  }
}

// The concrete home screen to land on. Redirecting to a bare group path only
// works when the group has an index route — (tabs) does, but (pending) and
// (viewer) lead with their leaderboard, so we must target the leaf explicitly
// or Expo Router falls through to the "Unmatched Route" screen.
function homeForStatus(status: ProfileStatus): string {
  switch (status) {
    case "active":
      return "/(tabs)";
    case "viewer":
      return "/(viewer)/leaderboard";
    case "pending":
    case "rejected":
    default:
      return "/(pending)/leaderboard";
  }
}

// Redirects the user into the correct route group whenever session/profile
// changes. Kept in a child of AuthProvider so it can read auth state.
function RouteGuard() {
  const { loading, session, profile } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const group = segments[0]; // e.g. "(auth)", "(tabs)", "admin"
    const inAuthGroup = group === "(auth)";

    // Not signed in (or profile failed to load) → auth screens.
    if (!session || !profile) {
      if (!inAuthGroup) router.replace("/(auth)/sign-in");
      return;
    }

    // Signed in but sitting on an auth screen → send to their home screen.
    const home = homeForStatus(profile.status);
    if (inAuthGroup) {
      router.replace(home as never);
      return;
    }

    // Admins may roam the admin stack; otherwise keep everyone in their group.
    const allowed = new Set<string>([groupForStatus(profile.status)]);
    // Match reports are read-only and shared by both read tiers — members reach
    // them from Matchday, report viewers from the Reports tab.
    if (profile.status === "active" || profile.status === "viewer") {
      allowed.add("report");
    }
    if (profile.status === "active") {
      // Active members can open the shared game-detail stack.
      allowed.add("game");
      if (profile.role === "admin") allowed.add("admin");
    }
    // No group means the bare index route — its spinner is only a hand-off,
    // so it must redirect too or a signed-in user is stranded on it.
    if (!group || !allowed.has(group)) {
      router.replace(home as never);
    }
  }, [loading, session, profile, segments, router]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-night">
        <MarqueeSpinner />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  // Only the four weights the design system uses. Importing from the package
  // root instead of these subpaths would bundle every weight's TTF.
  const [fontsLoaded, fontError] = useFonts({
    Oswald_700Bold,
    Oswald_600SemiBold,
    Inter_400Regular,
    Inter_600SemiBold,
  });

  // Reveal on success *or* failure — a font error should degrade to system
  // faces, not trap the user behind a splash screen forever.
  const onReady = useCallback(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }} onLayout={onReady}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            {/* Light glyphs — dark status text is invisible on #060B13. */}
            <StatusBar style="light" />
            <RouteGuard />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
