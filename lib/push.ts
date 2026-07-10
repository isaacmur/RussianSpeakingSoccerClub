// Expo push token capture + notification tap routing.
//
// usePushRegistration() is mounted in (tabs)/_layout — the shell only active
// members ever reach — so registration is gated on status='active' by
// placement, not by a check that could drift. Pending/viewer/rejected users
// never run this code.
//
// Remote push does NOT work in Expo Go (SDK 52 dropped it) or on simulators —
// it needs an EAS dev-client build on a physical device, with the EAS
// projectId in app.json. Everything here degrades to a silent no-op until
// then, so the in-app center still works everywhere.

import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";
import { Platform } from "react-native";
import { supabase } from "./supabase";
import { useAuth } from "./auth";

// Foreground behavior: show the banner. The Alerts badge comes from Realtime
// on the notifications table, not from the push, so no setBadge here.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/** Resolves to an Expo push token, or null wherever push can't work. */
async function getPushToken(): Promise<string | null> {
  if (Platform.OS === "web" || !Device.isDevice) return null;

  // Required by getExpoPushTokenAsync outside Expo Go. Absent until the EAS
  // project is configured (phase 7) — no-op rather than throw until then.
  const projectId: string | undefined =
    Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) {
    console.log("[push] no EAS projectId configured; skipping registration");
    return null;
  }

  // Android routes every notification through a channel; create ours before
  // asking for permission so the first push already has somewhere to land.
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Weekend League",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  const status = existing.granted
    ? "granted"
    : (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return null;

  const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
  return data;
}

/**
 * Once per session: capture the push token, persist it to the profile if it
 * changed, and route notification taps to their game.
 */
export function usePushRegistration(): void {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  const storedToken = profile?.expo_push_token ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    void (async () => {
      try {
        const token = await getPushToken();
        if (cancelled || !token || token === storedToken) return;
        const { error } = await supabase
          .from("profiles")
          .update({ expo_push_token: token })
          .eq("id", userId);
        if (error) console.warn("[push] failed to save token:", error.message);
      } catch (err) {
        console.warn("[push] registration failed:", err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // Deliberately NOT keyed on storedToken: a refetched profile carrying the
    // token we just wrote must not re-run the whole permission/token dance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Tapping a push opens the game it's about (send-push puts game_id in data).
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const gameId = res.notification.request.content.data?.game_id;
      if (typeof gameId === "string" && gameId) {
        router.push(`/game/${gameId}`);
      } else {
        router.push("/(tabs)/notifications");
      }
    });
    return () => sub.remove();
  }, []);
}
