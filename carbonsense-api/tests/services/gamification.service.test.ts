import { beforeEach, describe, expect, it } from "vitest";
import { checkAchievements } from "../../src/services/gamification.service";
import { resetSupabaseMock, setSupabaseHandler, type SupabaseCall } from "../helpers/supabase";

const achievement = { id: "ach-1", title: "Streak Starter", description: "", icon: "", condition_type: "streak", threshold: 3, xp_reward: 25, created_at: "2026-01-01" };

function mockAchievements(options: { alreadyEarned?: boolean; userError?: boolean; noEligible?: boolean } = {}) {
  setSupabaseHandler((call: SupabaseCall) => {
    if (call.table === "users" && call.selectArgs?.[0] === "streak_count,level") {
      return options.userError ? { data: null, error: new Error("no user") } : { data: { streak_count: options.noEligible ? 1 : 4, level: 2 }, error: null };
    }
    if (call.table === "users" && call.selectArgs?.[0] === "xp,level") return { data: { xp: 100, level: 2 }, error: null };
    if (call.table === "users" && call.operation === "update") return { data: null, error: null };
    if (call.table === "user_challenges" && call.selectArgs?.[1] && typeof call.selectArgs[1] === "object") return { data: null, error: null, count: 5 };
    if (call.table === "user_challenges") return { data: [{ challenge_id: "ch-1" }], error: null };
    if (call.table === "challenges") return { data: [{ carbon_save_kg: 3 }], error: null };
    if (call.table === "achievements") return { data: [achievement], error: null };
    if (call.table === "user_achievements" && call.operation === "insert") return { data: null, error: null };
    if (call.table === "user_achievements") return { data: options.alreadyEarned ? [{ achievement_id: "ach-1" }] : [], error: null };
    return { data: null, error: null };
  });
}

describe("gamification.service checkAchievements", () => {
  beforeEach(() => resetSupabaseMock());

  it("awards newly eligible achievements", async () => {
    mockAchievements();

    const result = await checkAchievements("user-1");

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("ach-1");
  });

  it("returns an empty list when achievements are already earned or not eligible", async () => {
    mockAchievements({ alreadyEarned: true });

    await expect(checkAchievements("user-1")).resolves.toEqual([]);
  });

  it("throws when achievement state cannot be loaded", async () => {
    mockAchievements({ userError: true });

    await expect(checkAchievements("user-1")).rejects.toThrow("Unable to load achievement state");
  });
});
