export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type BankConnectionStatus = "active" | "error" | "disconnected";
export type CarbonCategory =
  | "food"
  | "transport"
  | "home"
  | "shopping"
  | "travel"
  | "other";
export type CarbonSource = "ai" | "manual" | "emission_factor";
export type ChallengeCategory =
  | "food"
  | "transport"
  | "home"
  | "shopping"
  | "lifestyle";
export type ChallengeDifficulty = "easy" | "medium" | "hard";
export type UserChallengeStatus =
  | "pending"
  | "accepted"
  | "completed"
  | "skipped";
export type TeamType = "neighborhood" | "employer" | "friends" | "custom";
export type TeamRole = "admin" | "member";
export type AchievementConditionType =
  | "streak"
  | "challenges_completed"
  | "carbon_saved"
  | "level"
  | "custom";
export type SummaryPeriodType = "day" | "week" | "month";
export type CopilotRole = "system" | "user" | "assistant";

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  carbon_age: number;
  level: number;
  level_name: string;
  xp: number;
  streak_count: number;
  streak_max: number;
  streak_freeze_available: boolean;
  streak_last_checked_date: string | null;
  onboarding_complete: boolean;
  onboarding_data: Json;
  notification_preferences: Json;
  created_at: string;
  updated_at: string;
}

export interface BankConnection {
  id: string;
  user_id: string;
  plaid_access_token: string;
  plaid_item_id: string;
  plaid_cursor: string | null;
  institution_name: string;
  institution_logo: string | null;
  status: BankConnectionStatus;
  last_synced: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  bank_connection_id: string | null;
  plaid_transaction_id: string | null;
  merchant_name: string;
  merchant_category: string;
  amount: number;
  currency: string;
  carbon_kg: number;
  carbon_category: CarbonCategory;
  carbon_confidence: number;
  carbon_source: CarbonSource;
  transaction_date: string;
  is_removed: boolean;
  created_at: string;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  category: ChallengeCategory;
  difficulty: ChallengeDifficulty;
  carbon_save_kg: number;
  xp_reward: number;
  tips: string[];
  icon: string;
  is_active: boolean;
  created_at: string;
}

export interface UserChallenge {
  id: string;
  user_id: string;
  challenge_id: string;
  date_assigned: string;
  status: UserChallengeStatus;
  skip_reason: string | null;
  completed_at: string | null;
  xp_earned: number;
  created_at: string;
}

export interface Team {
  id: string;
  name: string;
  type: TeamType;
  description: string | null;
  invite_code: string;
  created_by: string;
  member_count: number;
  total_carbon_saved_kg: number;
  created_at: string;
}

export interface TeamMembership {
  id: string;
  team_id: string;
  user_id: string;
  role: TeamRole;
  joined_at: string;
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  condition_type: AchievementConditionType;
  threshold: number;
  xp_reward: number;
  created_at: string;
}

export interface UserAchievement {
  id: string;
  user_id: string;
  achievement_id: string;
  earned_at: string;
}

export interface CarbonSummary {
  id: string;
  user_id: string;
  period_type: SummaryPeriodType;
  period_start: string;
  total_carbon_kg: number;
  food_kg: number;
  transport_kg: number;
  home_kg: number;
  shopping_kg: number;
  travel_kg: number;
  other_kg: number;
  challenge_savings_kg: number;
  created_at: string;
}

export interface CopilotMessage {
  role: CopilotRole;
  content: string;
  timestamp: string;
}

export interface CopilotConversation {
  id: string;
  user_id: string;
  messages: CopilotMessage[];
  created_at: string;
  updated_at: string;
}
