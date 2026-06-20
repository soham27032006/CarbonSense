import { beforeEach, describe, expect, it } from "vitest";
import { getTodayChallenge, skipChallenge } from "../../src/services/challenge.service";
import { hasFilter, resetSupabaseMock, setSupabaseHandler, type SupabaseCall } from "../helpers/supabase";

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

const skippedChallenge = {
  ...challenge,
  id: "challenge-skipped",
  title: "Plant-Based Lunch",
  category: "food",
  carbon_save_kg: 2,
  icon: "food"
};

const skippedAssignment = {
  ...assignment,
  id: "assignment-skipped",
  challenge_id: "challenge-skipped"
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

  it("does not create a second pending assignment when skip reassignment is followed by an alt refetch", async () => {
    const assignments = [skippedAssignment];
    const insertedAssignments: unknown[] = [];

    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "user_challenges" && call.operation === "maybeSingle" && isSelect(call, "*")) {
        return { data: assignments.at(-1) ?? null, error: null };
      }
      if (call.table === "user_challenges" && call.operation === "update") {
        assignments[0] = { ...assignments[0], status: "skipped", skip_reason: "No time today" };
        return { data: null, error: null };
      }
      if (call.table === "user_challenges" && isSelect(call, "challenge_id")) {
        return { data: assignments.filter((row) => row.status === "skipped").map((row) => ({ challenge_id: row.challenge_id })), error: null };
      }
      if (call.table === "carbon_summaries") return { data: { food_kg: 1, transport_kg: 8, home_kg: 0, shopping_kg: 0, travel_kg: 0, other_kg: 0 }, error: null };
      if (call.table === "users") return { data: { onboarding_data: { highest_carbon_category: "transport" } }, error: null };
      if (call.table === "user_challenges" && isSelect(call, "*") && call.operation === "then") return { data: assignments, error: null };
      if (call.table === "user_challenges" && isSelect(call, "status")) return { data: assignments.map((row) => ({ status: row.status })), error: null };
      if (call.table === "challenges" && isSelect(call, "*") && call.operation === "then") {
        if (hasFilter(call, "in", "id")) return { data: [challenge, skippedChallenge], error: null };
        return { data: [challenge], error: null };
      }
      if (call.table === "challenges" && isSelect(call, "*") && call.operation === "single") return { data: challenge, error: null };
      if (
        call.table === "user_challenges" &&
        call.payload &&
        typeof call.payload === "object" &&
        "challenge_id" in call.payload
      ) {
        insertedAssignments.push(call.payload);
        const inserted = {
          ...assignment,
          id: `assignment-created-${insertedAssignments.length}`,
          challenge_id: challenge.id,
          status: "pending"
        };
        assignments.push(inserted);
        return { data: inserted, error: null };
      }
      if (call.table === "user_challenges" && isSelect(call, "id")) return { data: null, error: null, count: 0 };
      if (call.table === "user_challenges" && isSelect(call, "date_assigned,status,completed_at,created_at")) return { data: assignments, error: null };
      return { data: null, error: null };
    });

    await skipChallenge("user-1", skippedAssignment.id, "No time today");
    await getTodayChallenge("user-1", 1);

    expect(insertedAssignments).toHaveLength(1);
  });
});
