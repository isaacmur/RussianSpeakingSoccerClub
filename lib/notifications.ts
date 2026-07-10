// Client side of the notification center: one shared ["notifications"] cache
// entry feeding both the Alerts screen and the tab-bar badge, kept live by a
// single Realtime channel mounted in (tabs)/_layout.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "./auth";
import { supabase } from "./supabase";
import { AppNotification } from "./types";

const FEED_LIMIT = 50;

async function fetchNotifications(): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(FEED_LIMIT);
  if (error) throw error;
  return (data ?? []) as AppNotification[];
}

/** The feed. RLS scopes it to the signed-in user; no client-side filter needed. */
export function useNotificationsFeed() {
  return useQuery({ queryKey: ["notifications"], queryFn: fetchNotifications });
}

/** Unread count for the tab badge. Reads the same cache entry as the feed. */
export function useUnreadCount(): number {
  const { data } = useNotificationsFeed();
  const rows: AppNotification[] = data ?? [];
  return rows.filter((n) => !n.read).length;
}

/**
 * The one live subscription. Mount exactly once (it lives in (tabs)/_layout);
 * a second mount would open a duplicate channel per event.
 */
export function useNotificationsChannel(): void {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["notifications"] })
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, qc]);
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("id", id);
      if (error) throw error;
    },
    // Flip the row locally; Realtime will confirm with an invalidation anyway.
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      qc.setQueryData<AppNotification[]>(
        ["notifications"],
        (old?: AppNotification[]) =>
          old?.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    },
    onError: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}

export function useMarkAllRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("notifications")
        .update({ read: true })
        .eq("read", false);
      if (error) throw error;
    },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["notifications"] });
      qc.setQueryData<AppNotification[]>(
        ["notifications"],
        (old?: AppNotification[]) =>
          old?.map((n) => (n.read ? n : { ...n, read: true }))
      );
    },
    onError: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
