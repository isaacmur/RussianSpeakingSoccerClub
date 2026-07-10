// send-push — Database Webhook target for INSERTs on `notifications`.
// Loads the recipient's Expo push token + notification_prefs, drops the send
// if the category is toggled off, and POSTs to the Expo Push Service.
//
// Deploy:  npx supabase functions deploy send-push
// Webhook: Dashboard → Database → Webhooks → notifications INSERT → this
//          function (see PHASE4_SETUP.md).
//
// The webhook payload is treated as a POINTER, not as truth: we re-fetch the
// notification row by id with the service role before sending. A forged
// request can at worst re-send a real, already-stored notification — it can
// never push arbitrary content or target an arbitrary token.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// notification.type → notification_prefs column. `spot_opened` is absent on
// purpose: being pulled off the waitlist is about your own registration, so it
// always sends. Types missing a pref column also always send.
const PREF_COLUMN: Record<string, string> = {
  registration_open: "registration_open",
  game_filled: "game_filled",
  needs_players: "needs_players",
  kickoff_reminder: "kickoff_reminder",
  results_posted: "results_posted",
  chat_mention: "chat_mentions",
};

type WebhookPayload = {
  type: "INSERT";
  table: string;
  record: { id?: string };
};

Deno.serve(async (req) => {
  // Always 200 unless the request itself is malformed — webhook retries can't
  // fix a missing token or a disabled pref, so don't ask for them.
  const skip = (reason: string) =>
    new Response(JSON.stringify({ sent: false, reason }), {
      headers: { "Content-Type": "application/json" },
    });

  let payload: WebhookPayload;
  try {
    payload = await req.json();
  } catch {
    return new Response("bad payload", { status: 400 });
  }

  const id = payload.record?.id;
  if (payload.table !== "notifications" || !id) {
    return new Response("bad payload", { status: 400 });
  }

  // Re-fetch the row — never trust webhook-supplied content.
  const { data: n, error: nErr } = await supabase
    .from("notifications")
    .select("id, user_id, type, title, body, game_id")
    .eq("id", id)
    .maybeSingle();
  if (nErr) return skip(`notification lookup failed: ${nErr.message}`);
  if (!n) return skip("notification not found");

  const { data: profile } = await supabase
    .from("profiles")
    .select("expo_push_token, status")
    .eq("id", n.user_id)
    .maybeSingle();
  if (!profile?.expo_push_token) return skip("no push token");
  if (profile.status !== "active") return skip("recipient not active");

  const prefCol = PREF_COLUMN[n.type];
  if (prefCol) {
    const { data: prefs } = await supabase
      .from("notification_prefs")
      .select(prefCol)
      .eq("user_id", n.user_id)
      .maybeSingle();
    // Missing row = defaults = on. An explicit false is the only opt-out.
    if (prefs && (prefs as Record<string, boolean>)[prefCol] === false) {
      return skip(`pref ${prefCol} off`);
    }
  }

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to: profile.expo_push_token,
      title: n.title,
      body: n.body ?? undefined,
      sound: "default",
      channelId: "default",
      data: { notification_id: n.id, type: n.type, game_id: n.game_id },
    }),
  });

  const receipt = await res.json().catch(() => null);
  const status = receipt?.data?.status ?? (res.ok ? "ok" : "error");

  // Expo tells us when a token is dead (app uninstalled, permissions revoked).
  // Clear it so we stop paying for sends that can never land.
  if (receipt?.data?.details?.error === "DeviceNotRegistered") {
    await supabase
      .from("profiles")
      .update({ expo_push_token: null })
      .eq("id", n.user_id);
  }

  console.log(`push ${n.type} -> ${n.user_id}: ${status}`);
  return new Response(JSON.stringify({ sent: res.ok, status }), {
    headers: { "Content-Type": "application/json" },
  });
});
