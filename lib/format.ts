import type { Tone } from "./theme";
import { GameStatus } from "./types";

export const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// The league runs on Eastern time; render every kickoff there regardless of the
// viewer's device timezone (stored value is a UTC instant).
const LEAGUE_TZ = "America/New_York";

// The primary label for a match — its kickoff date, e.g. "Sat Jul 11".
// Used everywhere a game is named (matchday, chat channels, headings, reports)
// in place of the free-text title, so the same game reads consistently across
// the app. Rendered in league time regardless of the viewer's device timezone.
export function matchLabel(iso: string): string {
  return new Date(iso)
    .toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: LEAGUE_TZ,
    })
    .replace(",", ""); // "Sat, Jul 11" → "Sat Jul 11"
}

// "Sat, Jul 12 · 10:00 AM ET"
export function formatKickoff(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: LEAGUE_TZ,
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone: LEAGUE_TZ,
  });
  return `${date} · ${time} ET`;
}

// The weekend bucket a kickoff falls in, computed in league time so it matches
// the date shown by matchLabel/formatKickoff regardless of device timezone.
// Feeds the Past Matches filter — Saturday and Sunday are the club's two weekend
// slots; anything else is "Weekday".
export type MatchDayGroup = "Saturday" | "Sunday" | "Weekday";
export function matchDayGroup(iso: string): MatchDayGroup {
  const weekday = new Date(iso).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: LEAGUE_TZ,
  });
  if (weekday === "Saturday") return "Saturday";
  if (weekday === "Sunday") return "Sunday";
  return "Weekday";
}

// Compact relative timestamp for feed rows: "now", "5m", "3h", "2d", then a
// plain date once it's over a week old. No " ago" suffix — the column is
// narrow and the context (a feed) already says it.
export function timeAgo(iso: string): string {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  if (secs < 7 * 86400) return `${Math.floor(secs / 86400)}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: LEAGUE_TZ,
  });
}

// ── Mentions (phase 6) ──────────────────────────────────────────────────────

// The in-progress @mention at the very end of the composer, or null. Matches an
// '@' that starts the input or follows whitespace, then the (possibly empty)
// run of non-space chars typed so far — so "hey @jo" yields "jo" but a completed
// "@John Smith " (trailing space) yields null and stops re-triggering.
export function trailingMentionQuery(text: string): string | null {
  const m = /(?:^|\s)@([^\s@]*)$/.exec(text);
  return m ? m[1] : null;
}

// Replace that trailing "@query" with the picked "@Full Name " (trailing space).
export function applyMention(text: string, name: string): string {
  return text.replace(/@[^\s@]*$/, `@${name} `);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Split a message body into plain runs and "@Name" mention runs, matching only
// against real member names (longest first, so "@John Smith" wins over "@John").
// The caller styles the mention runs; everything else renders as-is.
export function splitMentions(
  body: string,
  names: string[]
): { text: string; mention: boolean }[] {
  const usable = names.filter((n) => n.trim().length > 0);
  if (usable.length === 0) return [{ text: body, mention: false }];

  const alts = [...usable]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  const re = new RegExp(`@(?:${alts})`, "gi");

  const out: { text: string; mention: boolean }[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    if (m.index > last) out.push({ text: body.slice(last, m.index), mention: false });
    out.push({ text: m[0], mention: true });
    last = m.index + m[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last), mention: false });
  return out;
}

// Short human label + semantic tone for a game status.
//
// Tones are deliberately *not* color names. This used to return
// "pitch" | "boot" | "mute" | "ink", which baked the palette into business
// logic — renaming a color meant editing this file. <StatusChip> owns the
// tone → token mapping now, so the next redesign stops at the component layer.
export function statusLabel(status: GameStatus): { label: string; tone: Tone } {
  switch (status) {
    case "registration_open":
      return { label: "Registration open", tone: "positive" };
    case "filled":
      return { label: "Full", tone: "urgent" };
    case "scheduled":
      return { label: "Scheduled", tone: "quiet" };
    case "locked":
      return { label: "Locked", tone: "strong" };
    case "in_progress":
      return { label: "In progress", tone: "strong" };
    case "completed":
      return { label: "Completed", tone: "quiet" };
    case "cancelled":
      return { label: "Cancelled", tone: "urgent" };
    default:
      return { label: status, tone: "quiet" };
  }
}
