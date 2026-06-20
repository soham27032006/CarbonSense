import { beforeEach, describe, expect, it } from "vitest";
import { getDashboard } from "../../src/services/carbon.service";
import { hasFilter, resetSupabaseMock, setSupabaseHandler, type SupabaseCall } from "../helpers/supabase";

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

function mockDashboardSupabase(options: { userError?: boolean; emptySnapshots?: boolean } = {}) {
  setSupabaseHandler((call: SupabaseCall) => {
    if (call.table === "users" && call.operation === "single") {
      return options.userError ? { data: null, error: new Error("users down") } : { data: dashboardUser(), error: null };
    }
    if (call.table === "user_challenges" && call.selectArgs?.[0] === "completed_at, challenge:challenges(category,carbon_save_kg)") {
      return { data: options.emptySnapshots ? [] : [challengeRow()], error: null };
    }
    if (call.table === "user_challenges" && call.selectArgs?.[0] === "status") {
      return { data: { status: "completed" }, error: null };
    }
    if (call.table === "transactions" && call.selectArgs?.[1] && typeof call.selectArgs[1] === "object") {
      return { data: null, error: null, count: 0 };
    }
    if (call.table === "transactions") {
      return { data: [], error: null };
    }
    return { data: null, error: null };
  });
}

describe("carbon.service getDashboard", () => {
  beforeEach(() => resetSupabaseMock());

  it("returns the expected dashboard shape on the happy path", async () => {
    mockDashboardSupabase();

    const result = await getDashboard("user-1");

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
});
