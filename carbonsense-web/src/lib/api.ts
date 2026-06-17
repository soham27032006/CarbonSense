import axios, { type AxiosResponse } from "axios";
import { supabase } from "./supabase";

const API_URL = import.meta.env.VITE_API_URL || "";

const categoryIcon: Record<string, string> = {
  food: "🍔",
  transport: "🚗",
  home: "🏠",
  shopping: "🛍",
  travel: "✈️",
  lifestyle: "🌱",
  other: "○",
};

const levelNames = [
  "Carbon Curious",
  "Carbon Aware",
  "Carbon Conscious",
  "Carbon Reducer",
  "Carbon Champion",
  "Carbon Hero",
  "Carbon Warrior",
  "Carbon Legend",
  "Carbon Neutral Star",
  "Climate Guardian",
];

const levelThresholds = [0, 100, 300, 600, 1000, 1500, 2200, 3000, 4000, 5500];

function capitalize(value?: string) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getSocialProofCount(challengeId?: string) {
  if (!challengeId) return 47;
  const today = new Date().toISOString().slice(0, 10);
  const seed = `${challengeId}:${today}`;
  let hash = 0;

  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }

  return 47 + Math.abs(hash % 153);
}

function unwrapEnvelope(payload: unknown) {
  if (
    payload &&
    typeof payload === "object" &&
    "success" in payload &&
    "data" in payload
  ) {
    return (payload as { data: unknown }).data;
  }
  return payload;
}

function normalizeDashboard(data: any) {
  if (!data || typeof data !== "object") {
    return {
      carbon_age: 0,
      real_age: 0,
      target_age: 4,
      streak: {
        current: 0,
        max: 0,
        freeze_available: 0,
      },
      this_week: {
        total_carbon_kg: 0,
        vs_last_week_percent: 0,
        category_breakdown: {},
      },
      this_month: {
        total_carbon_kg: 0,
        vs_last_month_percent: 0,
        daily_average_kg: 0,
      },
    };
  }

  return {
    ...data,
    real_age: data.real_age ?? data.carbon_age ?? 0,
    target_age: data.target_age ?? 4,
    streak: {
      ...data.streak,
      freeze_available:
        typeof data.streak?.freeze_available === "boolean"
          ? data.streak.freeze_available
            ? 1
            : 0
          : data.streak?.freeze_available ?? 0,
    },
    this_week: {
      ...data.this_week,
      category_breakdown: data.this_week?.category_breakdown ?? {},
    },
  };
}

function normalizeChallenge(data: any) {
  const challenge = data?.challenge ?? data?.alternative_challenge ?? data;
  if (!challenge || typeof challenge !== "object") return challenge;

  const category = challenge.category ?? "other";
  const rawEmoji = challenge.emoji;
  const normalizedEmoji =
    typeof rawEmoji === "string" && rawEmoji in categoryIcon
      ? categoryIcon[rawEmoji]
      : rawEmoji;
  const savings = Number(challenge.carbon_save_kg ?? challenge.savings_kg ?? 0);

  return {
    ...challenge,
    emoji:
      normalizedEmoji ??
      categoryIcon[challenge.icon ?? ""] ??
      categoryIcon[category] ??
      categoryIcon.other,
    savings_kg: savings,
    carbon_save_kg: savings,
    difficulty: capitalize(challenge.difficulty),
    why:
      challenge.why ??
      challenge.personalized_context ??
      "Chosen from your recent carbon activity.",
    tips: challenge.tips ?? [],
    participants_today:
      Number(challenge.participants_today ?? 0) > 0
        ? Number(challenge.participants_today)
        : getSocialProofCount(challenge.id),
    equivalency:
      challenge.equivalency ??
      (savings > 0
        ? `About ${Math.round(savings / 0.404)} miles not driven`
        : "A small action that builds momentum"),
    streak_last_14: challenge.streak_last_14 ?? [],
    assignment: challenge.assignment ?? data?.assignment,
  };
}

function normalizeChallengeHistory(data: any) {
  if (Array.isArray(data.items)) return data;

  const items = (data.challenges ?? []).map((assignment: any) => {
    const challenge = assignment.challenge ?? {};
    return {
      ...assignment,
      ...challenge,
      id: assignment.id,
      challenge_id: assignment.challenge_id,
      title: challenge.title ?? "Challenge",
      emoji: challenge.emoji ?? categoryIcon[challenge.category ?? "other"],
      category: challenge.category ?? "other",
      savings_kg: Number(challenge.carbon_save_kg ?? 0),
      xp_earned: assignment.xp_earned ?? 0,
      date: assignment.date_assigned,
    };
  });

  const completed = items.filter((item: any) => item.status === "completed");
  const total = data.pagination?.total ?? items.length;

  return {
    ...data,
    page: data.pagination?.page ?? 1,
    total,
    has_more:
      data.pagination?.page && data.pagination?.total_pages
        ? data.pagination.page < data.pagination.total_pages
        : false,
    summary: data.summary ?? {
      completed: completed.length,
      total,
      carbon_saved_kg: completed.reduce(
        (sum: number, item: any) => sum + Number(item.savings_kg ?? 0),
        0,
      ),
      completion_rate: total ? Math.round((completed.length / total) * 100) : 0,
    },
    items,
  };
}

function normalizeChallengeLibrary(data: any) {
  const items = (data.items ?? []).map((challenge: any) => ({
    ...challenge,
    emoji: challenge.emoji ?? categoryIcon[challenge.category ?? "other"],
    savings_kg: Number(challenge.savings_kg ?? challenge.carbon_save_kg ?? 0),
    completion_rate: challenge.completion_rate ?? 0,
  }));

  return { ...data, items };
}

function normalizeOnboardingQuiz(data: any) {
  const breakdown = data.category_breakdown ?? {};
  const topCategory =
    Object.entries(breakdown).sort(
      ([, a], [, b]) => Number(b) - Number(a),
    )[0]?.[0] ?? "shopping";
  const annualTons = Number(data.estimated_annual_tons ?? data.annual_co2 ?? 0);

  return {
    ...data,
    annual_co2: Number(annualTons.toFixed(1)),
    us_average: data.us_average ?? 16,
    paris_target: data.paris_target ?? 4,
    top_category: topCategory === "shopping" ? "consumption" : topCategory,
    message:
      data.message ??
      "Great start. CarbonSense will turn this into practical daily actions.",
  };
}

function normalizeTransactions(data: any) {
  const transactions = (data.transactions ?? []).map((transaction: any) => ({
    ...transaction,
    merchant: transaction.merchant ?? transaction.merchant_name,
    category: transaction.category ?? transaction.carbon_category,
    occurred_at: transaction.occurred_at ?? transaction.date,
    icon:
      transaction.icon ??
      categoryIcon[transaction.carbon_category ?? transaction.category] ??
      categoryIcon.other,
  }));

  return {
    ...data,
    transactions,
    has_more:
      data.has_more ??
      (data.pagination
        ? data.pagination.page < data.pagination.total_pages
        : false),
  };
}

function normalizeTrends(data: any) {
  const points = (data.trends ?? data.points ?? []).map((point: any) => ({
    ...point,
    date: point.date ?? point.period_start,
    kg: point.kg ?? point.total_kg,
    total: point.total ?? point.total_kg,
  }));

  const total = points.reduce(
    (sum: number, point: any) => sum + Number(point.kg ?? point.total ?? 0),
    0,
  );

  return {
    ...data,
    points,
    change_percent: data.change_percent ?? data.overall_change_percent ?? 0,
    total: data.total ?? total,
    average: data.average ?? (points.length ? total / points.length : 0),
    unit: data.unit ?? "kg",
  };
}

function normalizeCompare(data: any) {
  if (!data || typeof data !== "object") {
    return {
      user_monthly_kg: 0,
      national_avg_kg: 1333,
      city_avg_kg: 1333,
      paris_target_kg: 333,
      better_than_percent: 0,
      top_percent: 0,
      vs_last_month_percent: 0,
      improving: true,
      message: "Comparison data will appear once more activity is available.",
    };
  }

  return {
    ...data,
    national_avg_kg: data.national_avg_kg ?? data.national_average_kg,
    city_avg_kg: data.city_avg_kg ?? data.city_average_kg,
    paris_target_kg: data.paris_target_kg ?? 333,
    better_than_percent: data.better_than_percent ?? data.percentile ?? 0,
    top_percent: data.top_percent ?? data.percentile ?? 0,
    improving: data.improving ?? (data.vs_last_month_percent ?? 0) <= 0,
    message: data.message ?? data.ranking_text,
  };
}

function normalizeImpactTotal(data: any) {
  return {
    ...data,
    carbon_saved_kg:
      data.carbon_saved_kg ?? data.lifetime_carbon_saved_kg ?? 0,
    current_streak: data.current_streak ?? data.streak_count ?? 0,
    best_streak: data.best_streak ?? data.streak_max ?? data.current_streak ?? 0,
    xp: data.xp ?? 0,
    total_achievements:
      data.total_achievements ??
      data.achievements_total ??
      data.achievements_earned ??
      0,
    first_activity_at: data.first_activity_at ?? data.member_since,
  };
}

function normalizeEquivalencies(data: any) {
  if (Array.isArray(data.items)) return data;

  const equivalencies = data.equivalencies ?? {};
  const items = Object.entries(equivalencies).map(([id, value]: [string, any]) => ({
    id,
    emoji: id,
    value: value?.value ?? 0,
    unit: id.replaceAll("_", " "),
    description: value?.text ?? "",
  }));

  return { ...data, items };
}

function normalizeLevel(data: any) {
  if (data.current) return data;

  const currentLevel = Number(data.level ?? 1);
  const currentIndex = Math.max(0, currentLevel - 1);
  const nextLevel = Math.min(levelNames.length, currentLevel + 1);
  const xp = Number(data.xp ?? 0);
  const currentRequired = levelThresholds[currentIndex] ?? 0;

  return {
    ...data,
    current: {
      level: currentLevel,
      name: data.level_name ?? levelNames[currentIndex] ?? levelNames[0],
      xp_required: currentRequired,
      icon: String(currentLevel),
    },
    next:
      currentLevel < levelNames.length
        ? {
            level: nextLevel,
            name: levelNames[nextLevel - 1],
            xp_required: levelThresholds[nextLevel - 1],
            icon: String(nextLevel),
          }
        : null,
    xp_into_current: Math.max(0, xp - currentRequired),
    xp_to_next: data.xp_to_next ?? 0,
    levels: levelNames.map((name, index) => ({
      level: index + 1,
      name,
      xp_required: levelThresholds[index],
      icon: String(index + 1),
    })),
  };
}

function normalizeAchievements(data: any) {
  const achievements = (data.achievements ?? []).map((achievement: any) => ({
    ...achievement,
    emoji: achievement.emoji ?? "🏆",
    earned: achievement.earned ?? Boolean(achievement.earned_at),
  }));

  return {
    ...data,
    earned:
      data.earned ??
      data.earned_count ??
      achievements.filter((achievement: any) => achievement.earned).length,
    total: data.total ?? data.total_count ?? achievements.length,
    achievements,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeNotificationPreferences(data: unknown) {
  const prefs = isPlainObject(data) ? data : {};
  const daily = isPlainObject(prefs.daily_challenge)
    ? prefs.daily_challenge
    : {};

  return {
    daily_challenge: {
      enabled:
        typeof daily.enabled === "boolean"
          ? daily.enabled
          : typeof prefs.daily_challenge_enabled === "boolean"
            ? prefs.daily_challenge_enabled
            : true,
      time:
        typeof daily.time === "string" && daily.time
          ? daily.time
          : typeof prefs.daily_challenge_time === "string" && prefs.daily_challenge_time
            ? prefs.daily_challenge_time
            : "09:00",
    },
    streak_at_risk:
      typeof prefs.streak_at_risk === "boolean" ? prefs.streak_at_risk : true,
    weekly_summary:
      typeof prefs.weekly_summary === "boolean" ? prefs.weekly_summary : true,
    achievement_earned:
      typeof prefs.achievement_earned === "boolean" ? prefs.achievement_earned : true,
  };
}

function normalizeUnits(value: unknown): "metric" | "imperial" {
  return value === "imperial" ? "imperial" : "metric";
}

function normalizeCountry(value: unknown): string {
  const country = typeof value === "string" ? value.trim() : "";
  const upper = country.toUpperCase();
  const countryMap: Record<string, string> = {
    "UNITED STATES": "US",
    "UNITED KINGDOM": "GB",
    CANADA: "CA",
    AUSTRALIA: "AU",
    GERMANY: "DE",
    FRANCE: "FR",
    NETHERLANDS: "NL",
    SWEDEN: "SE",
    SPAIN: "ES",
    ITALY: "IT",
    JAPAN: "JP",
    BRAZIL: "BR",
    INDIA: "IN",
  };

  if (/^[A-Z]{2}$/.test(upper)) return upper;
  return countryMap[upper] ?? "US";
}

function normalizeProfile(data: any) {
  const onboarding = data.onboarding_data ?? {};
  const notificationPreferences = data.notification_preferences ?? {};
  const currentLevel = Number(data.level ?? 1);
  const xp = Number(data.xp ?? 0);
  const nextThreshold =
    levelThresholds[Math.min(currentLevel, levelThresholds.length - 1)] ??
    Math.max(xp + 100, 100);
  const xpToNext = Math.max(1, nextThreshold - xp);
  const bankAccounts = (data.bank_accounts ?? data.bank_connections ?? []).map(
    (bank: any) => ({
      id: bank.id,
      institution: bank.institution ?? bank.institution_name ?? "Bank account",
      logo_emoji: bank.logo_emoji ?? "🏦",
      status: bank.status === "active" ? "active" : "error",
      last_synced_at: bank.last_synced_at ?? bank.last_synced ?? data.updated_at ?? data.created_at,
      mask: bank.mask ?? "",
    }),
  );
  const teams = (data.teams ?? []).map((team: any) => ({
    id: team.id,
    name: team.name ?? "Team",
    member_count: team.member_count ?? 1,
    role: team.role ?? "member",
  }));

  return {
    ...data,
    xp,
    xp_to_next: data.xp_to_next ?? xpToNext,
    streak: data.streak ?? data.streak_count ?? 0,
    max_streak: data.max_streak ?? data.streak_max ?? data.streak_count ?? 0,
    real_age: data.real_age ?? onboarding.biological_age ?? 25,
    challenges_completed: data.challenges_completed ?? 0,
    carbon_saved_kg: data.carbon_saved_kg ?? 0,
    bank_accounts: bankAccounts,
    teams,
    notifications: normalizeNotificationPreferences(notificationPreferences),
    settings: {
      units: normalizeUnits(data.settings?.units),
      country: normalizeCountry(data.settings?.country ?? onboarding.country),
    },
  };
}

function normalizeResponse(response: AxiosResponse) {
  const url = response.config.url ?? "";
  const data = unwrapEnvelope(response.data);

  if (url.includes("/carbon/dashboard")) return normalizeDashboard(data);
  if (url.includes("/onboarding/quiz")) return normalizeOnboardingQuiz(data);
  if (url.includes("/challenges/history")) return normalizeChallengeHistory(data);
  if (url.includes("/challenges/library")) return normalizeChallengeLibrary(data);
  if (url.includes("/challenges/today")) return normalizeChallenge(data);
  if (url.includes("/carbon/transactions")) return normalizeTransactions(data);
  if (url.includes("/carbon/trends")) return normalizeTrends(data);
  if (url.includes("/carbon/compare")) return normalizeCompare(data);
  if (url.includes("/impact/total")) return normalizeImpactTotal(data);
  if (url.includes("/impact/equivalencies")) return normalizeEquivalencies(data);
  if (url.includes("/level")) return normalizeLevel(data);
  if (url.includes("/achievements")) return normalizeAchievements(data);
  if (url.includes("/profile")) return normalizeProfile(data);

  return data;
}

export const api = axios.create({
  baseURL: `${API_URL}/api`,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  },
});

api.interceptors.request.use(async (config) => {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => ({ ...response, data: normalizeResponse(response) }),
  async (error) => {
    if (error.response?.status === 401) {
      await supabase.auth.signOut();
      window.location.href = "/login";
    }

    return Promise.reject(error);
  },
);

export default api;
