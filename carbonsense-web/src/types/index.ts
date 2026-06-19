// Shared TypeScript interfaces for CarbonSense.

export interface User {
  id: string;
  email: string;
  full_name?: string | null;
  avatar_url?: string | null;
  onboarding_complete: boolean;
  created_at?: string;
  level?: number;
  level_name?: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  merchant: string;
  category: string;
  amount: number;
  currency: string;
  carbon_kg: number;
  occurred_at: string;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  estimated_carbon_savings_kg: number;
  xp_reward: number;
  duration_days: number;
}

export interface UserChallenge {
  id: string;
  user_id: string;
  challenge_id: string;
  challenge?: Challenge;
  status: "active" | "completed" | "skipped";
  started_at: string;
  completed_at?: string | null;
  carbon_saved_kg?: number;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  member_count: number;
  total_carbon_saved_kg: number;
  avatar_url?: string | null;
}

export interface TeamMembership {
  team_id: string;
  user_id: string;
  role: "member" | "admin" | "owner";
  joined_at: string;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: string;
  unlocked_at?: string | null;
  progress?: number;
  target?: number;
}

export interface CarbonSummary {
  period: "day" | "week" | "month" | "year";
  total_kg: number;
  delta_pct: number;
  by_category: Array<{ category: string; kg: number }>;
}

export interface CopilotMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface DashboardData {
  summary: CarbonSummary;
  recent_transactions: Transaction[];
  trend: Array<{ date: string; kg: number }>;
  streak: number;
  level: number;
  xp: number;
  xp_to_next: number;
}

export interface EquivalencyData {
  trees_planted: number;
  km_not_driven: number;
  flights_saved: number;
  meals_swapped: number;
}
