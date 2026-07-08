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

// Short human label + accent tone for a game status, matching the palette.
export function statusLabel(status: GameStatus): {
  label: string;
  tone: "pitch" | "boot" | "mute" | "ink";
} {
  switch (status) {
    case "registration_open":
      return { label: "Registration open", tone: "pitch" };
    case "filled":
      return { label: "Full", tone: "boot" };
    case "scheduled":
      return { label: "Scheduled", tone: "mute" };
    case "locked":
      return { label: "Locked", tone: "ink" };
    case "in_progress":
      return { label: "In progress", tone: "ink" };
    case "completed":
      return { label: "Completed", tone: "mute" };
    case "cancelled":
      return { label: "Cancelled", tone: "boot" };
    default:
      return { label: status, tone: "mute" };
  }
}
