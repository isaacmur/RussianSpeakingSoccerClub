import "react-native-url-polyfill/auto";
import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loud in dev so a missing .env doesn't surface as confusing auth errors.
  console.warn(
    "[supabase] Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY. " +
      "Copy .env.example to .env and fill in your project values."
  );
}

// SecureStore rejects on a keychain/keystore error — an entry written by a
// previous install, or one the OS can no longer decrypt. supabase-js does not
// catch that: it escapes `getSession()` and, upstream, wedges the app's initial
// `loading` flag. A session we cannot read is a session we do not have, so
// swallow the failure and report "absent" instead of exploding boot.
async function guard<T>(
  op: () => Promise<T>,
  fallback: T,
  action: string,
  key: string
): Promise<T> {
  try {
    return await op();
  } catch (err) {
    console.warn(`[supabase] SecureStore ${action} failed for "${key}":`, err);
    return fallback;
  }
}

// SecureStore-backed session storage for native. On web SecureStore is
// unavailable, so fall back to localStorage (dev only).
const ExpoSecureStoreAdapter = {
  getItem: (key: string) =>
    Platform.OS === "web"
      ? Promise.resolve(globalThis.localStorage?.getItem(key) ?? null)
      : guard(() => SecureStore.getItemAsync(key), null, "read", key),
  setItem: (key: string, value: string) =>
    Platform.OS === "web"
      ? Promise.resolve(globalThis.localStorage?.setItem(key, value))
      : guard(() => SecureStore.setItemAsync(key, value), undefined, "write", key),
  removeItem: (key: string) =>
    Platform.OS === "web"
      ? Promise.resolve(globalThis.localStorage?.removeItem(key))
      : guard(() => SecureStore.deleteItemAsync(key), undefined, "delete", key),
};

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "", {
  auth: {
    storage: ExpoSecureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
