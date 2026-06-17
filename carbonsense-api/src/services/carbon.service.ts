import { z } from "zod";
import type { ChallengeCategory } from "../types";
import type { CarbonCategory, CarbonSource, Json } from "../types";
import { supabaseAdmin } from "../config/supabase";
import {
  CATEGORY_CARBON_MAP,
  MERCHANT_CARBON_MAP,
  type CategoryCarbonFactor,
  type MerchantCarbonFactor
} from "../utils/carbonFactors";
import { chatWithAI, classifyCarbon, extractJson } from "./ai.service";

export type TransportMode = "car" | "public_transit" | "bike" | "wfh" | "mixed";
export type MeatFrequency = "daily" | "few_times_week" | "rarely" | "never";
export type MonthlySpending =
  | "under_2k"
  | "2k_to_5k"
  | "5k_to_10k"
  | "over_10k";
export type FlightFrequency = "never" | "1_2_yearly" | "monthly" | "weekly";
export type Motivation =
  | "save_money"
  | "reduce_anxiety"
  | "family_values"
  | "community";

export type OnboardingQuizData = {
  transport_mode: TransportMode;
  meat_frequency: MeatFrequency;
  monthly_spending: MonthlySpending;
  flight_frequency: FlightFrequency;
  motivation: Motivation;
  household_size: number;
  country: string;
  biological_age?: number;
};

export type CategoryBreakdown = {
  food: number;
  transport: number;
  home: number;
  shopping: number;
  travel: number;
};

export type TransactionCarbonClassification = {
  carbon_kg: number;
  carbon_category: CarbonCategory;
  confidence: number;
  source: CarbonSource;
  factor_per_dollar: number;
  subcategory?: string;
  reasoning?: string;
};

export type TransactionFilters = {
  page: number;
  limit: number;
  category?: CarbonCategory;
  date_from?: string;
  date_to?: string;
};

type PeriodType = "day" | "week" | "month";
type WeeklyCarbonEstimate = {
  weekly_total: number;
  categories: Record<CarbonCategory, number>;
};

const levelThresholds = [
  { level: 1, name: "Carbon Curious", xp: 0 },
  { level: 2, name: "Carbon Aware", xp: 100 },
  { level: 3, name: "Carbon Conscious", xp: 300 },
  { level: 4, name: "Carbon Reducer", xp: 600 },
  { level: 5, name: "Carbon Champion", xp: 1000 },
  { level: 6, name: "Carbon Hero", xp: 1500 },
  { level: 7, name: "Carbon Warrior", xp: 2200 },
  { level: 8, name: "Carbon Legend", xp: 3000 },
  { level: 9, name: "Carbon Neutral Star", xp: 4000 },
  { level: 10, name: "Climate Guardian", xp: 5500 }
];

const nationalAverageMonthlyKg = 1333;

const US_TARGET_TONS = 4.0;
const US_AVERAGE_TONS = 16.0;
const DEFAULT_BIOLOGICAL_AGE = 25;
const MERCHANT_MATCH_CONFIDENCE = 0.85;
const CATEGORY_MATCH_CONFIDENCE = 0.65;
const AI_MATCH_CONFIDENCE = 0.5;

const aiClassificationSchema = z.object({
  carbon_category: z.enum([
    "food",
    "transport",
    "home",
    "shopping",
    "travel",
    "other"
  ]),
  emission_factor_per_dollar: z.number().nonnegative(),
  reasoning: z.string().min(1)
});

const transportFactors: Record<TransportMode, number> = {
  car: 4.6,
  public_transit: 1.2,
  bike: 0.1,
  wfh: 0.5,
  mixed: 2.5
};

const dietFactors: Record<MeatFrequency, number> = {
  daily: 2.5,
  few_times_week: 1.8,
  rarely: 1.2,
  never: 0.7
};

const spendingFactors: Record<MonthlySpending, number> = {
  under_2k: 2.0,
  "2k_to_5k": 4.0,
  "5k_to_10k": 7.0,
  over_10k: 11.0
};

const flightFactors: Record<FlightFrequency, number> = {
  never: 0,
  "1_2_yearly": 1.5,
  monthly: 6.0,
  weekly: 18.0
};

function roundTons(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundKg(value: number): number {
  return Math.round(value * 100) / 100;
}

function getCountryTargetTons(country: string): number {
  return country.toUpperCase() === "US" ? US_TARGET_TONS : US_TARGET_TONS;
}

export function getCategoryBreakdown(
  quizData: OnboardingQuizData
): CategoryBreakdown {
  return {
    food: dietFactors[quizData.meat_frequency],
    transport: transportFactors[quizData.transport_mode],
    home: 2.0,
    shopping: spendingFactors[quizData.monthly_spending],
    travel: flightFactors[quizData.flight_frequency]
  };
}

export function calculateCarbonFromOnboarding(
  quizData: OnboardingQuizData
): number {
  const breakdown = getCategoryBreakdown(quizData);
  const annualTons = Object.values(breakdown).reduce(
    (total, value) => total + value,
    0
  );

  return roundTons(annualTons);
}

export function calculateCarbonAge(
  bioAge: number,
  annualTons: number,
  country: string
): number {
  const countryTargetTons = getCountryTargetTons(country);
  const carbonAge = bioAge + (annualTons - countryTargetTons) * 2;

  return Math.max(0, Math.round(carbonAge));
}

export function getPercentile(annualTons: number, country: string): number {
  const averageTons = country.toUpperCase() === "US" ? US_AVERAGE_TONS : US_AVERAGE_TONS;
  const percentile = (annualTons / averageTons) * 50;

  return Math.min(99, Math.max(1, Math.round(percentile)));
}

export function getHighestCarbonCategory(
  breakdown: CategoryBreakdown
): keyof CategoryBreakdown {
  const entries = Object.entries(breakdown) as Array<
    [keyof CategoryBreakdown, number]
  >;

  return entries.reduce((highest, current) =>
    current[1] > highest[1] ? current : highest
  )[0];
}

export function toChallengeCategory(
  category: keyof CategoryBreakdown
): ChallengeCategory {
  return category === "travel" ? "lifestyle" : category;
}

export const defaultBiologicalAge = DEFAULT_BIOLOGICAL_AGE;

export function normalizeMerchantName(merchantName: string): string {
  return merchantName
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(inc|llc|ltd|co|corp|corporation|store|payment|pos)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance(left: string, right: string): number {
  const rows = left.length + 1;
  const columns = right.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array<number>(columns));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }

  for (let column = 0; column < columns; column += 1) {
    matrix[0][column] = column;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let column = 1; column < columns; column += 1) {
      const substitutionCost = left[row - 1] === right[column - 1] ? 0 : 1;
      matrix[row][column] = Math.min(
        matrix[row - 1][column] + 1,
        matrix[row][column - 1] + 1,
        matrix[row - 1][column - 1] + substitutionCost
      );
    }
  }

  return matrix[left.length][right.length];
}

function merchantSimilarity(left: string, right: string): number {
  if (left === right) {
    return 1;
  }

  if (left.includes(right) || right.includes(left)) {
    return 0.92;
  }

  const leftTokens = new Set(left.split(" ").filter(Boolean));
  const rightTokens = new Set(right.split(" ").filter(Boolean));
  const sharedTokens = [...leftTokens].filter((token) => rightTokens.has(token));
  const tokenScore =
    sharedTokens.length / Math.max(leftTokens.size, rightTokens.size, 1);
  const distance = levenshteinDistance(left, right);
  const editScore = 1 - distance / Math.max(left.length, right.length, 1);

  return Math.max(tokenScore, editScore);
}

function findMerchantFactor(
  merchantName: string
): MerchantCarbonFactor | undefined {
  const normalizedMerchant = normalizeMerchantName(merchantName);
  let bestMatch:
    | { factor: MerchantCarbonFactor; similarity: number }
    | undefined;

  for (const [merchantKey, factor] of Object.entries(MERCHANT_CARBON_MAP)) {
    const normalizedKey = normalizeMerchantName(merchantKey);
    const similarity = merchantSimilarity(normalizedMerchant, normalizedKey);

    if (!bestMatch || similarity > bestMatch.similarity) {
      bestMatch = { factor, similarity };
    }
  }

  return bestMatch && bestMatch.similarity >= 0.82
    ? bestMatch.factor
    : undefined;
}

function findCategoryFactor(
  plaidCategory: string
): CategoryCarbonFactor | undefined {
  const normalizedCategory = plaidCategory.trim();

  if (CATEGORY_CARBON_MAP[normalizedCategory]) {
    return CATEGORY_CARBON_MAP[normalizedCategory];
  }

  const lowerCategory = normalizedCategory.toLowerCase();
  const fallbackEntry = Object.entries(CATEGORY_CARBON_MAP).find(([key]) => {
    const lowerKey = key.toLowerCase();
    return lowerCategory.startsWith(lowerKey) || lowerKey.startsWith(lowerCategory);
  });

  return fallbackEntry?.[1];
}

function toClassification(
  amount: number,
  factor: MerchantCarbonFactor | CategoryCarbonFactor,
  confidence: number,
  source: CarbonSource
): TransactionCarbonClassification {
  return {
    carbon_kg: roundKg(Math.abs(amount) * factor.factor_per_dollar),
    carbon_category: factor.category,
    confidence,
    source,
    factor_per_dollar: factor.factor_per_dollar,
    subcategory: "subcategory" in factor ? factor.subcategory : undefined
  };
}

export async function classifyTransaction(
  merchantName: string,
  plaidCategory: string,
  amount: number
): Promise<TransactionCarbonClassification> {
  const merchantFactor = findMerchantFactor(merchantName);

  if (merchantFactor) {
    return toClassification(
      amount,
      merchantFactor,
      MERCHANT_MATCH_CONFIDENCE,
      "emission_factor"
    );
  }

  const categoryFactor = findCategoryFactor(plaidCategory);

  if (categoryFactor) {
    return toClassification(
      amount,
      categoryFactor,
      CATEGORY_MATCH_CONFIDENCE,
      "emission_factor"
    );
  }

  return classifyWithAI(merchantName, plaidCategory, amount);
}

export async function classifyWithAI(
  merchantName: string,
  category: string,
  amount: number
): Promise<TransactionCarbonClassification> {
  const parsed = aiClassificationSchema.parse(
    await classifyCarbon(merchantName, category, amount)
  );

  return {
    carbon_kg: roundKg(Math.abs(amount) * parsed.emission_factor_per_dollar),
    carbon_category: parsed.carbon_category,
    confidence: AI_MATCH_CONFIDENCE,
    source: "ai",
    factor_per_dollar: parsed.emission_factor_per_dollar,
    reasoning: parsed.reasoning
  };
}

export async function getDashboard(userId: string) {
  const today = formatDate(new Date());
  const week = getPeriodBounds(today, "week");
  const lastWeek = offsetPeriod(week.periodStart, "week", -1);
  const month = getPeriodBounds(today, "month");
  const lastMonth = offsetPeriod(month.periodStart, "month", -1);

  const [{ data: user, error: userError }, todayCarbon, thisWeek, previousWeek, thisMonth, previousMonth, aiInsight, challengeStatus] =
    await Promise.all([
      supabaseAdmin
        .from("users")
        .select("carbon_age,level,level_name,xp,streak_count,streak_max,streak_freeze_available,onboarding_data")
        .eq("id", userId)
        .single(),
      getSummary(userId, "day", today),
      getSummary(userId, "week", week.periodStart),
      getSummary(userId, "week", lastWeek.periodStart),
      getSummary(userId, "month", month.periodStart),
      getSummary(userId, "month", lastMonth.periodStart),
      generateDailyInsight(userId),
      getTodayChallengeStatus(userId, today)
    ]);

  if (userError || !user) {
    throw new Error("Unable to load dashboard profile");
  }

  const estimatedWeek = isZeroSummary(thisWeek)
    ? estimateWeeklyFromOnboarding(user.onboarding_data)
    : null;
  const effectiveTodayCarbon = estimatedWeek
    ? roundKg(estimatedWeek.weekly_total / 7)
    : todayCarbon.total_carbon_kg;
  const effectiveWeekTotal = estimatedWeek
    ? estimatedWeek.weekly_total
    : thisWeek.total_carbon_kg;
  const effectiveWeekBreakdown = estimatedWeek
    ? estimatedWeek.categories
    : toCategoryBreakdownKg(thisWeek);
  const effectiveMonthTotal = estimatedWeek
    ? roundKg(estimatedWeek.weekly_total * 4.33)
    : thisMonth.total_carbon_kg;

  return {
    carbon_age: user.carbon_age,
    current_level: {
      level: user.level,
      name: user.level_name,
      xp: user.xp,
      xp_to_next: getXpToNextLevel(user.xp)
    },
    streak: {
      current: user.streak_count,
      max: user.streak_max,
      freeze_available: user.streak_freeze_available
    },
    today: {
      carbon_kg: effectiveTodayCarbon,
      challenge_status: challengeStatus
    },
    this_week: {
      total_carbon_kg: effectiveWeekTotal,
      vs_last_week_percent: percentChange(
        effectiveWeekTotal,
        previousWeek.total_carbon_kg
      ),
      category_breakdown: effectiveWeekBreakdown,
      is_estimated: Boolean(estimatedWeek)
    },
    this_month: {
      total_carbon_kg: effectiveMonthTotal,
      vs_last_month_percent: percentChange(
        effectiveMonthTotal,
        previousMonth.total_carbon_kg
      ),
      daily_average_kg: roundKg(
        effectiveMonthTotal / Math.max(new Date().getUTCDate(), 1)
      ),
      is_estimated: Boolean(estimatedWeek)
    },
    ai_insight: aiInsight
  };
}

export async function getTransactions(
  userId: string,
  filters: TransactionFilters
) {
  const page = Math.max(filters.page, 1);
  const limit = Math.min(Math.max(filters.limit, 1), 100);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseAdmin
    .from("transactions")
    .select(
      "id,merchant_name,amount,carbon_kg,carbon_category,carbon_confidence,transaction_date",
      { count: "exact" }
    )
    .eq("user_id", userId)
    .eq("is_removed", false);

  query = applyTransactionFilters(query, filters);

  const { data, error, count } = await query
    .order("transaction_date", { ascending: false })
    .range(from, to);

  if (error) {
    throw new Error("Unable to load transactions");
  }

  let summaryQuery = supabaseAdmin
    .from("transactions")
    .select("carbon_kg")
    .eq("user_id", userId)
    .eq("is_removed", false);

  summaryQuery = applyTransactionFilters(summaryQuery, filters);
  const { data: summaryRows, error: summaryError } = await summaryQuery;

  if (summaryError) {
    throw new Error("Unable to load transaction summary");
  }

  const totalCarbonKg = roundKg(
    (summaryRows ?? []).reduce((total, row) => total + Number(row.carbon_kg), 0)
  );
  const total = count ?? 0;

  return {
    transactions: (data ?? []).map((transaction) => ({
      id: transaction.id,
      merchant_name: transaction.merchant_name,
      amount: Number(transaction.amount),
      carbon_kg: Number(transaction.carbon_kg),
      carbon_category: transaction.carbon_category,
      confidence: Number(transaction.carbon_confidence),
      date: transaction.transaction_date,
      icon: getCategoryIcon(transaction.carbon_category)
    })),
    pagination: {
      page,
      limit,
      total,
      total_pages: Math.ceil(total / limit)
    },
    summary: {
      total_carbon_kg: totalCarbonKg,
      avg_per_transaction: total > 0 ? roundKg(totalCarbonKg / total) : 0
    }
  };
}

export async function getTrends(
  userId: string,
  period: "weekly" | "monthly",
  range: number
) {
  const periodType: PeriodType = period === "weekly" ? "week" : "month";
  const { data, error } = await supabaseAdmin
    .from("carbon_summaries")
    .select("*")
    .eq("user_id", userId)
    .eq("period_type", periodType)
    .order("period_start", { ascending: false })
    .limit(range);

  if (error) {
    throw new Error("Unable to load carbon trends");
  }

  const trends = [...(data ?? [])].reverse().map((summary) => ({
    period_start: summary.period_start,
    total_kg: Number(summary.total_carbon_kg),
    category_breakdown: toCategoryBreakdownKg(summary)
  }));
  const first = trends[0]?.total_kg ?? 0;
  const last = trends[trends.length - 1]?.total_kg ?? 0;

  return {
    trends,
    overall_change_percent: percentChange(last, first),
    best_period: getExtremePeriod(trends, "best"),
    worst_period: getExtremePeriod(trends, "worst")
  };
}

export async function getCategoryDetail(
  userId: string,
  category: CarbonCategory
) {
  const today = formatDate(new Date());
  const month = getPeriodBounds(today, "month");
  const thisMonth = await getSummary(userId, "month", month.periodStart);
  const thisMonthCategoryKg = Number(thisMonth[`${category}_kg`]);
  const percentOfTotal =
    thisMonth.total_carbon_kg > 0
      ? Math.round((thisMonthCategoryKg / thisMonth.total_carbon_kg) * 100)
      : 0;

  const { data: transactions, error } = await supabaseAdmin
    .from("transactions")
    .select("merchant_name,carbon_kg,transaction_date")
    .eq("user_id", userId)
    .eq("is_removed", false)
    .eq("carbon_category", category)
    .gte("transaction_date", month.periodStart)
    .lt("transaction_date", month.periodEnd);

  if (error) {
    throw new Error("Unable to load category transactions");
  }

  const topMerchants = Object.values(
    (transactions ?? []).reduce<Record<string, { name: string; total_kg: number; transaction_count: number }>>(
      (current, transaction) => {
        const existing = current[transaction.merchant_name] ?? {
          name: transaction.merchant_name,
          total_kg: 0,
          transaction_count: 0
        };

        return {
          ...current,
          [transaction.merchant_name]: {
            ...existing,
            total_kg: existing.total_kg + Number(transaction.carbon_kg),
            transaction_count: existing.transaction_count + 1
          }
        };
      },
      {}
    )
  )
    .map((merchant) => ({ ...merchant, total_kg: roundKg(merchant.total_kg) }))
    .sort((left, right) => right.total_kg - left.total_kg)
    .slice(0, 5);

  const trend = await getCategoryWeeklyTrend(userId, category);
  const suggestions = await generateCategorySuggestions(category, topMerchants);

  return {
    category,
    this_month_kg: roundKg(thisMonthCategoryKg),
    percent_of_total: percentOfTotal,
    top_merchants: topMerchants,
    trend,
    suggestions
  };
}

export async function getComparison(userId: string) {
  const today = formatDate(new Date());
  const thisMonth = getPeriodBounds(today, "month");
  const lastMonth = offsetPeriod(thisMonth.periodStart, "month", -1);
  const [currentSummary, previousSummary] = await Promise.all([
    getSummary(userId, "month", thisMonth.periodStart),
    getSummary(userId, "month", lastMonth.periodStart)
  ]);
  const userMonthlyKg = currentSummary.total_carbon_kg;
  const percentile = Math.min(
    99,
    Math.max(1, Math.round((userMonthlyKg / nationalAverageMonthlyKg) * 50))
  );

  return {
    user_monthly_kg: userMonthlyKg,
    national_average_kg: nationalAverageMonthlyKg,
    city_average_kg: nationalAverageMonthlyKg,
    vs_last_month_percent: percentChange(
      userMonthlyKg,
      previousSummary.total_carbon_kg
    ),
    percentile,
    ranking_text: `You're in the top ${percentile}% in the US`
  };
}

export async function generateDailyInsight(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("transactions")
    .select("merchant_name,carbon_kg,carbon_category,transaction_date")
    .eq("user_id", userId)
    .eq("is_removed", false)
    .order("transaction_date", { ascending: false })
    .limit(10);

  if (error || !data || data.length === 0) {
    return getNewUserInsight();
  }

  try {
    const response = await chatWithAI(
      "Write one concise, friendly carbon-footprint insight sentence based on recent transactions. Do not mention uncertainty or raw JSON.",
      JSON.stringify(data)
    );

    return (
      response.trim() ||
      "Your recent spending shows a few simple opportunities to lower carbon this week."
    );
  } catch {
    return "Your recent spending shows a few simple opportunities to lower carbon this week.";
  }
}

function getNewUserInsight(): string {
  const insights = [
    "Complete your first challenge today to start tracking real carbon savings.",
    "Small daily actions add up fast: one plant-based meal can save about 2.5 kg of CO2.",
    "Your daily challenge is the quickest way to earn XP and build a lower-carbon streak.",
    "Try finishing three challenges this week to build momentum and unlock achievements.",
    "Your onboarding estimate gives us a starting point. Completed challenges will make it more personal."
  ];
  const dayIndex = new Date().getUTCDate() % insights.length;

  return insights[dayIndex];
}

export async function refreshCarbonSummaries(
  userId: string,
  date: string
): Promise<void> {
  for (const period of getAffectedPeriods(date)) {
    await recalculateCarbonSummary(
      userId,
      period.periodType,
      period.periodStart,
      period.periodEnd
    );
  }
}

async function getTodayChallengeStatus(
  userId: string,
  today: string
): Promise<"pending" | "accepted" | "completed" | null> {
  const { data, error } = await supabaseAdmin
    .from("user_challenges")
    .select("status")
    .eq("user_id", userId)
    .eq("date_assigned", today)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ status: "pending" | "accepted" | "completed" | "skipped" }>();

  if (error || !data || data.status === "skipped") {
    return null;
  }

  return data.status;
}

async function getSummary(
  userId: string,
  periodType: PeriodType,
  periodStart: string
) {
  const { data, error } = await supabaseAdmin
    .from("carbon_summaries")
    .select("*")
    .eq("user_id", userId)
    .eq("period_type", periodType)
    .eq("period_start", periodStart)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to load carbon summary");
  }

  return (
    data ?? {
      total_carbon_kg: 0,
      food_kg: 0,
      transport_kg: 0,
      home_kg: 0,
      shopping_kg: 0,
      travel_kg: 0,
      other_kg: 0,
      challenge_savings_kg: 0
    }
  );
}

function applyTransactionFilters<T>(query: T, filters: TransactionFilters): T {
  let filteredQuery = query as T & {
    eq: (column: string, value: unknown) => typeof filteredQuery;
    gte: (column: string, value: unknown) => typeof filteredQuery;
    lte: (column: string, value: unknown) => typeof filteredQuery;
  };

  if (filters.category) {
    filteredQuery = filteredQuery.eq("carbon_category", filters.category);
  }

  if (filters.date_from) {
    filteredQuery = filteredQuery.gte("transaction_date", filters.date_from);
  }

  if (filters.date_to) {
    filteredQuery = filteredQuery.lte("transaction_date", filters.date_to);
  }

  return filteredQuery;
}

function toCategoryBreakdownKg(summary: Record<string, unknown>) {
  return {
    food: Number(summary.food_kg ?? 0),
    transport: Number(summary.transport_kg ?? 0),
    home: Number(summary.home_kg ?? 0),
    shopping: Number(summary.shopping_kg ?? 0),
    travel: Number(summary.travel_kg ?? 0),
    other: Number(summary.other_kg ?? 0)
  };
}

function isZeroSummary(summary: Record<string, unknown>): boolean {
  return Object.values(toCategoryBreakdownKg(summary)).every((value) => value === 0);
}

function estimateWeeklyFromOnboarding(onboardingData: Json): WeeklyCarbonEstimate | null {
  if (!onboardingData || typeof onboardingData !== "object" || Array.isArray(onboardingData)) {
    return null;
  }

  const data = onboardingData as Record<string, Json | undefined>;
  const storedBreakdown = data.category_breakdown;

  if (storedBreakdown && typeof storedBreakdown === "object" && !Array.isArray(storedBreakdown)) {
    const annualTons = storedBreakdown as Record<string, Json | undefined>;
    const categories = {
      food: annualTonsToWeeklyKg(annualTons.food),
      transport: annualTonsToWeeklyKg(annualTons.transport),
      home: annualTonsToWeeklyKg(annualTons.home),
      shopping: annualTonsToWeeklyKg(annualTons.shopping),
      travel: annualTonsToWeeklyKg(annualTons.travel),
      other: 0
    };
    const weeklyTotal = roundKg(
      Object.values(categories).reduce((total, value) => total + value, 0)
    );

    return weeklyTotal > 0 ? { weekly_total: weeklyTotal, categories } : null;
  }

  const categories = {
    transport: weeklyLookup(data.transport_mode, {
      car: 50,
      public_transit: 15,
      bike: 2,
      wfh: 5,
      mixed: 25
    }),
    food: weeklyLookup(data.meat_frequency, {
      daily: 35,
      few_times_week: 25,
      rarely: 18,
      never: 12
    }),
    shopping: weeklyLookup(data.monthly_spending, {
      under_2k: 15,
      "2k_to_5k": 30,
      "5k_to_10k": 55,
      over_10k: 85
    }),
    home: 20,
    travel: weeklyLookup(data.flight_frequency, {
      never: 0,
      "1_2_yearly": 5,
      monthly: 25,
      weekly: 80
    }),
    other: 0
  };
  const weeklyTotal = roundKg(
    Object.values(categories).reduce((total, value) => total + value, 0)
  );

  return weeklyTotal > 0 ? { weekly_total: weeklyTotal, categories } : null;
}

function annualTonsToWeeklyKg(value: Json | undefined): number {
  return roundKg((Number(value ?? 0) * 1000) / 52);
}

function weeklyLookup(value: Json | undefined, map: Record<string, number>): number {
  return typeof value === "string" ? map[value] ?? 0 : 0;
}

function getXpToNextLevel(xp: number): number {
  const nextLevel = levelThresholds.find((level) => level.xp > xp);
  return nextLevel ? nextLevel.xp - xp : 0;
}

function percentChange(current: number, previous: number): number {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return Math.round(((current - previous) / previous) * 100);
}

function getExtremePeriod(
  trends: Array<{ period_start: string; total_kg: number }>,
  type: "best" | "worst"
) {
  if (trends.length === 0) {
    return { date: null, total_kg: 0 };
  }

  const result = trends.reduce((selected, current) => {
    return type === "best"
      ? current.total_kg < selected.total_kg
        ? current
        : selected
      : current.total_kg > selected.total_kg
        ? current
        : selected;
  });

  return { date: result.period_start, total_kg: result.total_kg };
}

function getCategoryIcon(category: CarbonCategory): string {
  const icons: Record<CarbonCategory, string> = {
    food: "utensils",
    transport: "car",
    home: "house",
    shopping: "shopping-bag",
    travel: "plane",
    other: "circle"
  };

  return icons[category];
}

async function getCategoryWeeklyTrend(userId: string, category: CarbonCategory) {
  const { data, error } = await supabaseAdmin
    .from("carbon_summaries")
    .select("period_start,food_kg,transport_kg,home_kg,shopping_kg,travel_kg,other_kg")
    .eq("user_id", userId)
    .eq("period_type", "week")
    .order("period_start", { ascending: false })
    .limit(8);

  if (error) {
    throw new Error("Unable to load category trend");
  }

  return [...(data ?? [])].reverse().map((summary) => ({
    week: summary.period_start,
    kg: Number(summary[`${category}_kg`] ?? 0)
  }));
}

async function generateCategorySuggestions(
  category: CarbonCategory,
  topMerchants: Array<{ name: string; total_kg: number; transaction_count: number }>
): Promise<string[]> {
  try {
    const response = await chatWithAI(
      "Return JSON only: { \"suggestions\": [string, string, string] }. Give three practical carbon reduction tips for the category and merchants.",
      JSON.stringify({ category, top_merchants: topMerchants })
    );
    const parsed = z
      .object({ suggestions: z.array(z.string()).min(1).max(3) })
      .parse(JSON.parse(extractJson(response)));

    return parsed.suggestions;
  } catch {
    return getFallbackSuggestions(category);
  }
}

function getFallbackSuggestions(category: CarbonCategory): string[] {
  const suggestions: Record<CarbonCategory, string[]> = {
    food: ["Try one plant-based meal this week.", "Plan meals before shopping to reduce food waste."],
    transport: ["Combine errands into one trip.", "Replace one short drive with walking, biking, or transit."],
    home: ["Adjust your thermostat by one degree.", "Unplug idle chargers and standby devices."],
    shopping: ["Pause non-essential purchases for 24 hours.", "Look for secondhand or repair options first."],
    travel: ["Choose rail or nonstop flights when practical.", "Bundle trips to reduce repeated travel."],
    other: ["Review recurring purchases and choose lower-impact alternatives.", "Pick one simple habit to repeat weekly."]
  };

  return suggestions[category];
}

function getAffectedPeriods(date: string): Array<{
  periodType: PeriodType;
  periodStart: string;
  periodEnd: string;
}> {
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(parsedDate);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const weekStart = new Date(parsedDate);
  const daysSinceMonday = (weekStart.getUTCDay() + 6) % 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const monthStart = new Date(
    Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), 1)
  );
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

  return [
    { periodType: "day", periodStart: formatDate(parsedDate), periodEnd: formatDate(dayEnd) },
    { periodType: "week", periodStart: formatDate(weekStart), periodEnd: formatDate(weekEnd) },
    { periodType: "month", periodStart: formatDate(monthStart), periodEnd: formatDate(monthEnd) }
  ];
}

async function recalculateCarbonSummary(
  userId: string,
  periodType: PeriodType,
  periodStart: string,
  periodEnd: string
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("transactions")
    .select("carbon_kg,carbon_category")
    .eq("user_id", userId)
    .eq("is_removed", false)
    .gte("transaction_date", periodStart)
    .lt("transaction_date", periodEnd);

  if (error || !data) {
    throw new Error("Unable to refresh carbon summaries");
  }

  const summary = data.reduce(
    (current, transaction) => {
      const carbonKg = Number(transaction.carbon_kg);
      const categoryKey = `${transaction.carbon_category}_kg` as keyof typeof current;
      return {
        ...current,
        total_carbon_kg: current.total_carbon_kg + carbonKg,
        [categoryKey]: current[categoryKey] + carbonKg
      };
    },
    {
      total_carbon_kg: 0,
      food_kg: 0,
      transport_kg: 0,
      home_kg: 0,
      shopping_kg: 0,
      travel_kg: 0,
      other_kg: 0
    }
  );

  const { error: upsertError } = await supabaseAdmin.from("carbon_summaries").upsert(
    {
      user_id: userId,
      period_type: periodType,
      period_start: periodStart,
      total_carbon_kg: roundKg(summary.total_carbon_kg),
      food_kg: roundKg(summary.food_kg),
      transport_kg: roundKg(summary.transport_kg),
      home_kg: roundKg(summary.home_kg),
      shopping_kg: roundKg(summary.shopping_kg),
      travel_kg: roundKg(summary.travel_kg),
      other_kg: roundKg(summary.other_kg),
      challenge_savings_kg: 0
    },
    { onConflict: "user_id,period_type,period_start" }
  );

  if (upsertError) {
    throw new Error("Unable to save carbon summaries");
  }
}

function getPeriodBounds(date: string, periodType: PeriodType) {
  return getAffectedPeriods(date).find((period) => period.periodType === periodType) as {
    periodType: PeriodType;
    periodStart: string;
    periodEnd: string;
  };
}

function offsetPeriod(periodStart: string, periodType: "week" | "month", offset: number) {
  const date = new Date(`${periodStart}T00:00:00.000Z`);

  if (periodType === "week") {
    date.setUTCDate(date.getUTCDate() + offset * 7);
  } else {
    date.setUTCMonth(date.getUTCMonth() + offset);
  }

  return getPeriodBounds(formatDate(date), periodType);
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
