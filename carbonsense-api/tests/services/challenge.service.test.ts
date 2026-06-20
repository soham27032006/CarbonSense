import { beforeEach, describe, expect, it } from "vitest";
import { getTodayChallenge } from "../../src/services/challenge.service";
import { resetSupabaseMock, setSupabaseHandler, type SupabaseCall } from "../helpers/supabase";

const challenge = {
  id: "challenge-1",
  title: "Walk or bike today",
  category: "transport",
  difficulty: "easy",
  carbon_save_kg: 3,
  xp_reward: 20,
  icon: "transport",
  tips: ["Walk one short trip"],
  is_active: true
};

const assignment = {
  id: "assignment-1",
  user_id: "user-1",
  challenge_id: "challenge-1",
  date_assigned: "2026-06-20",
  status: "pending",
  created_at: "2026-06-20T00:00:00.000Z"
};

function isSelect(call: SupabaseCall, value: string) {
  return call.selectArgs?.[0] === value;
}

function mockChallengeAssignment(options: { existing?: boolean; noActiveChallenges?: boolean; todayError?: boolean } = {}) {
  setSupabaseHandler((call: SupabaseCall) => {
    if (call.table === "user_challenges" && call.operation === "maybeSingle" && isSelect(call, "*")) {
      return options.todayError ? { data: null, error: new Error("today failed") } : { data: options.existing ? assignment : null, error: null };
    }
    if (call.table === "user_challenges" && isSelect(call, "challenge_id")) return { data: [], error: null };
    if (call.table === "carbon_summaries") return { data: { food_kg: 1, transport_kg: 8, home_kg: 0, shopping_kg: 0, travel_kg: 0, other_kg: 0 }, error: null };
    if (call.table === "user_challenges" && isSelect(call, "*") && call.operation === "then") return { data: [], error: null };
    if (call.table === "user_challenges" && isSelect(call, "status")) return { data: [], error: null };
    if (call.table === "challenges" && isSelect(call, "*") && call.operation === "then") return { data: options.noActiveChallenges ? [] : [challenge], error: null };
    if (call.table === "challenges" && isSelect(call, "*") && call.operation === "single") return { data: challenge, error: null };
    if (call.table === "user_challenges" && call.payload) return { data: assignment, error: null };
    if (call.table === "user_challenges" && isSelect(call, "id")) return { data: null, error: null, count: 2 };
    if (call.table === "user_challenges" && isSelect(call, "date_assigned,status,completed_at,created_at")) return { data: [], error: null };
    return { data: null, error: null };
  });
}

describe("challenge.service getTodayChallenge assignment path", () => {
  beforeEach(() => resetSupabaseMock());

  it("assigns the best active challenge when none exists today", async () => {
    mockChallengeAssignment();

    const result = await getTodayChallenge("user-1");

    expect(result.id).toBe("challenge-1");
    expect(result.assignment.id).toBe("assignment-1");
    expect(result.participants_today).toBe(2);
    expect(result.why).toContain("transport");
  });

  it("hydrates the existing today assignment instead of creating another", async () => {
    mockChallengeAssignment({ existing: true });

    const result = await getTodayChallenge("user-1");

    expect(result.assignment.id).toBe("assignment-1");
    expect(result.equivalency).toBeTypeOf("string");
  });

  it("throws when no active challenges are available for assignment", async () => {
    mockChallengeAssignment({ noActiveChallenges: true });

    await expect(getTodayChallenge("user-1")).rejects.toThrow("No active challenges available");
  });
});
