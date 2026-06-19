/**
 * Frontend API client and response normalizer for CarbonSense. Centralizes transport configuration and backend envelope handling.
 */
import axios, { type AxiosResponse } from "axios";
import { supabase } from "./supabase";
import { API_BASE } from "./api-base";
import {
  getLevelsCatalog,
  getLevelName,
  getLevelThreshold,
  getNextLevelThreshold,
  isLevelsCatalogReady,
  type LevelEntry
} from "./levels";

const API_URL = API_BASE.replace(/\/api$/, "");

const categoryIcon: Record<string, string> = {
  food: "🍔",
  transport: "🚗",
  home: "🏠",
  shopping: "🛍",
  travel: "✈️",
  lifestyle: "🌱",
  other: "○",
};

function capitalize(value?: string) {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
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
  const raw = data && typeof data === "object" ? data : null;

  // Backend responses are commonly wrapped as: { success, data: { ... } }
  const d = raw?.data && typeof raw.data === "object" ? raw.data : raw;

  if (!d) return null;

  const onboarding = d.onboarding_data ?? {};
  const annualCarbonTons = Number(
    onboarding.estimated_annual_tons ??
      onboarding.annual_carbon_tons ??
      onboarding.annual_co2 ??
      0,
  );
  const realAge = Number(d.real_age ?? onboarding.biological_age ?? 0);
  const targetAge = Number(
    d.target_age ??
      (annualCarbonTons > 0
        ? Math.round(realAge + (4 - annualCarbonTons) * 2)
        : realAge),
  );

  return {
    ...d,
    // Carbon Age is not the same as Real Age; avoid falling back to carbon_age.
    real_age: realAge,
    target_age: targetAge,
    streak: {
      ...d.streak,
      freeze_available:
        typeof d.streak?.freeze_available === "boolean"
          ? d.streak.freeze_available
            ? 1
            : 0
          : d.streak?.freeze_available ?? 0,
    },
    this_week: {
      ...d.this_week,
      category_breakdown: d.this_week?.category_breakdown ?? {},
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
    participants_today: Number(challenge.participants_today ?? 0),
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
  const d = data && typeof data === "object" ? data : {};
  const rows = d.transactions ?? [];

  const transactions = rows.map((transaction: any) => ({
    ...transaction,
    merchant: transaction.merchant ?? transaction.merchant_name,
    category: transaction.category ?? transaction.carbon_category,
    occurred_at: transaction.occurred_at ?? transaction.date,
    icon:
      transaction.icon ??
      categoryIcon[transaction.carbon_category ?? transaction.category] ??
      categoryIcon.other,
  }));

  const pagination = d.pagination ?? {};
  const total = pagination.total ?? d.total ?? transactions.length ?? 0;
  const page = pagination.page ?? d.page ?? 1;
  const limit = pagination.limit ?? d.limit ?? 20;

  return {
    ...d,
    transactions,
    total,
    page,
    limit,
    has_more:
      d.has_more ??
      (pagination
        ? pagination.page < pagination.total_pages
        : false),
  };
}

function normalizeTrends(data: any) {
  const raw = data && typeof data === "object" ? data : null;

  // Backend responses are commonly wrapped as: { success, data: { ... } }
  const d = raw?.data && typeof raw.data === "object" ? raw.data : raw;
  if (!d) return null;

  // Backend returns points[] directly with { label, value, previous, period_start }.
  const rawPoints: any[] = Array.isArray(d.points)
    ? d.points
    : Array.isArray(d.trends)
      ? d.trends
      : [];

  // dashboard.tsx Recharts expects: { label, value, previous }
  const points = (rawPoints as any[]).map((point: any, idx: number, arr: any[]) => {
    const value = Number(point.value ?? point.total_kg ?? point.kg ?? 0);

    let previous = Number(point.previous);
    if (!Number.isFinite(previous)) {
      const prior = idx > 0 ? arr[idx - 1] : null;
      previous = prior
        ? Number(prior.value ?? prior.total_kg ?? prior.kg ?? value)
        : value;
    }

    return {
      ...point,
      label: point.label ?? point.period_start ?? point.date ?? String(idx),
      value,
      previous,
    };
  });

  const total = points.reduce(
    (sum: number, p: any) => sum + Number(p.value ?? 0),
    0,
  );

  return {
    ...d,
    points,
    change_percent: Number(d.change_percent ?? d.overall_change_percent ?? 0),
    total: Number(d.total ?? Math.round(total * 100) / 100),
    average: Number(d.average ?? (points.length ? Math.round((total / points.length) * 100) / 100 : 0)),
    unit: d.unit ?? "kg",
    is_estimated: Boolean(d.is_estimated)
  };
}

function normalizeCompare(data: any) {
  if (!data || typeof data !== "object") return null;

  const d = data?.data && typeof data.data === "object" ? data.data : data;

  const userMonthlyKg = Number(d.user_monthly_kg ?? 0);
  const vsLastMonthPercent = Number(d.vs_last_month_percent ?? 0);

  const current = userMonthlyKg;
  const previous =
    vsLastMonthPercent !== 0 ? current / (1 + vsLastMonthPercent / 100) : current;

  const percentile = Number(d.percentile ?? d.top_percent ?? d.better_than_percent ?? 0);

  return {
    ...d,
    // time-comparison fields expected by dashboard (safe even if we can't fully reconstruct)
    current,
    previous,
    delta: current - previous,
    percentChange: vsLastMonthPercent,

    // peer comparison fields expected by dashboard components
    national_avg_kg: Number(d.national_average_kg ?? d.national_avg_kg ?? 0),
    city_avg_kg: Number(d.city_average_kg ?? d.city_avg_kg ?? 0),
    paris_target_kg: Number(d.paris_target_kg ?? 0),

    better_than_percent: Number(d.better_than_percent ?? percentile ?? 0),
    top_percent: Number(d.top_percent ?? percentile ?? 0),
    vs_last_month_percent: vsLastMonthPercent,
    improving: d.improving ?? vsLastMonthPercent <= 0,
    message: d.message ?? d.ranking_text ?? "",
  };
}

function normalizeImpactTotal(data: any) {
  if (!data || typeof data !== "object") return null;

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
  if (!data || typeof data !== "object") return null;
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
  if (!data || typeof data !== "object") return null;
  if (data.current) return data;

  const currentLevel = Number(data.level ?? 1);
  const catalogReady = isLevelsCatalogReady();
  const catalog = catalogReady ? getLevelsCatalog() : [];
  const xp = Number(data.xp ?? 0);
  const currentRequired = catalogReady ? getLevelThreshold(currentLevel) : 0;
  const currentName =
    data.level_name ?? (catalogReady ? getLevelName(currentLevel) : "");
  const isMaxLevel = catalogReady && currentLevel >= catalog.length;

  return {
    ...data,
    current: {
      level: currentLevel,
      name: currentName,
      xp_required: currentRequired,
      icon: "🌿",
    },
    next: !isMaxLevel
      ? {
          level: currentLevel + 1,
          name: catalogReady ? getLevelName(currentLevel + 1) : "",
          xp_required: catalogReady ? getLevelThreshold(currentLevel + 1) : 0,
          icon: "🌿",
        }
      : null,
    xp_into_current: Math.max(0, xp - currentRequired),
    xp_to_next: data.xp_to_next ?? 0,
    levels: catalog.map((entry: LevelEntry) => ({
      level: entry.level,
      name: entry.name,
      xp_required: entry.xp_required,
      icon: "🌿",
    })),
  };
}

const ACHIEVEMENT_ICON_EMOJI: Record<string, string> = {
  footprints: "👣",
  flame: "🔥",
  "calendar-days": "📅",
  "calendar-check": "✅",
  "badge-cent": "💯",
  trophy: "🏆",
  "badge-check": "🎖️",
  medal: "🏅",
  award: "🏅",
  crown: "👑",
  leaf: "🍃",
  "tree-pine": "🌲",
  scale: "⚖️",
  trees: "🌳",
  star: "⭐",
  sparkles: "✨",
  users: "👥",
  send: "📨",
  landmark: "🏛️",
  bot: "🤖"
};

function achievementIconToEmoji(icon: unknown): string {
  if (typeof icon !== "string" || icon.length === 0) return "🏆";
  return ACHIEVEMENT_ICON_EMOJI[icon] ?? "🏆";
}

function normalizeAchievements(data: any) {
  if (!data || typeof data !== "object") return null;
  const achievements = (data.achievements ?? []).map((achievement: any) => ({
    ...achievement,
    emoji: achievement.emoji ?? achievementIconToEmoji(achievement.icon),
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
  if (!data || typeof data !== "object") return null;
  const onboarding = data.onboarding_data ?? {};
  const notificationPreferences = data.notification_preferences ?? {};
  const currentLevel = Number(data.level ?? 1);
  const xp = Number(data.xp ?? 0);
  const catalogReady = isLevelsCatalogReady();
  const nextThreshold = catalogReady
    ? getNextLevelThreshold(currentLevel)
    : Math.max(xp + 100, 100);
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
    real_age: data.real_age ?? onboarding.biological_age ?? 0,
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
  baseURL: API_BASE,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
  },
});

api.interceptors.request.use(async (config) => {
  let token: string | null = null;

  // Try Supabase session first
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      token = session.access_token;
    }
  } catch {
    // ignore — fall through to localStorage fallback
  }

  // Fallback: read directly from localStorage. Supabase stores its session
  // under a key like `sb-<project-ref>-auth-token`. Some app rebuilds cause
  // getSession() to return null even though the token is still on disk.
  if (!token && typeof window !== "undefined") {
    try {
      const storageKey = Object.keys(window.localStorage).find((k) =>
        k.includes("auth-token")
      );
      if (storageKey) {
        const raw = window.localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          token =
            parsed?.access_token ??
            parsed?.currentSession?.access_token ??
            parsed?.session?.access_token ??
            null;
        }
      }
    } catch {
      token = null;
    }
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => ({ ...response, data: normalizeResponse(response) }),
  async (error) => {
    if (error.response?.status === 401) {
      await supabase.auth.signOut();
      const { useAuthStore } = await import("@/stores/authStore");
      useAuthStore.getState().reset();
      if (typeof window !== "undefined" && window.location.pathname !== "/login") {
        window.location.assign("/login");
      }
    }

    return Promise.reject(error);
  },
);

export default api;
