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
