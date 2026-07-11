// Client side of Messaging (phase 6): channel list, per-channel message feed
// kept live by a Realtime subscription, the send path (the post_message RPC,
// which also fans out @mention notifications), and the member roster the
// composer's mention autocomplete resolves names against.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "./supabase";
import { ChannelWithGame, MemberRef, MessageWithAuthor } from "./types";

const MESSAGE_LIMIT = 100;

/** All channels, each joined to its game. The screen sorts + filters these. */
export function useChannels() {
  return useQuery({
    queryKey: ["channels"],
    queryFn: async (): Promise<ChannelWithGame[]> => {
      const { data, error } = await supabase
        .from("channels")
        .select("*, games(status, kickoff_at, title)");
      if (error) throw error;
      return (data ?? []) as ChannelWithGame[];
    },
  });
}

/**
 * A channel's messages, newest first — paired with an `inverted` FlatList so
 * index 0 renders at the bottom. RLS scopes reads to active members.
 */
export function useMessages(channelId: string | null) {
  return useQuery({
    queryKey: ["messages", channelId],
    enabled: !!channelId,
    queryFn: async (): Promise<MessageWithAuthor[]> => {
      const { data, error } = await supabase
        .from("messages")
        .select("*, profiles(display_name)")
        .eq("channel_id", channelId)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_LIMIT);
      if (error) throw error;
      return (data ?? []) as MessageWithAuthor[];
    },
  });
}

/**
 * Live tail for the open channel: any insert refetches the feed (which re-runs
 * the author join). Re-subscribes when the selected channel changes; one
 * channel open at a time, so no duplicate-subscription hazard.
 */
export function useMessagesChannel(channelId: string | null): void {
  const qc = useQueryClient();
  useEffect(() => {
    if (!channelId) return;
    const channel = supabase
      .channel(`messages-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channelId}`,
        },
        () => qc.invalidateQueries({ queryKey: ["messages", channelId] })
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [channelId, qc]);
}

/** Post through the RPC so the mention fan-out happens server-side. */
export function useSendMessage(channelId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { error } = await supabase.rpc("post_message", {
        p_channel_id: channelId,
        p_body: body,
      });
      if (error) throw error;
    },
    // Realtime confirms with an invalidation too, but refetch immediately so the
    // sender sees their own line without waiting on the round-trip.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["messages", channelId] }),
  });
}

/** Active members, for mention autocomplete + highlighting. */
export function useActiveMembers() {
  return useQuery({
    queryKey: ["active-members"],
    queryFn: async (): Promise<MemberRef[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, display_name")
        .eq("status", "active")
        .order("display_name");
      if (error) throw error;
      return (data ?? []) as MemberRef[];
    },
  });
}
