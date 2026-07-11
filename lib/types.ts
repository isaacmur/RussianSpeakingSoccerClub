// Shared domain types. Kept hand-written for now; can be replaced by
// `supabase gen types typescript` output once the hosted project is linked.

export type ProfileRole = "player" | "admin";
export type ProfileStatus = "pending" | "active" | "viewer" | "rejected";

export type Profile = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: ProfileRole;
  status: ProfileStatus;
  created_at: string;
};

export type GameStatus =
  | "draft"
  | "scheduled"
  | "registration_open"
  | "filled"
  | "locked"
  | "in_progress"
  | "completed"
  | "cancelled";

export type Game = {
  id: string;
  series_id: string | null;
  season_id: string | null;
  title: string;
  kickoff_at: string;
  location: string | null;
  capacity: number;
  min_players: number;
  registration_opens_at: string;
  status: GameStatus;
  created_by: string | null;
  created_at: string;
};

export type GameSeries = {
  id: string;
  title: string;
  day_of_week: number; // 0=Sun .. 6=Sat
  kickoff_time: string; // "HH:MM:SS"
  duration_min: number | null;
  location: string | null;
  capacity: number;
  min_players: number;
  reg_opens_offset_hours: number;
  active: boolean;
  created_by: string | null;
};

export type RegistrationStatus = "registered" | "waitlist" | "withdrawn";

export type Registration = {
  id: string;
  game_id: string;
  user_id: string;
  status: RegistrationStatus;
  team: "A" | "B" | null;
  created_at: string;
};

// A registration row joined to the player's display name, for the signup list.
export type RegistrationWithName = Registration & {
  profiles: { display_name: string } | null;
};

// The six manually-entered baseline stats, per player per season.
export type BaselineStats = {
  games_played: number;
  wins: number;
  draws: number;
  losses: number;
  plus_minus: number;
  goals: number;
};

export type SeasonBaseline = BaselineStats & {
  season_id: string;
  user_id: string;
};

// The full taxonomy. results_posted / chat_mention rows start flowing in
// phases 5–6; the center renders them generically either way.
export type NotificationType =
  | "registration_open"
  | "game_filled"
  | "needs_players"
  | "spot_opened"
  | "kickoff_reminder"
  | "roster_posted"
  | "results_posted"
  | "chat_mention";

// "AppNotification" because bare `Notification` collides with the DOM lib type.
export type AppNotification = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  game_id: string | null;
  read: boolean;
  created_at: string;
};

// One row per user; every column defaults true. `spot_opened` has no toggle by
// design — waitlist promotion is about your own registration.
export type NotificationPrefs = {
  user_id: string;
  registration_open: boolean;
  game_filled: boolean;
  needs_players: boolean;
  kickoff_reminder: boolean;
  results_posted: boolean;
  chat_mentions: boolean;
};

export type LeaderboardRow = {
  user_id: string;
  display_name: string;
  games_played: number;
  wins: number;
  draws: number;
  losses: number;
  plus_minus: number;
  goals: number;
};

// ── Results & reports (phase 5) ─────────────────────────────────────────────

export type MatchResult = {
  game_id: string;
  team_a_score: number;
  team_b_score: number;
  summary: string | null;
  entered_by: string | null;
  entered_at: string;
};

export type Goal = {
  id: string;
  game_id: string;
  scorer_id: string;
  team: "A" | "B";
  count: number;
};

// One attendee in a report bundle: the side they played and goals they scored.
export type ReportRosterEntry = {
  user_id: string;
  display_name: string;
  team: "A" | "B" | null;
  goals: number;
};

// The get_match_report() RPC bundle. `result` is null until a summary is entered.
export type MatchReport = {
  game: {
    id: string;
    title: string;
    kickoff_at: string;
    location: string | null;
    status: GameStatus;
  } | null;
  result: {
    team_a_score: number;
    team_b_score: number;
    summary: string | null;
    entered_at: string;
  } | null;
  roster: ReportRosterEntry[];
};

// One row of the list_match_reports() RPC — the Reports/recent feed.
export type MatchReportSummary = {
  game_id: string;
  title: string;
  kickoff_at: string;
  location: string | null;
  team_a_score: number;
  team_b_score: number;
  summary: string | null;
};
