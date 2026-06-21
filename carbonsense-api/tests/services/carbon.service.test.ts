import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateCarbonAge,
  calculateCarbonFromOnboarding,
  classifyTransaction,
  classifyTransactionsBatch,
  classifyWithAI,
  defaultBiologicalAge,
  generateDailyInsight,
  getCategoryBreakdown,
  getCategoryDetail,
  getComparison,
  getDashboard,
  getHighestCarbonCategory,
  getPercentile,
  getTransactions,
  getTrends,
  normalizeMerchantName,
  refreshCarbonSummaries,
  toChallengeCategory,
  type OnboardingQuizData
} from "../../src/services/carbon.service";
import { resetSupabaseMock, setSupabaseHandler, type SupabaseCall } from "../helpers/supabase";

const aiMocks = vi.hoisted(() => ({
  chatWithAI: vi.fn(),
  classifyCarbon: vi.fn(),
  classifyCarbonBatch: vi.fn(),
  extractJson: vi.fn()
}));

vi.mock("../../src/services/ai.service", () => ({
  chatWithAI: aiMocks.chatWithAI,
  classifyCarbon: aiMocks.classifyCarbon,
  classifyCarbonBatch: aiMocks.classifyCarbonBatch,
  extractJson: aiMocks.extractJson
}));

const TEST_USER_ID = "user-1";
const TEST_TODAY = "2026-06-21T00:00:00.000Z";
const TEST_DATE = "2026-06-21";
const DASHBOARD_INSIGHT_TIMEOUT_MS = 1200;
const TEST_STARBUCKS_AMOUNT = 10;
const TEST_GAS_AMOUNT = 20;
const TEST_AI_AMOUNT = 50;
const TEST_AI_FACTOR = 0.4;
const EXPECTED_STARBUCKS_CARBON_KG = 3.5;
const EXPECTED_GAS_CARBON_KG = 46.2;
const EXPECTED_AI_CARBON_KG = 20;
const EXPECTED_MERCHANT_CONFIDENCE = 0.85;
const EXPECTED_CATEGORY_CONFIDENCE = 0.65;
const EXPECTED_AI_CONFIDENCE = 0.5;
const TEST_PAGE = 1;
const TEST_LIMIT = 2;
const TEST_TRANSACTION_TOTAL = 2;
const TEST_TRANSACTION_SUMMARY_KG = 6;
const TEST_TRANSACTION_AVG_KG = 3;
const TEST_WEEKLY_RANGE = 2;
const TEST_MONTHLY_RANGE = 3;
const TEST_REFRESH_DATE = "2026-06-21";
const TEST_TIMEOUT_INSIGHT =
  "Your dashboard is ready. Connect transactions or complete today's challenge to unlock sharper insights.";
const TEST_NEW_USER_INSIGHT =
  "Small daily actions add up fast: one plant-based meal can save about 2.5 kg of CO2.";
const TEST_EMPTY_BATCH_CARBON_KG = 0;
const TEST_COUNTRY_AVERAGE_INDIA_KG = 167;
const TEST_PARIS_TARGET_KG = 333;
const TEST_SUMMARY_CURRENT_KG = 80;
const TEST_SUMMARY_PREVIOUS_KG = 100;
const EXPECTED_COMPARISON_CHANGE_PERCENT = -20;
const EXPECTED_COMPARISON_TOP_PERCENT = 52;
const TEST_REFRESH_TOTAL_KG = 7;
const TEST_REFRESH_FOOD_KG = 2;
const TEST_REFRESH_TRANSPORT_KG = 5;
const EXPECTED_REFRESH_UPSERTS = 3;

const onboardingQuiz: OnboardingQuizData = {
  transport_mode: "car",
  meat_frequency: "daily",
  monthly_spending: "5k_to_10k",
  flight_frequency: "1_2_yearly",
  motivation: "save_money",
  household_size: 2,
  country: "US",
  biological_age: 30
};

function isSelect(call: SupabaseCall, value: string): boolean {
  return call.selectArgs?.[0] === value;
}

function getFilterValue(call: SupabaseCall, column: string): unknown {
  return call.filters.find((filter) => filter.args[0] === column)?.args[1];
}

function resetCarbonMocks() {
  resetSupabaseMock();
  aiMocks.chatWithAI.mockReset().mockResolvedValue("Test insight");
  aiMocks.classifyCarbon.mockReset().mockResolvedValue({
    carbon_category: "shopping",
    emission_factor_per_dollar: 0.1,
    reasoning: "mocked"
  });
  aiMocks.classifyCarbonBatch.mockReset().mockResolvedValue([]);
  aiMocks.extractJson.mockReset().mockImplementation((value: string) => value);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(TEST_TODAY));
}

function dashboardUser() {
  return {
    carbon_age: 31,
    level: 3,
    level_name: "Carbon Conscious",
    xp: 350,
    streak_count: 4,
    streak_max: 8,
    streak_freeze_available: true,
    onboarding_data: { biological_age: 25, country: "India" }
  };
}

function challengeRow(category = "food", carbonSaveKg = 2.5) {
  return { completed_at: "2026-06-20T10:00:00.000Z", challenge: { category, carbon_save_kg: carbonSaveKg } };
}

function mockDashboardSupabase(options: {
  userError?: boolean;
  emptySnapshots?: boolean;
  insightTransactions?: Array<Record<string, unknown>>;
} = {}) {
  setSupabaseHandler((call: SupabaseCall) => {
    if (call.table === "users" && call.operation === "single") {
      return options.userError ? { data: null, error: new Error("users down") } : { data: dashboardUser(), error: null };
    }
    if (call.table === "user_challenges" && isSelect(call, "completed_at, challenge:challenges(category,carbon_save_kg)")) {
      return { data: options.emptySnapshots ? [] : [challengeRow()], error: null };
    }
    if (call.table === "user_challenges" && isSelect(call, "status")) {
      return { data: { status: "completed" }, error: null };
    }
    if (call.table === "transactions" && call.selectArgs?.[1] && typeof call.selectArgs[1] === "object") {
      return { data: null, error: null, count: 0 };
    }
    if (call.table === "transactions" && isSelect(call, "merchant_name,carbon_kg,carbon_category,transaction_date")) {
      return { data: options.insightTransactions ?? [], error: null };
    }
    if (call.table === "transactions") {
      return { data: [], error: null };
    }
    return { data: null, error: null };
  });
}

describe("carbon.service getDashboard", () => {
  beforeEach(() => resetCarbonMocks());
  afterEach(() => vi.useRealTimers());

  it("returns the expected dashboard shape on the happy path", async () => {
    mockDashboardSupabase();

    const result = await getDashboard(TEST_USER_ID);

    expect(result.current_level).toMatchObject({ level: 3, name: "Carbon Conscious" });
    expect(result.today).toMatchObject({ carbon_kg: 2.5, challenge_status: "completed" });
    expect(result.this_week.category_breakdown.food).toBe(2.5);
    expect(result.ai_insight).toBeTypeOf("string");
  });

  it("returns zero carbon windows when no completed challenges exist", async () => {
    mockDashboardSupabase({ emptySnapshots: true });

    const result = await getDashboard("new-user");

    expect(result.today.carbon_kg).toBe(0);
    expect(result.this_month.total_carbon_kg).toBe(0);
    expect(result.this_year.category_breakdown.food).toBe(0);
  });

  it("throws when the dashboard profile cannot be loaded", async () => {
    mockDashboardSupabase({ userError: true });

    await expect(getDashboard("missing-user")).rejects.toThrow("Unable to load dashboard profile");
  });

  it("uses the dashboard timeout fallback when daily insight generation hangs", async () => {
    mockDashboardSupabase({
      insightTransactions: [
        {
          merchant_name: "Shell",
          carbon_kg: 4,
          carbon_category: "transport",
          transaction_date: TEST_DATE
        }
      ]
    });
    aiMocks.chatWithAI.mockReturnValue(new Promise<string>(() => undefined));

    const resultPromise = getDashboard(TEST_USER_ID);
    await vi.advanceTimersByTimeAsync(DASHBOARD_INSIGHT_TIMEOUT_MS);
    const result = await resultPromise;

    expect(result.ai_insight).toBe(TEST_TIMEOUT_INSIGHT);
  });
});

describe("carbon.service onboarding and classification", () => {
  beforeEach(() => resetCarbonMocks());
  afterEach(() => vi.useRealTimers());

  it("calculates onboarding breakdown, annual carbon, carbon age, and percentile", () => {
    const breakdown = getCategoryBreakdown(onboardingQuiz);

    expect(breakdown).toMatchObject({
      food: 2.5,
      transport: 4.6,
      home: 2,
      shopping: 7,
      travel: 1.5
    });
    expect(calculateCarbonFromOnboarding(onboardingQuiz)).toBe(17.6);
    expect(calculateCarbonAge(defaultBiologicalAge, 10, "US")).toBe(37);
    expect(getPercentile(10, "US")).toBe(31);
    expect(getHighestCarbonCategory(breakdown)).toBe("shopping");
    expect(toChallengeCategory("travel")).toBe("lifestyle");
  });

  it("normalizes merchant names and classifies known merchants locally", async () => {
    const result = await classifyTransaction("Starbucks Inc.", "Unknown", TEST_STARBUCKS_AMOUNT);

    expect(normalizeMerchantName("Starbucks, Inc. POS")).toBe("starbucks");
    expect(result).toMatchObject({
      carbon_kg: EXPECTED_STARBUCKS_CARBON_KG,
      carbon_category: "food",
      confidence: EXPECTED_MERCHANT_CONFIDENCE,
      source: "emission_factor",
      factor_per_dollar: 0.35,
      subcategory: "coffee"
    });
  });

  it("falls back to Plaid category factors before AI classification", async () => {
    const result = await classifyTransaction("Unmapped Fuel Merchant", "Transportation > Gas", TEST_GAS_AMOUNT);

    expect(result).toMatchObject({
      carbon_kg: EXPECTED_GAS_CARBON_KG,
      carbon_category: "transport",
      confidence: EXPECTED_CATEGORY_CONFIDENCE,
      source: "emission_factor",
      factor_per_dollar: 2.31
    });
  });

  it("uses AI classification when merchant and category lookups miss", async () => {
    aiMocks.classifyCarbon.mockResolvedValue({
      carbon_category: "travel",
      emission_factor_per_dollar: TEST_AI_FACTOR,
      reasoning: "unmapped travel merchant"
    });

    const result = await classifyWithAI("Mystery Merchant", "Unknown", -TEST_AI_AMOUNT);

    expect(result).toEqual({
      carbon_kg: EXPECTED_AI_CARBON_KG,
      carbon_category: "travel",
      confidence: EXPECTED_AI_CONFIDENCE,
      source: "ai",
      factor_per_dollar: TEST_AI_FACTOR,
      reasoning: "unmapped travel merchant"
    });
  });

  it("classifies batches with one AI call only for lookup misses", async () => {
    aiMocks.classifyCarbonBatch.mockResolvedValue([
      {
        carbon_category: "home",
        emission_factor_per_dollar: TEST_AI_FACTOR,
        reasoning: "home service"
      }
    ]);

    const result = await classifyTransactionsBatch([
      { merchantName: "Starbucks", plaidCategory: "Unknown", amount: TEST_STARBUCKS_AMOUNT },
      { merchantName: "Mystery Utility", plaidCategory: "Unknown", amount: TEST_AI_AMOUNT },
      { merchantName: "Unmapped Fuel Merchant", plaidCategory: "Transportation > Gas", amount: TEST_GAS_AMOUNT }
    ]);

    expect(result).toHaveLength(3);
    expect(result[0].carbon_category).toBe("food");
    expect(result[1]).toMatchObject({
      carbon_kg: EXPECTED_AI_CARBON_KG,
      carbon_category: "home",
      source: "ai",
      reasoning: "home service"
    });
    expect(result[2].carbon_category).toBe("transport");
    expect(aiMocks.classifyCarbonBatch).toHaveBeenCalledTimes(1);
    expect(aiMocks.classifyCarbonBatch).toHaveBeenCalledWith([
      { merchant: "Mystery Utility", category: "Unknown", amount: TEST_AI_AMOUNT }
    ]);
  });

  it("returns empty batch results and AI-miss fallbacks safely", async () => {
    await expect(classifyTransactionsBatch([])).resolves.toEqual([]);

    aiMocks.classifyCarbonBatch.mockResolvedValue([]);
    const result = await classifyTransactionsBatch([
      { merchantName: "Mystery Merchant", plaidCategory: "Unknown", amount: TEST_AI_AMOUNT }
    ]);

    expect(result).toEqual([
      {
        carbon_kg: TEST_EMPTY_BATCH_CARBON_KG,
        carbon_category: "other",
        confidence: EXPECTED_CATEGORY_CONFIDENCE,
        source: "emission_factor",
        factor_per_dollar: 0,
        subcategory: undefined
      }
    ]);
  });
});

describe("carbon.service transactions, trends, and comparisons", () => {
  beforeEach(() => resetCarbonMocks());
  afterEach(() => vi.useRealTimers());

  it("returns filtered transaction rows with pagination and summary", async () => {
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "transactions" && isSelect(call, "id,merchant_name,amount,currency,carbon_kg,carbon_category,carbon_confidence,transaction_date")) {
        return {
          data: [
            {
              id: "txn-1",
              merchant_name: "Starbucks",
              amount: 8,
              currency: "USD",
              carbon_kg: 2,
              carbon_category: "food",
              carbon_confidence: 0.85,
              transaction_date: TEST_DATE
            },
            {
              id: "txn-2",
              merchant_name: "Shell",
              amount: 20,
              currency: "USD",
              carbon_kg: 4,
              carbon_category: "transport",
              carbon_confidence: 0.65,
              transaction_date: TEST_DATE
            }
          ],
          count: TEST_TRANSACTION_TOTAL,
          error: null
        };
      }
      if (call.table === "transactions" && isSelect(call, "carbon_kg")) {
        return { data: [{ carbon_kg: 2 }, { carbon_kg: 4 }], error: null };
      }
      return { data: null, error: null };
    });

    const result = await getTransactions(TEST_USER_ID, {
      page: TEST_PAGE,
      limit: TEST_LIMIT,
      category: "food",
      date_from: "2026-06-01",
      date_to: TEST_DATE
    });

    expect(result.pagination).toEqual({
      page: TEST_PAGE,
      limit: TEST_LIMIT,
      total: TEST_TRANSACTION_TOTAL,
      total_pages: 1
    });
    expect(result.transactions[0]).toMatchObject({
      id: "txn-1",
      merchant: "Starbucks",
      category: "food",
      icon: "utensils"
    });
    expect(result.summary).toEqual({
      total_carbon_kg: TEST_TRANSACTION_SUMMARY_KG,
      avg_per_transaction: TEST_TRANSACTION_AVG_KG
    });
  });

  it("returns live weekly trend points and extremes", async () => {
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "carbon_summaries") {
        return {
          data: [
            { period_start: "2026-06-16", total_carbon_kg: 6 },
            { period_start: "2026-06-09", total_carbon_kg: 10 }
          ],
          error: null
        };
      }
      if (call.table === "users") {
        return { data: { onboarding_data: onboardingQuiz }, error: null };
      }
      return { data: null, error: null };
    });

    const result = await getTrends(TEST_USER_ID, "weekly", TEST_WEEKLY_RANGE);

    expect(result).toMatchObject({
      period: "week",
      range: TEST_WEEKLY_RANGE,
      total: 16,
      average: 8,
      change_percent: -40,
      is_estimated: false,
      best_period: { date: "Jun 16", total_kg: 6 },
      worst_period: { date: "Jun 9", total_kg: 10 }
    });
  });

  it("returns estimated monthly trends from onboarding when no summaries exist", async () => {
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "carbon_summaries") {
        return { data: [], error: null };
      }
      if (call.table === "users") {
        return { data: { onboarding_data: onboardingQuiz }, error: null };
      }
      return { data: null, error: null };
    });

    const result = await getTrends(TEST_USER_ID, "monthly", TEST_MONTHLY_RANGE);

    expect(result.period).toBe("month");
    expect(result.points).toHaveLength(TEST_MONTHLY_RANGE);
    expect(result.is_estimated).toBe(true);
    expect(result.total).toBeGreaterThan(0);
  });

  it("returns category detail with top merchants, trend, and AI suggestions", async () => {
    aiMocks.chatWithAI.mockResolvedValue(JSON.stringify({ suggestions: ["Tip one", "Tip two", "Tip three"] }));
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "carbon_summaries" && isSelect(call, "*")) {
        return {
          data: {
            total_carbon_kg: 10,
            food_kg: 4,
            transport_kg: 2,
            home_kg: 1,
            shopping_kg: 2,
            travel_kg: 1,
            other_kg: 0
          },
          error: null
        };
      }
      if (call.table === "transactions") {
        return {
          data: [
            { merchant_name: "Starbucks", carbon_kg: 1.5, transaction_date: TEST_DATE },
            { merchant_name: "Starbucks", carbon_kg: 2.5, transaction_date: TEST_DATE },
            { merchant_name: "Chipotle", carbon_kg: 1, transaction_date: TEST_DATE }
          ],
          error: null
        };
      }
      if (call.table === "carbon_summaries" && isSelect(call, "period_start,food_kg,transport_kg,home_kg,shopping_kg,travel_kg,other_kg")) {
        return { data: [{ period_start: "2026-06-16", food_kg: 4 }], error: null };
      }
      return { data: null, error: null };
    });

    const result = await getCategoryDetail(TEST_USER_ID, "food");

    expect(result).toMatchObject({
      category: "food",
      this_month_kg: 4,
      percent_of_total: 40,
      suggestions: ["Tip one", "Tip two", "Tip three"]
    });
    expect(result.top_merchants[0]).toEqual({
      name: "Starbucks",
      total_kg: 4,
      transaction_count: 2
    });
    expect(result.trend).toEqual([{ week: "2026-06-16", kg: 4 }]);
  });

  it("returns comparison stats using live monthly summaries", async () => {
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "carbon_summaries") {
        const periodStart = getFilterValue(call, "period_start");
        return {
          data: {
            total_carbon_kg: periodStart === "2026-06-01" ? TEST_SUMMARY_CURRENT_KG : TEST_SUMMARY_PREVIOUS_KG,
            food_kg: periodStart === "2026-06-01" ? TEST_SUMMARY_CURRENT_KG : TEST_SUMMARY_PREVIOUS_KG,
            transport_kg: 0,
            home_kg: 0,
            shopping_kg: 0,
            travel_kg: 0,
            other_kg: 0
          },
          error: null
        };
      }
      if (call.table === "users") {
        return { data: { onboarding_data: { settings: { country: "India" } } }, error: null };
      }
      return { data: null, error: null };
    });

    const result = await getComparison(TEST_USER_ID);

    expect(result).toMatchObject({
      user_monthly_kg: TEST_SUMMARY_CURRENT_KG,
      national_average_kg: TEST_COUNTRY_AVERAGE_INDIA_KG,
      paris_target_kg: TEST_PARIS_TARGET_KG,
      vs_last_month_percent: EXPECTED_COMPARISON_CHANGE_PERCENT,
      top_percent: EXPECTED_COMPARISON_TOP_PERCENT,
      improving: true,
      country: "India"
    });
  });
});

describe("carbon.service insights and summaries", () => {
  beforeEach(() => resetCarbonMocks());
  afterEach(() => vi.useRealTimers());

  it("returns a deterministic new-user insight when recent transactions are empty", async () => {
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "transactions") {
        return { data: [], error: null };
      }
      return { data: null, error: null };
    });

    const result = await generateDailyInsight(TEST_USER_ID);

    expect(result).toBe(TEST_NEW_USER_INSIGHT);
  });

  it("trims AI insight text and falls back when AI fails", async () => {
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "transactions") {
        return {
          data: [
            {
              merchant_name: "Shell",
              carbon_kg: 4,
              carbon_category: "transport",
              transaction_date: TEST_DATE
            }
          ],
          error: null
        };
      }
      return { data: null, error: null };
    });
    aiMocks.chatWithAI.mockResolvedValueOnce("  Try transit once this week.  ");

    await expect(generateDailyInsight(TEST_USER_ID)).resolves.toBe("Try transit once this week.");

    aiMocks.chatWithAI.mockRejectedValueOnce(new Error("busy"));
    await expect(generateDailyInsight(TEST_USER_ID)).resolves.toBe(
      "Your recent spending shows a few simple opportunities to lower carbon this week."
    );
  });

  it("refreshes daily, weekly, and monthly carbon summaries from transactions", async () => {
    const upserts: unknown[] = [];
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "transactions") {
        return {
          data: [
            { carbon_kg: TEST_REFRESH_FOOD_KG, carbon_category: "food" },
            { carbon_kg: TEST_REFRESH_TRANSPORT_KG, carbon_category: "transport" }
          ],
          error: null
        };
      }
      if (call.table === "carbon_summaries" && call.payload) {
        upserts.push(call.payload);
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });

    await refreshCarbonSummaries(TEST_USER_ID, TEST_REFRESH_DATE);

    expect(upserts).toHaveLength(EXPECTED_REFRESH_UPSERTS);
    expect(upserts[0]).toMatchObject({
      user_id: TEST_USER_ID,
      period_type: "day",
      period_start: TEST_REFRESH_DATE,
      total_carbon_kg: TEST_REFRESH_TOTAL_KG,
      food_kg: TEST_REFRESH_FOOD_KG,
      transport_kg: TEST_REFRESH_TRANSPORT_KG,
      challenge_savings_kg: 0
    });
    expect(upserts.map((payload) => (payload as { period_type: string }).period_type)).toEqual([
      "day",
      "week",
      "month"
    ]);
  });
});
