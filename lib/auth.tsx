import { Session } from "@supabase/supabase-js";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { supabase } from "./supabase";
import { Profile } from "./types";

type AuthState = {
  /** true until the initial session + profile load resolves. */
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  /** re-fetch the current user's profile (e.g. after an admin status change). */
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[auth] failed to load profile:", error.message);
    return null;
  }
  return data as Profile | null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const currentUserId = useRef<string | null>(null);

  const loadForSession = async (next: Session | null) => {
    setSession(next);
    currentUserId.current = next?.user.id ?? null;
    setProfile(next ? await fetchProfile(next.user.id) : null);
  };

  useEffect(() => {
    // Initial load.
    supabase.auth.getSession().then(async ({ data }) => {
      await loadForSession(data.session);
      setLoading(false);
    });

    // React to sign-in / sign-out / token refresh.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      // Only reload the profile when the user identity actually changes; a
      // token refresh keeps the same user and shouldn't re-fetch.
      if (next?.user.id !== currentUserId.current) {
        void loadForSession(next);
      } else {
        setSession(next);
      }
    });

    // Keep tokens fresh while the app is foregrounded.
    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });

    return () => {
      sub.subscription.unsubscribe();
      appStateSub.remove();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      profile,
      refreshProfile: async () => {
        if (currentUserId.current) {
          setProfile(await fetchProfile(currentUserId.current));
        }
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [loading, session, profile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
