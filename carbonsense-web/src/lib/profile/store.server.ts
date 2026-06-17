// In-memory mock profile store (Worker singleton — resets on redeploy).

export type Units = "metric" | "imperial";

export interface BankAccount {
  id: string;
  institution: string;
  logo_emoji: string;
  status: "active" | "error";
  last_synced_at: string;
  mask: string;
}

export interface NotificationPrefs {
  daily_challenge: { enabled: boolean; time: string };
  streak_at_risk: boolean;
  weekly_summary: boolean;
  achievement_earned: boolean;
}

export interface AppSettings {
  units: Units;
  country: string;
}

export interface ProfileData {
  id: string;
  name: string;
  email: string;
  avatar_url: string | null;
  level: number;
  level_name: string;
  xp: number;
  xp_to_next: number;
  streak: number;
  max_streak: number;
  carbon_age: number;
  real_age: number;
  challenges_completed: number;
  carbon_saved_kg: number;
  member_since: string;
  bank_accounts: BankAccount[];
  teams: { id: string; name: string; member_count: number; role: string }[];
  notifications: NotificationPrefs;
  settings: AppSettings;
}

const profile: ProfileData = {
  id: "me",
  name: "Jordan Avery",
  email: "jordan@carbonsense.app",
  avatar_url: null,
  level: 5,
  level_name: "Carbon Champion",
  xp: 1240,
  xp_to_next: 1500,
  streak: 12,
  max_streak: 21,
  carbon_age: 34,
  real_age: 31,
  challenges_completed: 47,
  carbon_saved_kg: 112,
  member_since: new Date(2026, 5, 1).toISOString(), // June 2026
  bank_accounts: [
    {
      id: "bank_1",
      institution: "Chase Bank",
      logo_emoji: "🏦",
      status: "active",
      last_synced_at: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
      mask: "•••• 4821",
    },
    {
      id: "bank_2",
      institution: "Wells Fargo",
      logo_emoji: "🐎",
      status: "error",
      last_synced_at: new Date(Date.now() - 1000 * 60 * 60 * 26).toISOString(),
      mask: "•••• 7392",
    },
  ],
  teams: [
    { id: "t_green_block", name: "Green Block", member_count: 12, role: "Member" },
    { id: "t_acme_co2", name: "Acme Climate Crew", member_count: 24, role: "Admin" },
  ],
  notifications: {
    daily_challenge: { enabled: true, time: "08:00" },
    streak_at_risk: true,
    weekly_summary: true,
    achievement_earned: true,
  },
  settings: {
    units: "metric",
    country: "US",
  },
};

export function getProfile(): ProfileData {
  return profile;
}

export function updateProfile(patch: Partial<ProfileData>): ProfileData {
  if (patch.name !== undefined) profile.name = patch.name;
  if (patch.avatar_url !== undefined) profile.avatar_url = patch.avatar_url;
  if (patch.notifications) {
    profile.notifications = { ...profile.notifications, ...patch.notifications };
  }
  if (patch.settings) {
    profile.settings = { ...profile.settings, ...patch.settings };
  }
  return profile;
}

export function disconnectBank(id: string): boolean {
  const i = profile.bank_accounts.findIndex((b) => b.id === id);
  if (i === -1) return false;
  profile.bank_accounts.splice(i, 1);
  return true;
}

export function listBanks(): BankAccount[] {
  return profile.bank_accounts;
}

export function addBank(input: { institution: string; logo_emoji?: string }): BankAccount {
  const bank: BankAccount = {
    id: `bank_${Math.random().toString(36).slice(2, 9)}`,
    institution: input.institution,
    logo_emoji: input.logo_emoji ?? "🏦",
    status: "active",
    last_synced_at: new Date().toISOString(),
    mask: `•••• ${Math.floor(1000 + Math.random() * 9000)}`,
  };
  profile.bank_accounts.unshift(bank);
  return bank;
}

export function getCarbonAgeDetail() {
  return {
    carbon_age: profile.carbon_age,
    real_age: profile.real_age,
    target_age: 28,
    annual_co2_kg: 6800,
    global_avg_kg: 4800,
    paris_target_kg: 2300,
    breakdown: [
      { category: "Transport", kg: 2400, weight: 0.35 },
      { category: "Food", kg: 1700, weight: 0.25 },
      { category: "Home Energy", kg: 1500, weight: 0.22 },
      { category: "Shopping", kg: 800, weight: 0.12 },
      { category: "Other", kg: 400, weight: 0.06 },
    ],
    explanation:
      "Your Carbon Age maps your annual footprint onto the lifestyle of an average person at that emissions level. Lower your transport and home energy footprint to bring it down.",
  };
}

export function getStreakDetail() {
  const today = new Date();
  const history: { date: string; active: boolean }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    history.push({
      date: d.toISOString().slice(0, 10),
      active: i < profile.streak || (i < 26 && i % 4 !== 0),
    });
  }
  return {
    current: profile.streak,
    max: profile.max_streak,
    freezes_available: 2,
    next_milestone: 14,
    history,
  };
}
