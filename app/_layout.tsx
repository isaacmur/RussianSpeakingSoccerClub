import "../global.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Slot, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ProfileStatus } from "@/lib/types";

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

    // Signed in but sitting on an auth screen → send to their home group.
    const target = groupForStatus(profile.status);
    if (inAuthGroup) {
      router.replace(`/${target}` as never);
      return;
    }

    // Admins may roam the admin stack; otherwise keep everyone in their group.
    const allowed = new Set<string>([target]);
    if (profile.status === "active") {
      // Active members can open the shared game-detail stack.
      allowed.add("game");
      if (profile.role === "admin") allowed.add("admin");
    }
    if (group && !allowed.has(group)) {
      router.replace(`/${target}` as never);
    }
  }, [loading, session, profile, segments, router]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-chalk">
        <ActivityIndicator color="#1F7A46" />
      </View>
    );
  }

  return <Slot />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="dark" />
            <RouteGuard />
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
