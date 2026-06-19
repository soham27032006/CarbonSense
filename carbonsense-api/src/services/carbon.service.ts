/**
 * Service layer for CarbonSense domain logic. Keeps persistence, third-party API calls, and calculations behind controller-safe functions.
 */
import { z } from "zod";
import type { ChallengeCategory } from "../types";
import type { CarbonCategory, CarbonSource, Json } from "../types";
import { supabaseAdmin } from "../config/supabase";
import { addDaysToDateString, daysAgoIndia, todayIndia } from "../utils/date";
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

/**
 * Runs the getCategoryBreakdown service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
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

/**
 * Runs the calculateCarbonFromOnboarding service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
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

/**
 * Runs the calculateCarbonAge service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export function calculateCarbonAge(
  bioAge: number,
  annualTons: number,
  country: string
): number {
  const countryTargetTons = getCountryTargetTons(country);
  const carbonAge = bioAge + (annualTons - countryTargetTons) * 2;

  return Math.max(0, Math.round(carbonAge));
}

/**
 * Runs the getPercentile service workflow for CarbonSense domain data.
 * @param annualTons - Input consumed by this workflow.
 * @param country - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export function getPercentile(annualTons: number, country: string): number {
  const averageTons = country.toUpperCase() === "US" ? US_AVERAGE_TONS : US_AVERAGE_TONS;
  const percentile = (annualTons / averageTons) * 50;

  return Math.min(99, Math.max(1, Math.round(percentile)));
}

/**
 * Runs the getHighestCarbonCategory service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
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

/**
 * Runs the toChallengeCategory service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export function toChallengeCategory(
  category: keyof CategoryBreakdown
): ChallengeCategory {
  return category === "travel" ? "lifestyle" : category;
}

export const defaultBiologicalAge = DEFAULT_BIOLOGICAL_AGE;

/**
 * Runs the normalizeMerchantName service workflow for CarbonSense domain data.
 * @param merchantName - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
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

/**
 * Runs the classifyTransaction service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
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

/**
 * Runs the classifyWithAI service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
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

/**
 * Runs the getDashboard service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function getDashboard(userId: string) {
  const today = todayIndia();
  const week = getDateRangeBounds(today, 6);
  const previousWeek = getDateRangeBounds(daysAgoIndia(7), 6);
  const month = getMonthRangeBounds(today);
  const previousMonth = getMonthRangeBounds(offsetPeriod(month.start, "month", -1).periodStart);
  const yearStart = `${today.slice(0, 4)}-01-01`;
  const yearEnd = `${today.slice(0, 4)}-12-31`;

  const [
    { data: user, error: userError },
    todayCarbon,
    thisWeek,
    previousWeekCarbon,
    thisMonth,
    previousMonthCarbon,
    thisYear,
    aiInsight,
    challengeStatus,
    hasLiveData
  ] =
    await Promise.all([
      supabaseAdmin
        .from("users")
        .select("carbon_age,level,level_name,xp,streak_count,streak_max,streak_freeze_available,onboarding_data")
        .eq("id", userId)
        .single(),
      getChallengeCarbonSnapshot(userId, today, today),
      getChallengeCarbonSnapshot(userId, week.start, week.end),
      getChallengeCarbonSnapshot(userId, previousWeek.start, previousWeek.end),
      getChallengeCarbonSnapshot(userId, month.start, month.end),
      getChallengeCarbonSnapshot(userId, previousMonth.start, previousMonth.end),
      getChallengeCarbonSnapshot(userId, yearStart, yearEnd),
      generateDailyInsightForDashboard(userId),
      getTodayChallengeStatus(userId, today),
      hasAnyLiveCarbonData(userId)
    ]);

  if (userError || !user) {
    throw new Error("Unable to load dashboard profile");
  }

  const onboarding = (user.onboarding_data ?? {}) as Record<string, unknown>;
  const biologicalAge = Number(
    (onboarding.biological_age as number | undefined) ?? DEFAULT_BIOLOGICAL_AGE
  );
  const userCountry = String((onboarding.country as string | undefined) ?? "India");
  const targetTons = getCountryTargetTons(userCountry);

  const monthlyTotalKg = thisMonth.total_carbon_kg || todayCarbon.total_carbon_kg;
  const estimatedAnnualTonsFromMonthly = (monthlyTotalKg * 12) / 1000;
  const estimatedAnnualTons = monthlyTotalKg > 0
    ? estimatedAnnualTonsFromMonthly
    : Number(
        (onboarding.estimated_annual_tons as number | undefined) ??
          (onboarding.annual_carbon_tons as number | undefined) ??
          0
      );
  const carbonAge = Number.isFinite(user.carbon_age) && user.carbon_age > 0
    ? Number(user.carbon_age)
    : calculateCarbonAge(biologicalAge, estimatedAnnualTons, userCountry);

  const realAge = biologicalAge;
  const targetAge = Math.max(20, biologicalAge - 5);

  return {
    carbon_age: carbonAge,
    real_age: realAge,
    target_age: targetAge,
    target_tons: targetTons,
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
      carbon_kg: todayCarbon.total_carbon_kg,
      challenge_status: challengeStatus
    },
    this_week: {
      total_carbon_kg: thisWeek.total_carbon_kg,
      vs_last_week_percent: percentChange(
        thisWeek.total_carbon_kg,
        previousWeekCarbon.total_carbon_kg
      ),
      category_breakdown: thisWeek.category_breakdown,
      is_estimated: !hasLiveData
    },
    this_month: {
      total_carbon_kg: thisMonth.total_carbon_kg,
      vs_last_month_percent: percentChange(
        thisMonth.total_carbon_kg,
        previousMonthCarbon.total_carbon_kg
      ),
      daily_average_kg: roundKg(
        thisMonth.total_carbon_kg / Math.max(Number(today.slice(8, 10)), 1)
      ),
      category_breakdown: thisMonth.category_breakdown,
      is_estimated: !hasLiveData
    },
    this_year: {
      total_carbon_kg: thisYear.total_carbon_kg,
      category_breakdown: thisYear.category_breakdown,
      is_estimated: !hasLiveData
    },
    ai_insight: aiInsight
  };
}

/**
 * Runs the getTransactions service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
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
      "id,merchant_name,amount,currency,carbon_kg,carbon_category,carbon_confidence,transaction_date",
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
      merchant: transaction.merchant_name,
      merchant_name: transaction.merchant_name,
      category: transaction.carbon_category,
      carbon_category: transaction.carbon_category,
      amount: Number(transaction.amount),
      currency: (transaction as { currency?: string }).currency ?? "₹",
      carbon_kg: Number(transaction.carbon_kg),
      confidence: Number(transaction.carbon_confidence),
      occurred_at: transaction.transaction_date,
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

/**
 * Runs the getTrends service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function getTrends(
  userId: string,
  period: "weekly" | "monthly",
  range: number
) {
  const periodType: PeriodType = period === "weekly" ? "week" : "month";
  const [{ data, error }, { data: user, error: userError }] = await Promise.all([
    supabaseAdmin
      .from("carbon_summaries")
      .select("*")
      .eq("user_id", userId)
      .eq("period_type", periodType)
      .order("period_start", { ascending: false })
      .limit(range),
    supabaseAdmin
      .from("users")
      .select("onboarding_data")
      .eq("id", userId)
      .maybeSingle()
  ]);

  if (error || userError) {
    throw new Error("Unable to load carbon trends");
  }

  const rows = data ?? [];
  const estimate = rows.length === 0 ? estimateWeeklyFromOnboarding(user?.onboarding_data) : null;

  const points = estimate
    ? buildEstimatedTrendPoints(periodType, range, estimate)
    : [...rows]
        .reverse()
        .map((summary, idx, all) => buildLiveTrendPoint(summary, all, idx, periodType));

  const total = points.reduce((sum, p) => sum + p.value, 0);
  const average = points.length > 0 ? roundKg(total / points.length) : 0;
  const first = points[0]?.value ?? 0;
  const last = points[points.length - 1]?.value ?? 0;

  return {
    points,
    period: periodType,
    range,
    unit: "kg",
    total: roundKg(total),
    average,
    change_percent: percentChange(last, first),
    is_estimated: !!estimate,
    best_period: getExtremePeriod(
      points.map((p) => ({ period_start: p.label, total_kg: p.value })),
      "best"
    ),
    worst_period: getExtremePeriod(
      points.map((p) => ({ period_start: p.label, total_kg: p.value })),
      "worst"
    )
  };
}

function buildLiveTrendPoint(
  summary: Record<string, unknown>,
  all: Record<string, unknown>[],
  idx: number,
  periodType: "week" | "month"
) {
  const value = roundKg(Number(summary.total_carbon_kg ?? 0));
  const prev = idx > 0 ? roundKg(Number(all[idx - 1].total_carbon_kg ?? 0)) : value;
  return {
    label: formatPeriodLabel(
      String(summary.period_start ?? ""),
      idx,
      all.length,
      periodType
    ),
    period_start: String(summary.period_start ?? ""),
    value,
    previous: prev
  };
}

function buildEstimatedTrendPoints(
  periodType: "week" | "month",
  range: number,
  estimate: WeeklyCarbonEstimate
): Array<{ label: string; period_start: string; value: number; previous: number }> {
  const safeRange = Math.max(1, range);
  const baseTotalKg =
    periodType === "week" ? estimate.weekly_total : roundKg(estimate.weekly_total * 4.33);
  const baseValue = baseTotalKg / safeRange;

  const current = getPeriodBounds(todayIndia(), periodType);

  return Array.from({ length: safeRange }, (_, index) => {
    const stepsBack = safeRange - index - 1;
    const period = offsetPeriod(current.periodStart, periodType, -stepsBack);
    const variation = 1 + Math.sin((index + 1) * 0.85) * 0.18 + Math.cos(index * 0.4) * 0.06;
    const value = roundKg(Math.max(baseValue * variation, baseValue * 0.6));
    const previousValue = index > 0
      ? roundKg(Math.max(baseValue * (1 + Math.sin(index * 0.85) * 0.18 + Math.cos((index - 1) * 0.4) * 0.06), baseValue * 0.6))
      : value;

    return {
      label: formatPeriodLabel(period.periodStart, index, safeRange, periodType),
      period_start: period.periodStart,
      value,
      previous: previousValue
    };
  });
}

function formatPeriodLabel(
  periodStart: string,
  index: number,
  total: number,
  periodType: "week" | "month"
): string {
  if (!periodStart) return periodType === "week" ? `W${index + 1}` : `M${index + 1}`;
  const parsed = new Date(`${periodStart}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return periodStart;
  if (periodType === "week") {
    const endOfWeek = new Date(parsed);
    endOfWeek.setUTCDate(endOfWeek.getUTCDate() + 6);
    if (total <= 6) {
      return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    }
    return `${parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
  }
  return parsed.toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });
}

/**
 * Runs the getCategoryDetail service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function getCategoryDetail(
  userId: string,
  category: CarbonCategory
) {
  const today = todayIndia();
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

/**
 * Runs the getComparison service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function getComparison(userId: string) {
  const today = todayIndia();
  const thisMonth = getPeriodBounds(today, "month");
  const lastMonth = offsetPeriod(thisMonth.periodStart, "month", -1);
  const [currentSummary, previousSummary, { data: user, error: userError }] = await Promise.all([
    getSummary(userId, "month", thisMonth.periodStart),
    getSummary(userId, "month", lastMonth.periodStart),
    supabaseAdmin
      .from("users")
      .select("onboarding_data")
      .eq("id", userId)
      .maybeSingle()
  ]);
  if (userError) {
    throw new Error("Unable to load comparison profile");
  }

  const estimate = isZeroSummary(currentSummary)
    ? estimateWeeklyFromOnboarding(user?.onboarding_data)
    : null;
  const userMonthlyKg = estimate
    ? roundKg(estimate.weekly_total * 4.33)
    : currentSummary.total_carbon_kg;

  const onboarding = (user?.onboarding_data ?? {}) as Record<string, unknown>;
  const settings = (onboarding.settings ?? {}) as Record<string, unknown>;

  const rawCountry = String(
    (settings.country as string | undefined) ??
      (onboarding.country as string | undefined) ??
      "India"
  ).trim();
  const countryName = capitalizeCountryName(rawCountry);

  const nationalAvgKg = COUNTRY_AVG_KG[countryName] ?? COUNTRY_AVG_KG.default;
  const parisTargetKg = PARIS_TARGET_KG;

  const percentile = Math.round((1 - userMonthlyKg / nationalAvgKg) * 100);
  const topPercent = Math.max(1, Math.min(99, percentile));
  const vsLast = percentChange(userMonthlyKg, previousSummary.total_carbon_kg);

  return {
    user_monthly_kg: userMonthlyKg,
    national_average_kg: nationalAvgKg,
    city_average_kg: nationalAvgKg,
    paris_target_kg: parisTargetKg,
    vs_last_month_percent: vsLast,
    top_percent: topPercent,
    better_than_percent: topPercent,
    improving: vsLast <= 0,
    ranking_text: `You're in the top ${topPercent}% in ${countryName}`,
    country: countryName,
    message: `Your monthly footprint is ${formatKg(userMonthlyKg)} versus the ${countryName} average of ${formatKg(nationalAvgKg)}.`
  };
}

const COUNTRY_AVG_KG: Record<string, number> = {
  India: 167,
  US: 1333,
  UK: 833,
  Canada: 1467,
  Australia: 1567,
  Germany: 933,
  France: 700,
  default: 500
};

const PARIS_TARGET_KG = 333;

function capitalizeCountryName(name: string): string {
  if (!name) return "India";
  const normalized = name.toLowerCase().trim();
  const known: Record<string, string> = {
    india: "India",
    in: "India",
    "united states": "US",
    us: "US",
    usa: "US",
    "united kingdom": "UK",
    uk: "UK",
    gb: "UK",
    england: "UK",
    canada: "Canada",
    ca: "Canada",
    australia: "Australia",
    au: "Australia",
    germany: "Germany",
    de: "Germany",
    france: "France",
    fr: "France"
  };
  return known[normalized] ?? (name.charAt(0).toUpperCase() + name.slice(1));
}

function formatKg(value: number): string {
  return `${Math.round(value)} kg`;
}

/**
 * Runs the generateDailyInsight service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
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

async function generateDailyInsightForDashboard(userId: string): Promise<string> {
  return Promise.race([
    generateDailyInsight(userId),
    new Promise<string>((resolve) => {
      setTimeout(() => {
        resolve("Your dashboard is ready. Connect transactions or complete today's challenge to unlock sharper insights.");
      }, 1200);
    })
  ]);
}

function getNewUserInsight(): string {
  const insights = [
    "Complete your first challenge today to start tracking real carbon savings.",
    "Small daily actions add up fast: one plant-based meal can save about 2.5 kg of CO2.",
    "Your daily challenge is the quickest way to earn XP and build a lower-carbon streak.",
    "Try finishing three challenges this week to build momentum and unlock achievements.",
    "Your onboarding estimate gives us a starting point. Completed challenges will make it more personal."
  ];
  const dayIndex = Number(todayIndia().slice(8, 10)) % insights.length;

  return insights[dayIndex];
}

/**
 * Runs the refreshCarbonSummaries service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
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

type ChallengeCarbonSnapshot = {
  total_carbon_kg: number;
  category_breakdown: Record<CarbonCategory, number>;
};

async function getChallengeCarbonSnapshot(
  userId: string,
  startDate: string,
  endDate: string
): Promise<ChallengeCarbonSnapshot> {
  const { data, error } = await supabaseAdmin
    .from("user_challenges")
    .select("completed_at, challenge:challenges(category,carbon_save_kg)")
    .eq("user_id", userId)
    .eq("status", "completed")
    .not("completed_at", "is", null)
    .gte("completed_at", `${startDate}T00:00:00.000Z`)
    .lte("completed_at", `${endDate}T23:59:59.999Z`);

  if (error) {
    throw new Error("Unable to load challenge carbon totals");
  }

  const category_breakdown: Record<CarbonCategory, number> = {
    food: 0,
    transport: 0,
    home: 0,
    shopping: 0,
    travel: 0,
    other: 0
  };

  for (const row of data ?? []) {
    const challengeValue = Array.isArray(row.challenge)
      ? row.challenge[0]
      : row.challenge;
    const category = mapChallengeCategoryToCarbonCategory(
      challengeValue?.category
    );
    const carbonSaveKg = Number(challengeValue?.carbon_save_kg ?? 0);
    category_breakdown[category] = roundKg(
      category_breakdown[category] + carbonSaveKg
    );
  }

  const total_carbon_kg = roundKg(
    Object.values(category_breakdown).reduce((sum, value) => sum + value, 0)
  );

  return {
    total_carbon_kg,
    category_breakdown
  };
}

function mapChallengeCategoryToCarbonCategory(
  category: string | null | undefined
): CarbonCategory {
  switch (category) {
    case "food":
    case "transport":
    case "home":
    case "shopping":
      return category;
    case "lifestyle":
      return "other";
    default:
      return "other";
  }
}

function getDateRangeBounds(endDate: string, lookbackDays: number) {
  return {
    start: daysAgoFromDate(endDate, lookbackDays),
    end: endDate
  };
}

function getMonthRangeBounds(date: string) {
  const { periodStart, periodEnd } = getPeriodBounds(date, "month");
  return {
    start: periodStart,
    end: addDaysToDateString(periodEnd, -1)
  };
}

function daysAgoFromDate(date: string, days: number): string {
  return addDaysToDateString(date, -days);
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

function getEstimatedTrends(
  periodType: "week" | "month",
  range: number,
  estimate: WeeklyCarbonEstimate
) {
  const safeRange = Math.max(1, range);
  const current = getPeriodBounds(todayIndia(), periodType);
  const total =
    periodType === "week"
      ? estimate.weekly_total
      : roundKg(estimate.weekly_total * 4.33);
  const categoryMultiplier = periodType === "week" ? 1 : 4.33;

  return Array.from({ length: safeRange }, (_, index) => {
    const stepsBack = safeRange - index - 1;
    const period = offsetPeriod(current.periodStart, periodType, -stepsBack);
    const category_breakdown = Object.fromEntries(
      Object.entries(estimate.categories).map(([category, value]) => [
        category,
        roundKg(value * categoryMultiplier)
      ])
    ) as Record<CarbonCategory, number>;

    return {
      period_start: period.periodStart,
      total_kg: total,
      category_breakdown
    };
  });
}

function annualTonsToWeeklyKg(value: Json | undefined): number {
  return roundKg((Number(value ?? 0) * 1000) / 52);
}

async function hasAnyLiveCarbonData(userId: string): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  return !error && (count ?? 0) > 0;
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
