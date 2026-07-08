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
