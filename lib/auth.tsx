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

/** Never rejects — a missing profile and an unreachable server both read as null. */
async function fetchProfile(userId: string): Promise<Profile | null> {
  try {
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
  } catch (err) {
    console.warn("[auth] profile request threw:", err);
    return null;
  }
}

/** Rejects if `p` hasn't settled within `ms`, so a wedged native module can't hang boot. */
function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms}ms`)),
      ms
    );
    p.then(resolve, reject).finally(() => clearTimeout(timer));
  });
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
    let cancelled = false;

    // Initial load. `getSession()` reads the persisted session straight out of
    // SecureStore, and supabase-js lets a storage failure escape as a rejection
    // (its __loadSession is try/finally, no catch). Since `loading` gates the
    // whole app behind a spinner, every exit from here — success, throw, or a
    // native module that never answers — has to clear it. Degrade to
    // signed-out rather than stranding the user on the splash screen.
    void (async () => {
      try {
        const { data } = await withTimeout(
          supabase.auth.getSession(),
          8_000,
          "supabase.auth.getSession()"
        );
        if (!cancelled) await loadForSession(data.session);
      } catch (err) {
        console.warn("[auth] could not restore session:", err);
        if (!cancelled) await loadForSession(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // React to sign-in / sign-out / token refresh.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      // Only reload the profile when the user identity actually changes; a
      // token refresh keeps the same user and shouldn't re-fetch.
      if (next?.user.id !== currentUserId.current) {
        void loadForSession(next).catch((err) =>
          console.warn("[auth] failed to apply auth change:", err)
        );
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
      cancelled = true;
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
