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
  expo_push_token: string | null;
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
