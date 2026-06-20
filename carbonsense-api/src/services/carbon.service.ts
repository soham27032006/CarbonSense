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
import { chatWithAI, classifyCarbon, classifyCarbonBatch, extractJson } from "./ai.service";

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

type BatchInput = {
  merchantName: string;
  plaidCategory: string;
  amount: number;
};

/**
 * Classifies a batch of transactions, resolving local merchant/category lookups
 * first and falling back to a single batched Gemini call for the remainder.
 * @param inputs - The transactions needing classification.
 * @returns One classification per input, in the same order.
 * @throws When the batched AI call fails or returns malformed JSON.
 */
export async function classifyTransactionsBatch(
  inputs: BatchInput[]
): Promise<TransactionCarbonClassification[]> {
  if (inputs.length === 0) {
    return [];
  }

  const results: (TransactionCarbonClassification | null)[] = new Array(inputs.length).fill(null);
  const aiIndices: number[] = [];
  const aiInputs: Array<{ merchant: string; category: string; amount: number }> = [];

  inputs.forEach((input, index) => {
    const local = classifyTransactionLocally(input.merchantName, input.plaidCategory, input.amount);
    if (local) {
      results[index] = local;
      return;
    }
    aiIndices.push(index);
    aiInputs.push({
      merchant: input.merchantName,
      category: input.plaidCategory,
      amount: input.amount
    });
  });

  if (aiIndices.length === 0) {
    return results as TransactionCarbonClassification[];
  }

  const aiResults = await classifyCarbonBatch(aiInputs);
  aiIndices.forEach((resultIndex, aiOffset) => {
    const parsed = aiResults[aiOffset];
    if (!parsed) {
      results[resultIndex] = buildUnclassifiedFallback(
        inputs[resultIndex].amount,
        inputs[resultIndex].plaidCategory
      );
      return;
    }
    const amount = inputs[resultIndex].amount;
    results[resultIndex] = {
      carbon_kg: roundKg(Math.abs(amount) * parsed.emission_factor_per_dollar),
      carbon_category: parsed.carbon_category,
      confidence: AI_MATCH_CONFIDENCE,
      source: "ai",
      factor_per_dollar: parsed.emission_factor_per_dollar,
      reasoning: parsed.reasoning
    };
  });

  return results as TransactionCarbonClassification[];
}

function classifyTransactionLocally(
  merchantName: string,
  plaidCategory: string,
  amount: number
): TransactionCarbonClassification | null {
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

  return null;
}

function buildUnclassifiedFallback(amount: number, category: string): TransactionCarbonClassification {
  const categoryFactor = findCategoryFactor(category) ?? {
    category: "other" as CarbonCategory,
    factor_per_dollar: 0
  };
  return toClassification(
    amount,
    categoryFactor,
    CATEGORY_MATCH_CONFIDENCE,
    "emission_factor"
  );
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
  return await getDashboardWorkflow(userId);
}

/**
 * Executes the extracted getDashboard service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `getDashboard`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function getDashboardWorkflow(userId: string) {
  const ranges = getDashboardRanges();
  const data = await loadDashboardData(userId, ranges);
  const user = getDashboardUser(data);
  const ageMetrics = getDashboardAgeMetrics(user, data.thisMonth, data.todayCarbon);

  return buildDashboardResponse(ranges.today, user, data, ageMetrics);
}

/**
 * Builds date ranges used by the dashboard cards.
 * @returns Today, week, previous week, month, previous month, and year bounds.
 */
function getDashboardRanges() {
  const today = todayIndia();
  const month = getMonthRangeBounds(today);

  return {
    today, week: getDateRangeBounds(today, 6), previousWeek: getDateRangeBounds(daysAgoIndia(7), 6),
    month, previousMonth: getMonthRangeBounds(offsetPeriod(month.start, "month", -1).periodStart),
    yearStart: `${today.slice(0, 4)}-01-01`, yearEnd: `${today.slice(0, 4)}-12-31`
  };
}

/**
 * Loads all dashboard data in the same parallel batch as the original workflow.
 * @returns Dashboard profile, carbon windows, insight, challenge status, and data flag.
 */
async function loadDashboardData(userId: string, ranges: ReturnType<typeof getDashboardRanges>) {
  const [userResult, todayCarbon, thisWeek, previousWeekCarbon, thisMonth, previousMonthCarbon, thisYear, aiInsight, challengeStatus, hasLiveData] =
    await Promise.all([
      supabaseAdmin.from("users").select("carbon_age,level,level_name,xp,streak_count,streak_max,streak_freeze_available,onboarding_data").eq("id", userId).single(),
      getChallengeCarbonSnapshot(userId, ranges.today, ranges.today),
      getChallengeCarbonSnapshot(userId, ranges.week.start, ranges.week.end),
      getChallengeCarbonSnapshot(userId, ranges.previousWeek.start, ranges.previousWeek.end),
      getChallengeCarbonSnapshot(userId, ranges.month.start, ranges.month.end),
      getChallengeCarbonSnapshot(userId, ranges.previousMonth.start, ranges.previousMonth.end),
      getChallengeCarbonSnapshot(userId, ranges.yearStart, ranges.yearEnd),
      generateDailyInsightForDashboard(userId), getTodayChallengeStatus(userId, ranges.today), hasAnyLiveCarbonData(userId)
    ]);

  return { userResult, todayCarbon, thisWeek, previousWeekCarbon, thisMonth, previousMonthCarbon, thisYear, aiInsight, challengeStatus, hasLiveData };
}

/**
 * Extracts the dashboard user or raises the original profile error.
 * @returns Dashboard user profile row.
 * @throws When the dashboard profile cannot be loaded.
 */
function getDashboardUser(data: Awaited<ReturnType<typeof loadDashboardData>>) {
  if (data.userResult.error || !data.userResult.data) {
    throw new Error("Unable to load dashboard profile");
  }

  return data.userResult.data;
}

/**
 * Calculates carbon age, biological age, target age, and target tons.
 * @returns Dashboard age metrics.
 */
function getDashboardAgeMetrics(
  user: ReturnType<typeof getDashboardUser>,
  thisMonth: ChallengeCarbonSnapshot,
  todayCarbon: ChallengeCarbonSnapshot
) {
  const onboarding = (user.onboarding_data ?? {}) as Record<string, unknown>;
  const biologicalAge = Number((onboarding.biological_age as number | undefined) ?? DEFAULT_BIOLOGICAL_AGE);
  const userCountry = String((onboarding.country as string | undefined) ?? "India");
  const estimatedAnnualTons = getEstimatedAnnualTons(onboarding, thisMonth, todayCarbon);

  return {
    carbonAge: Number.isFinite(user.carbon_age) && user.carbon_age > 0
      ? Number(user.carbon_age)
      : calculateCarbonAge(biologicalAge, estimatedAnnualTons, userCountry),
    realAge: biologicalAge, targetAge: Math.max(20, biologicalAge - 5),
    targetTons: getCountryTargetTons(userCountry)
  };
}

/**
 * Resolves estimated annual tons from monthly/today totals or onboarding fallback.
 * @returns Estimated annual tons.
 */
function getEstimatedAnnualTons(
  onboarding: Record<string, unknown>,
  thisMonth: ChallengeCarbonSnapshot,
  todayCarbon: ChallengeCarbonSnapshot
): number {
  const monthlyTotalKg = thisMonth.total_carbon_kg || todayCarbon.total_carbon_kg;

  return monthlyTotalKg > 0
    ? (monthlyTotalKg * 12) / 1000
    : Number((onboarding.estimated_annual_tons as number | undefined) ?? (onboarding.annual_carbon_tons as number | undefined) ?? 0);
}

/**
 * Shapes dashboard data into the existing response contract.
 * @returns Dashboard payload.
 */
function buildDashboardResponse(
  today: string,
  user: ReturnType<typeof getDashboardUser>,
  data: Awaited<ReturnType<typeof loadDashboardData>>,
  ageMetrics: ReturnType<typeof getDashboardAgeMetrics>
) {
  return {
    carbon_age: ageMetrics.carbonAge, real_age: ageMetrics.realAge, target_age: ageMetrics.targetAge,
    target_tons: ageMetrics.targetTons, current_level: buildDashboardLevel(user),
    streak: buildDashboardStreak(user), today: buildDashboardToday(data),
    this_week: buildDashboardWeek(data), this_month: buildDashboardMonth(today, data),
    this_year: buildDashboardYear(data), ai_insight: data.aiInsight
  };
}

/**
 * Builds dashboard level details.
 * @returns Level, name, XP, and XP-to-next values.
 */
function buildDashboardLevel(user: ReturnType<typeof getDashboardUser>) {
  return { level: user.level, name: user.level_name, xp: user.xp, xp_to_next: getXpToNextLevel(user.xp) };
}

/**
 * Builds dashboard streak details.
 * @returns Current streak, max streak, and freeze availability.
 */
function buildDashboardStreak(user: ReturnType<typeof getDashboardUser>) {
  return { current: user.streak_count, max: user.streak_max, freeze_available: user.streak_freeze_available };
}

/**
 * Builds today's dashboard summary.
 * @returns Today's carbon and challenge status.
 */
function buildDashboardToday(data: Awaited<ReturnType<typeof loadDashboardData>>) {
  return { carbon_kg: data.todayCarbon.total_carbon_kg, challenge_status: data.challengeStatus };
}

/**
 * Builds this week's dashboard summary.
 * @returns Weekly total, comparison, breakdown, and estimate flag.
 */
function buildDashboardWeek(data: Awaited<ReturnType<typeof loadDashboardData>>) {
  return {
    total_carbon_kg: data.thisWeek.total_carbon_kg,
    vs_last_week_percent: percentChange(data.thisWeek.total_carbon_kg, data.previousWeekCarbon.total_carbon_kg),
    category_breakdown: data.thisWeek.category_breakdown, is_estimated: !data.hasLiveData
  };
}

/**
 * Builds this month's dashboard summary.
 * @returns Monthly total, comparison, daily average, breakdown, and estimate flag.
 */
function buildDashboardMonth(today: string, data: Awaited<ReturnType<typeof loadDashboardData>>) {
  return {
    total_carbon_kg: data.thisMonth.total_carbon_kg,
    vs_last_month_percent: percentChange(data.thisMonth.total_carbon_kg, data.previousMonthCarbon.total_carbon_kg),
    daily_average_kg: roundKg(data.thisMonth.total_carbon_kg / Math.max(Number(today.slice(8, 10)), 1)),
    category_breakdown: data.thisMonth.category_breakdown, is_estimated: !data.hasLiveData
  };
}

/**
 * Builds this year's dashboard summary.
 * @returns Yearly total, breakdown, and estimate flag.
 */
function buildDashboardYear(data: Awaited<ReturnType<typeof loadDashboardData>>) {
  return { total_carbon_kg: data.thisYear.total_carbon_kg, category_breakdown: data.thisYear.category_breakdown, is_estimated: !data.hasLiveData };
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
  return await getTransactionsWorkflow(userId, filters);
}

/**
 * Executes the extracted getTransactions service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `getTransactions`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function getTransactionsWorkflow(
  userId: string,
  filters: TransactionFilters
) {
  const pagination = getTransactionPagination(filters);
  const transactionRows = await loadTransactionRows(userId, filters, pagination);
  const totalCarbonKg = await loadTransactionCarbonTotal(userId, filters);

  return buildTransactionsResponse(transactionRows, pagination, totalCarbonKg);
}

/**
 * Normalizes transaction pagination inputs.
 * @returns Safe pagination values and range bounds.
 */
function getTransactionPagination(filters: TransactionFilters) {
  const page = Math.max(filters.page, 1);
  const limit = Math.min(Math.max(filters.limit, 1), 100);
  return { page, limit, from: (page - 1) * limit, to: page * limit - 1 };
}

/**
 * Loads filtered transaction rows for one page.
 * @returns Transaction rows and exact count.
 * @throws When transaction rows cannot be loaded.
 */
async function loadTransactionRows(userId: string, filters: TransactionFilters, pagination: ReturnType<typeof getTransactionPagination>) {
  let query = supabaseAdmin
    .from("transactions")
    .select("id,merchant_name,amount,currency,carbon_kg,carbon_category,carbon_confidence,transaction_date", { count: "exact" })
    .eq("user_id", userId)
    .eq("is_removed", false);

  query = applyTransactionFilters(query, filters);
  const { data, error, count } = await query.order("transaction_date", { ascending: false }).range(pagination.from, pagination.to);

  if (error) {
    throw new Error("Unable to load transactions");
  }

  return { data, count };
}

/**
 * Loads the filtered transaction carbon total.
 * @returns Rounded total carbon for filtered transactions.
 * @throws When transaction summary cannot be loaded.
 */
async function loadTransactionCarbonTotal(userId: string, filters: TransactionFilters): Promise<number> {
  let summaryQuery = supabaseAdmin.from("transactions").select("carbon_kg").eq("user_id", userId).eq("is_removed", false);
  summaryQuery = applyTransactionFilters(summaryQuery, filters);
  const { data: summaryRows, error: summaryError } = await summaryQuery;

  if (summaryError) {
    throw new Error("Unable to load transaction summary");
  }

  return roundKg((summaryRows ?? []).reduce((total, row) => total + Number(row.carbon_kg), 0));
}

/**
 * Shapes transaction rows, pagination, and summary into the response.
 * @returns Paginated transaction response.
 */
function buildTransactionsResponse(
  transactionRows: Awaited<ReturnType<typeof loadTransactionRows>>,
  pagination: ReturnType<typeof getTransactionPagination>,
  totalCarbonKg: number
) {
  const total = transactionRows.count ?? 0;
  return {
    transactions: (transactionRows.data ?? []).map(buildTransactionItem),
    pagination: { page: pagination.page, limit: pagination.limit, total, total_pages: Math.ceil(total / pagination.limit) },
    summary: { total_carbon_kg: totalCarbonKg, avg_per_transaction: total > 0 ? roundKg(totalCarbonKg / total) : 0 }
  };
}

/**
 * Shapes one transaction row into the API item contract.
 * @returns Transaction list item.
 */
function buildTransactionItem(transaction: NonNullable<Awaited<ReturnType<typeof loadTransactionRows>>["data"]>[number]) {
  return {
    id: transaction.id, merchant: transaction.merchant_name, merchant_name: transaction.merchant_name,
    category: transaction.carbon_category, carbon_category: transaction.carbon_category, amount: Number(transaction.amount),
    currency: (transaction as { currency?: string }).currency ?? "₹", carbon_kg: Number(transaction.carbon_kg),
    confidence: Number(transaction.carbon_confidence), occurred_at: transaction.transaction_date,
    date: transaction.transaction_date, icon: getCategoryIcon(transaction.carbon_category)
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
  return await getTrendsWorkflow(userId, period, range);
}

/**
 * Executes the extracted getTrends service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `getTrends`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function getTrendsWorkflow(
  userId: string,
  period: "weekly" | "monthly",
  range: number
) {
  const periodType: "week" | "month" = period === "weekly" ? "week" : "month";
  const trendData = await loadTrendData(userId, periodType, range);
  const estimate = getTrendEstimate(trendData);
  const points = buildTrendPoints(trendData.rows, periodType, range, estimate);

  return buildTrendsResponse(points, periodType, range, estimate);
}

/**
 * Loads trend summaries and onboarding fallback data.
 * @returns Trend summary rows and onboarding user row.
 * @throws When trend data cannot be loaded.
 */
async function loadTrendData(userId: string, periodType: PeriodType, range: number) {
  const [{ data, error }, { data: user, error: userError }] = await Promise.all([
    supabaseAdmin.from("carbon_summaries").select("*").eq("user_id", userId).eq("period_type", periodType).order("period_start", { ascending: false }).limit(range),
    supabaseAdmin.from("users").select("onboarding_data").eq("id", userId).maybeSingle()
  ]);

  if (error || userError) {
    throw new Error("Unable to load carbon trends");
  }

  return { rows: data ?? [], user };
}

/**
 * Builds onboarding trend estimate when no live rows exist.
 * @returns Weekly estimate or null.
 */
function getTrendEstimate(trendData: Awaited<ReturnType<typeof loadTrendData>>): WeeklyCarbonEstimate | null {
  return trendData.rows.length === 0 ? estimateWeeklyFromOnboarding(trendData.user?.onboarding_data) : null;
}

/**
 * Builds live or estimated trend points.
 * @returns Trend points for the requested range.
 */
function buildTrendPoints(
  rows: Awaited<ReturnType<typeof loadTrendData>>["rows"],
  periodType: "week" | "month",
  range: number,
  estimate: WeeklyCarbonEstimate | null
) {
  return estimate
    ? buildEstimatedTrendPoints(periodType, range, estimate)
    : [...rows].reverse().map((summary, idx, all) => buildLiveTrendPoint(summary, all, idx, periodType));
}

/**
 * Shapes trend points into the API response.
 * @returns Trend response payload.
 */
function buildTrendsResponse(
  points: ReturnType<typeof buildTrendPoints>,
  periodType: "week" | "month",
  range: number,
  estimate: WeeklyCarbonEstimate | null
) {
  const stats = getTrendStats(points);
  return {
    points, period: periodType, range, unit: "kg", total: roundKg(stats.total),
    average: stats.average, change_percent: percentChange(stats.last, stats.first),
    is_estimated: !!estimate, best_period: getTrendExtreme(points, "best"),
    worst_period: getTrendExtreme(points, "worst")
  };
}

/**
 * Calculates aggregate trend stats.
 * @returns Total, average, first, and last values.
 */
function getTrendStats(points: ReturnType<typeof buildTrendPoints>) {
  const total = points.reduce((sum, point) => sum + point.value, 0);
  return {
    total, average: points.length > 0 ? roundKg(total / points.length) : 0,
    first: points[0]?.value ?? 0, last: points[points.length - 1]?.value ?? 0
  };
}

/**
 * Finds the best or worst trend period.
 * @returns Extreme period response.
 */
function getTrendExtreme(points: ReturnType<typeof buildTrendPoints>, type: "best" | "worst") {
  return getExtremePeriod(points.map((point) => ({ period_start: point.label, total_kg: point.value })), type);
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
  return await getCategoryDetailWorkflow(userId, category);
}

/**
 * Executes the extracted getCategoryDetail service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `getCategoryDetail`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function getCategoryDetailWorkflow(
  userId: string,
  category: CarbonCategory
) {
  const month = getPeriodBounds(todayIndia(), "month");
  const thisMonth = await getSummary(userId, "month", month.periodStart);
  const categoryStats = getCategoryMonthStats(thisMonth, category);
  const topMerchants = await loadTopCategoryMerchants(userId, category, month);
  const [trend, suggestions] = await Promise.all([
    getCategoryWeeklyTrend(userId, category),
    generateCategorySuggestions(category, topMerchants)
  ]);

  return buildCategoryDetailResponse(category, categoryStats, topMerchants, trend, suggestions);
}

/**
 * Calculates this-month category total and percent of total.
 * @returns Category monthly stats.
 */
function getCategoryMonthStats(thisMonth: Awaited<ReturnType<typeof getSummary>>, category: CarbonCategory) {
  const thisMonthCategoryKg = Number(thisMonth[`${category}_kg`]);
  const percentOfTotal = thisMonth.total_carbon_kg > 0
    ? Math.round((thisMonthCategoryKg / thisMonth.total_carbon_kg) * 100)
    : 0;

  return { thisMonthCategoryKg, percentOfTotal };
}

/**
 * Loads and ranks top category merchants for the month.
 * @returns Top five merchants by category carbon total.
 * @throws When category transactions cannot be loaded.
 */
async function loadTopCategoryMerchants(
  userId: string,
  category: CarbonCategory,
  month: ReturnType<typeof getPeriodBounds>
) {
  const transactions = await loadCategoryTransactions(userId, category, month);
  return buildTopMerchants(transactions);
}

/**
 * Loads category transactions inside the month bounds.
 * @returns Category transaction rows.
 * @throws When category transactions cannot be loaded.
 */
async function loadCategoryTransactions(userId: string, category: CarbonCategory, month: ReturnType<typeof getPeriodBounds>) {
  const { data: transactions, error } = await supabaseAdmin
    .from("transactions")
    .select("merchant_name,carbon_kg,transaction_date")
    .eq("user_id", userId).eq("is_removed", false).eq("carbon_category", category)
    .gte("transaction_date", month.periodStart).lt("transaction_date", month.periodEnd);

  if (error) {
    throw new Error("Unable to load category transactions");
  }

  return transactions ?? [];
}

/**
 * Aggregates category transactions into ranked merchant rows.
 * @returns Top five merchants by rounded carbon total.
 */
function buildTopMerchants(transactions: Awaited<ReturnType<typeof loadCategoryTransactions>>) {
  return Object.values(
    transactions.reduce<Record<string, { name: string; total_kg: number; transaction_count: number }>>(
      addMerchantTotal,
      {}
    )
  )
    .map((merchant) => ({ ...merchant, total_kg: roundKg(merchant.total_kg) }))
    .sort((left, right) => right.total_kg - left.total_kg)
    .slice(0, 5);
}

/**
 * Adds one transaction to a merchant total map.
 * @returns Updated merchant totals.
 */
function addMerchantTotal(
  current: Record<string, { name: string; total_kg: number; transaction_count: number }>,
  transaction: Awaited<ReturnType<typeof loadCategoryTransactions>>[number]
) {
  const existing = current[transaction.merchant_name] ?? { name: transaction.merchant_name, total_kg: 0, transaction_count: 0 };
  return {
    ...current,
    [transaction.merchant_name]: { ...existing, total_kg: existing.total_kg + Number(transaction.carbon_kg), transaction_count: existing.transaction_count + 1 }
  };
}

/**
 * Shapes category detail data into the API response.
 * @returns Category detail response.
 */
function buildCategoryDetailResponse(
  category: CarbonCategory,
  stats: ReturnType<typeof getCategoryMonthStats>,
  topMerchants: ReturnType<typeof buildTopMerchants>,
  trend: Awaited<ReturnType<typeof getCategoryWeeklyTrend>>,
  suggestions: string[]
) {
  return {
    category, this_month_kg: roundKg(stats.thisMonthCategoryKg),
    percent_of_total: stats.percentOfTotal, top_merchants: topMerchants, trend, suggestions
  };
}

/**
 * Runs the getComparison service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function getComparison(userId: string) {
  return await getComparisonWorkflow(userId);
}

/**
 * Executes the extracted getComparison service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `getComparison`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function getComparisonWorkflow(userId: string) {
  const comparisonData = await loadComparisonData(userId);
  const userMonthlyKg = getComparisonMonthlyKg(comparisonData);
  const countryName = getComparisonCountry(comparisonData.user?.onboarding_data);
  const nationalAvgKg = COUNTRY_AVG_KG[countryName] ?? COUNTRY_AVG_KG.default;
  const vsLast = percentChange(userMonthlyKg, comparisonData.previousSummary.total_carbon_kg);
  const topPercent = getComparisonTopPercent(userMonthlyKg, nationalAvgKg);

  return buildComparisonResponse(userMonthlyKg, nationalAvgKg, vsLast, topPercent, countryName);
}

/**
 * Loads current/previous summaries and onboarding data for comparison.
 * @returns Data needed to build comparison response.
 * @throws When comparison profile cannot be loaded.
 */
async function loadComparisonData(userId: string) {
  const thisMonth = getPeriodBounds(todayIndia(), "month");
  const lastMonth = offsetPeriod(thisMonth.periodStart, "month", -1);
  const [currentSummary, previousSummary, { data: user, error: userError }] = await Promise.all([
    getSummary(userId, "month", thisMonth.periodStart),
    getSummary(userId, "month", lastMonth.periodStart),
    supabaseAdmin.from("users").select("onboarding_data").eq("id", userId).maybeSingle()
  ]);

  if (userError) {
    throw new Error("Unable to load comparison profile");
  }

  return { currentSummary, previousSummary, user };
}

/**
 * Resolves live or estimated monthly kilograms for comparison.
 * @returns Monthly carbon in kilograms.
 */
function getComparisonMonthlyKg(data: Awaited<ReturnType<typeof loadComparisonData>>): number {
  const estimate = isZeroSummary(data.currentSummary)
    ? estimateWeeklyFromOnboarding(data.user?.onboarding_data)
    : null;

  return estimate ? roundKg(estimate.weekly_total * 4.33) : data.currentSummary.total_carbon_kg;
}

/**
 * Extracts and normalizes comparison country from onboarding/settings.
 * @returns Display country name.
 */
function getComparisonCountry(onboardingData: Json | undefined): string {
  const onboarding = (onboardingData ?? {}) as Record<string, unknown>;
  const settings = (onboarding.settings ?? {}) as Record<string, unknown>;
  const rawCountry = String((settings.country as string | undefined) ?? (onboarding.country as string | undefined) ?? "India").trim();

  return capitalizeCountryName(rawCountry);
}

/**
 * Calculates bounded comparison percentile.
 * @returns Top percentile between 1 and 99.
 */
function getComparisonTopPercent(userMonthlyKg: number, nationalAvgKg: number): number {
  return Math.max(1, Math.min(99, Math.round((1 - userMonthlyKg / nationalAvgKg) * 100)));
}

/**
 * Shapes comparison values into the API response.
 * @returns Comparison response payload.
 */
function buildComparisonResponse(
  userMonthlyKg: number,
  nationalAvgKg: number,
  vsLast: number,
  topPercent: number,
  countryName: string
) {
  return {
    user_monthly_kg: userMonthlyKg, national_average_kg: nationalAvgKg,
    city_average_kg: nationalAvgKg, paris_target_kg: PARIS_TARGET_KG,
    vs_last_month_percent: vsLast, top_percent: topPercent, better_than_percent: topPercent,
    improving: vsLast <= 0, ranking_text: `You're in the top ${topPercent}% in ${countryName}`,
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
  return await getChallengeCarbonSnapshotWorkflow(userId, startDate, endDate);
}

/**
 * Executes the extracted getChallengeCarbonSnapshot service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `getChallengeCarbonSnapshot`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function getChallengeCarbonSnapshotWorkflow(
  userId: string,
  startDate: string,
  endDate: string
): Promise<ChallengeCarbonSnapshot> {
  const rows = await loadChallengeCarbonRows(userId, startDate, endDate);
  const category_breakdown = buildChallengeCarbonBreakdown(rows);

  return buildChallengeCarbonSnapshot(category_breakdown);
}

/**
 * Loads completed challenge carbon rows inside a date range.
 * @returns Completed challenge rows with joined challenge data.
 * @throws When challenge carbon totals cannot be loaded.
 */
async function loadChallengeCarbonRows(userId: string, startDate: string, endDate: string) {
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

  return data ?? [];
}

/**
 * Aggregates completed challenge rows into category carbon totals.
 * @returns Category breakdown rounded per addition as before.
 */
function buildChallengeCarbonBreakdown(rows: Awaited<ReturnType<typeof loadChallengeCarbonRows>>) {
  const category_breakdown = createEmptyCategoryBreakdown();

  for (const row of rows) {
    addChallengeCarbonRow(category_breakdown, row);
  }

  return category_breakdown;
}

/**
 * Creates the empty category breakdown shape.
 * @returns Zeroed category breakdown.
 */
function createEmptyCategoryBreakdown(): Record<CarbonCategory, number> {
  return { food: 0, transport: 0, home: 0, shopping: 0, travel: 0, other: 0 };
}

/**
 * Adds one completed challenge row into the category breakdown.
 * @returns Nothing; mutates the supplied breakdown.
 */
function addChallengeCarbonRow(
  categoryBreakdown: Record<CarbonCategory, number>,
  row: Awaited<ReturnType<typeof loadChallengeCarbonRows>>[number]
): void {
  const challengeValue = Array.isArray(row.challenge) ? row.challenge[0] : row.challenge;
  const category = mapChallengeCategoryToCarbonCategory(challengeValue?.category);
  const carbonSaveKg = Number(challengeValue?.carbon_save_kg ?? 0);
  categoryBreakdown[category] = roundKg(categoryBreakdown[category] + carbonSaveKg);
}

/**
 * Shapes category breakdown into a challenge carbon snapshot.
 * @returns Total carbon and category breakdown.
 */
function buildChallengeCarbonSnapshot(category_breakdown: Record<CarbonCategory, number>): ChallengeCarbonSnapshot {
  const total_carbon_kg = roundKg(Object.values(category_breakdown).reduce((sum, value) => sum + value, 0));

  return { total_carbon_kg, category_breakdown };
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
  return estimateWeeklyFromOnboardingWorkflow(onboardingData);
}

/**
 * Executes the extracted estimateWeeklyFromOnboarding service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `estimateWeeklyFromOnboarding`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
function estimateWeeklyFromOnboardingWorkflow(onboardingData: Json): WeeklyCarbonEstimate | null {
  const data = getOnboardingEstimateRecord(onboardingData);

  if (!data) {
    return null;
  }

  return estimateFromStoredBreakdown(data) ?? estimateFromOnboardingChoices(data);
}

/**
 * Normalizes onboarding data into a record for estimation.
 * @returns Onboarding record or null when unavailable.
 */
function getOnboardingEstimateRecord(onboardingData: Json): Record<string, Json | undefined> | null {
  return onboardingData && typeof onboardingData === "object" && !Array.isArray(onboardingData)
    ? onboardingData as Record<string, Json | undefined>
    : null;
}

/**
 * Estimates weekly carbon from a stored annual category breakdown.
 * @returns Weekly estimate or null when no positive total exists.
 */
function estimateFromStoredBreakdown(data: Record<string, Json | undefined>): WeeklyCarbonEstimate | null {
  const storedBreakdown = data.category_breakdown;

  if (!storedBreakdown || typeof storedBreakdown !== "object" || Array.isArray(storedBreakdown)) {
    return null;
  }

  const categories = buildStoredBreakdownCategories(storedBreakdown as Record<string, Json | undefined>);
  return buildWeeklyEstimate(categories);
}

/**
 * Converts annual category tons into weekly category kilograms.
 * @returns Weekly category estimate.
 */
function buildStoredBreakdownCategories(annualTons: Record<string, Json | undefined>) {
  return {
    food: annualTonsToWeeklyKg(annualTons.food),
    transport: annualTonsToWeeklyKg(annualTons.transport),
    home: annualTonsToWeeklyKg(annualTons.home),
    shopping: annualTonsToWeeklyKg(annualTons.shopping),
    travel: annualTonsToWeeklyKg(annualTons.travel),
    other: 0
  };
}

/**
 * Estimates weekly carbon from onboarding choice answers.
 * @returns Weekly estimate or null when no positive total exists.
 */
function estimateFromOnboardingChoices(data: Record<string, Json | undefined>): WeeklyCarbonEstimate | null {
  const categories = {
    transport: weeklyLookup(data.transport_mode, { car: 50, public_transit: 15, bike: 2, wfh: 5, mixed: 25 }),
    food: weeklyLookup(data.meat_frequency, { daily: 35, few_times_week: 25, rarely: 18, never: 12 }),
    shopping: weeklyLookup(data.monthly_spending, { under_2k: 15, "2k_to_5k": 30, "5k_to_10k": 55, over_10k: 85 }),
    home: 20,
    travel: weeklyLookup(data.flight_frequency, { never: 0, "1_2_yearly": 5, monthly: 25, weekly: 80 }),
    other: 0
  };

  return buildWeeklyEstimate(categories);
}

/**
 * Builds a weekly estimate when the category total is positive.
 * @returns Weekly estimate or null.
 */
function buildWeeklyEstimate(categories: Record<CarbonCategory, number>): WeeklyCarbonEstimate | null {
  const weeklyTotal = roundKg(Object.values(categories).reduce((total, value) => total + value, 0));

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
  return await recalculateCarbonSummaryWorkflow(userId, periodType, periodStart, periodEnd);
}

/**
 * Executes the extracted recalculateCarbonSummary service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `recalculateCarbonSummary`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function recalculateCarbonSummaryWorkflow(
  userId: string,
  periodType: PeriodType,
  periodStart: string,
  periodEnd: string
): Promise<void> {
  const transactions = await loadCarbonSummaryTransactions(userId, periodStart, periodEnd);
  const summary = summarizeCarbonTransactions(transactions);

  await saveCarbonSummary(userId, periodType, periodStart, summary);
}

/**
 * Loads transactions for a carbon summary period.
 * @returns Transaction rows included in the summary.
 * @throws When transactions cannot be loaded.
 */
async function loadCarbonSummaryTransactions(userId: string, periodStart: string, periodEnd: string) {
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

  return data;
}

/**
 * Aggregates summary transactions by total and category.
 * @returns Unrounded carbon summary totals.
 */
function summarizeCarbonTransactions(transactions: Awaited<ReturnType<typeof loadCarbonSummaryTransactions>>) {
  return transactions.reduce(addCarbonTransactionToSummary, createEmptyCarbonSummary());
}

/**
 * Adds one transaction to a carbon summary accumulator.
 * @returns Updated summary accumulator.
 */
function addCarbonTransactionToSummary(
  current: ReturnType<typeof createEmptyCarbonSummary>,
  transaction: Awaited<ReturnType<typeof loadCarbonSummaryTransactions>>[number]
) {
  const carbonKg = Number(transaction.carbon_kg);
  const categoryKey = `${transaction.carbon_category}_kg` as keyof typeof current;
  return { ...current, total_carbon_kg: current.total_carbon_kg + carbonKg, [categoryKey]: current[categoryKey] + carbonKg };
}

/**
 * Creates an empty carbon summary accumulator.
 * @returns Zeroed carbon summary totals.
 */
function createEmptyCarbonSummary() {
  return { total_carbon_kg: 0, food_kg: 0, transport_kg: 0, home_kg: 0, shopping_kg: 0, travel_kg: 0, other_kg: 0 };
}

/**
 * Upserts a rounded carbon summary row.
 * @returns Resolves after save succeeds.
 * @throws When the summary cannot be saved.
 */
async function saveCarbonSummary(
  userId: string,
  periodType: PeriodType,
  periodStart: string,
  summary: ReturnType<typeof createEmptyCarbonSummary>
): Promise<void> {
  const { error: upsertError } = await supabaseAdmin
    .from("carbon_summaries")
    .upsert(buildCarbonSummaryPayload(userId, periodType, periodStart, summary), { onConflict: "user_id,period_type,period_start" });

  if (upsertError) {
    throw new Error("Unable to save carbon summaries");
  }
}

/**
 * Builds the carbon summary upsert payload.
 * @returns Rounded database payload for the summary period.
 */
function buildCarbonSummaryPayload(
  userId: string,
  periodType: PeriodType,
  periodStart: string,
  summary: ReturnType<typeof createEmptyCarbonSummary>
) {
  return {
    user_id: userId, period_type: periodType, period_start: periodStart,
    total_carbon_kg: roundKg(summary.total_carbon_kg), food_kg: roundKg(summary.food_kg),
    transport_kg: roundKg(summary.transport_kg), home_kg: roundKg(summary.home_kg),
    shopping_kg: roundKg(summary.shopping_kg), travel_kg: roundKg(summary.travel_kg),
    other_kg: roundKg(summary.other_kg), challenge_savings_kg: 0
  };
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
