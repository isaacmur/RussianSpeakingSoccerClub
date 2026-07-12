// send-notification-email — Database Webhook target for INSERTs on
// `notifications`. Emails the notification to the recipient's Supabase Auth
// (sign-in) address via Brevo's transactional API; see PHASE4_SETUP.md §2–3.
//
// Deploy via Dashboard → Edge Functions → Deploy a new function → Via Editor
// (hosted-only project; no CLI). Secrets required
// (Dashboard → Edge Functions → Secrets):
//   BREVO_API_KEY      — Brevo → Settings → SMTP & API → **API Keys** (the
//                        REST key, starts with `xkeysib-`; NOT the SMTP key)
//   NOTIFY_FROM_EMAIL  — a sender address verified in Brevo
//                        (Senders & IPs → Senders)
//   NOTIFY_FROM_NAME   — optional display name; defaults to "Weekend League"
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically on
// hosted functions.
//
// The webhook payload is treated as a POINTER, not as truth: we re-fetch the
// notification row by id with the service role before sending. A forged
// request can at worst re-send a real, already-stored notification — it can
// never email arbitrary content or target an arbitrary address.

import { createClient } from "npm:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const BREVO_API_KEY = Deno.env.get("BREVO_API_KEY")!;
const FROM_EMAIL = Deno.env.get("NOTIFY_FROM_EMAIL")!;
const FROM_NAME = Deno.env.get("NOTIFY_FROM_NAME") ?? "Weekend League";

// notification.type → notification_prefs column. Prefs gate the EMAIL only —
// the in-app row already exists by the time this runs. `spot_opened` is absent
// on purpose: being pulled off the waitlist is about your own registration, so
// it always sends. Types missing a pref column also always send.
const PREF_COLUMN: Record<string, string> = {
  registration_open: "registration_open",
  registration_closed: "registration_closed",
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
  // fix a disabled pref or a missing email, so don't ask for them.
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
    .select("status")
    .eq("id", n.user_id)
    .maybeSingle();
  if (profile?.status !== "active") return skip("recipient not active");

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

  // The sign-in address is the delivery address.
  const { data: userRes, error: uErr } = await supabase.auth.admin
    .getUserById(n.user_id);
  if (uErr) return skip(`user lookup failed: ${uErr.message}`);
  const email = userRes?.user?.email;
  if (!email) return skip("recipient has no email");

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "api-key": BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { name: FROM_NAME, email: FROM_EMAIL },
      to: [{ email }],
      subject: n.title,
      textContent: n.body ?? n.title,
    }),
  });

  const receipt = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`email ${n.type} -> ${n.user_id} failed:`, receipt);
    return skip(`brevo error ${res.status}`);
  }

  console.log(
    `email ${n.type} -> ${n.user_id}: sent (${receipt?.messageId ?? "?"})`,
  );
  return new Response(
    JSON.stringify({ sent: true, messageId: receipt?.messageId }),
    { headers: { "Content-Type": "application/json" } },
  );
});
