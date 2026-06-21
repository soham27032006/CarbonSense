import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getImpactEquivalencies,
  getImpactShareCard,
  getImpactTotal,
  getLifetimeCarbonSaved,
  invalidateLifetimeCarbonSaved
} from "../../src/services/impact.service";
import { resetSupabaseMock, setSupabaseHandler, type SupabaseCall } from "../helpers/supabase";

const TEST_USER_ID = "user-impact";
const TEST_CACHE_KEY = `user:${TEST_USER_ID}:lifetime_carbon_saved_kg`;
const TEST_MEMBER_SINCE = "2026-06-11T00:00:00.000Z";
const TEST_TODAY = "2026-06-21T00:00:00.000Z";
const TEST_CACHED_CARBON_KG = "12.5";
const TEST_FIRST_CHALLENGE_SAVE_KG = 1.75;
const TEST_SECOND_CHALLENGE_SAVE_KG = 3.5;
const EXPECTED_COMPUTED_SAVE_KG = 5.25;
const TEST_TEAM_COUNT = 2;
const TEST_ACHIEVEMENT_COUNT = 3;
const TEST_COMPLETED_CHALLENGE_COUNT = 4;
const TEST_LEVEL_DARK = 8;
const TEST_LEVEL_BLUE = 5;
const TEST_LEVEL_GREEN = 2;
const TEST_CURRENT_STREAK = 5;
const TEST_BEST_STREAK = 9;
const TEST_SHARE_CARD_STREAK = 7;
const EXPECTED_DAYS_ACTIVE = 10;
const EXPECTED_CACHE_TTL_SECONDS = 3600;

const redisMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn()
}));

vi.mock("../../src/config/redis", () => ({
  redis: redisMocks,
  redisEnabled: true
}));

function isSelect(call: SupabaseCall, value: string): boolean {
  return call.selectArgs?.[0] === value;
}

function mockLifetimeSavedRows() {
  setSupabaseHandler((call: SupabaseCall) => {
    if (call.table === "user_challenges" && isSelect(call, "challenge_id")) {
      return {
        data: [{ challenge_id: "challenge-1" }, { challenge_id: "challenge-2" }],
        error: null
      };
    }
    if (call.table === "challenges" && isSelect(call, "carbon_save_kg")) {
      return {
        data: [
          { carbon_save_kg: TEST_FIRST_CHALLENGE_SAVE_KG },
          { carbon_save_kg: TEST_SECOND_CHALLENGE_SAVE_KG }
        ],
        error: null
      };
    }
    return { data: null, error: null };
  });
}

function mockImpactTotalRows() {
  setSupabaseHandler((call: SupabaseCall) => {
    if (call.table === "users" && isSelect(call, "created_at,streak_count,streak_max,level,level_name")) {
      return {
        data: {
          created_at: TEST_MEMBER_SINCE,
          streak_count: TEST_CURRENT_STREAK,
          streak_max: TEST_BEST_STREAK,
          level: TEST_LEVEL_DARK,
          level_name: "Canopy Guardian"
        },
        error: null
      };
    }
    if (call.table === "user_challenges" && isSelect(call, "id")) {
      return { count: TEST_COMPLETED_CHALLENGE_COUNT, error: null };
    }
    if (call.table === "user_challenges" && isSelect(call, "challenge_id")) {
      return {
        data: [{ challenge_id: "challenge-1" }, { challenge_id: "challenge-2" }],
        error: null
      };
    }
    if (call.table === "challenges" && isSelect(call, "carbon_save_kg")) {
      return {
        data: [
          { carbon_save_kg: TEST_FIRST_CHALLENGE_SAVE_KG },
          { carbon_save_kg: TEST_SECOND_CHALLENGE_SAVE_KG }
        ],
        error: null
      };
    }
    if (call.table === "team_memberships") {
      return { count: TEST_TEAM_COUNT, error: null };
    }
    if (call.table === "user_achievements") {
      return { count: TEST_ACHIEVEMENT_COUNT, error: null };
    }
    return { data: null, error: null };
  });
}

function mockShareCardRows() {
  setSupabaseHandler((call: SupabaseCall) => {
    if (call.table === "users" && isSelect(call, "name,created_at,streak_count,level,level_name")) {
      return {
        data: {
          name: "Soham",
          created_at: TEST_MEMBER_SINCE,
          streak_count: TEST_SHARE_CARD_STREAK,
          level: TEST_LEVEL_DARK,
          level_name: "Canopy Guardian"
        },
        error: null
      };
    }
    if (call.table === "user_challenges" && isSelect(call, "id")) {
      return { count: TEST_COMPLETED_CHALLENGE_COUNT, error: null };
    }
    if (call.table === "user_challenges" && isSelect(call, "challenge_id")) {
      return {
        data: [{ challenge_id: "challenge-1" }, { challenge_id: "challenge-2" }],
        error: null
      };
    }
    if (call.table === "challenges" && isSelect(call, "carbon_save_kg")) {
      return {
        data: [
          { carbon_save_kg: TEST_FIRST_CHALLENGE_SAVE_KG },
          { carbon_save_kg: TEST_SECOND_CHALLENGE_SAVE_KG }
        ],
        error: null
      };
    }
    return { data: null, error: null };
  });
}

describe("impact.service", () => {
  beforeEach(() => {
    resetSupabaseMock();
    redisMocks.get.mockReset();
    redisMocks.set.mockReset();
    redisMocks.del.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(TEST_TODAY));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns cached lifetime carbon saved without querying Supabase", async () => {
    redisMocks.get.mockResolvedValue(TEST_CACHED_CARBON_KG);

    const result = await getLifetimeCarbonSaved(TEST_USER_ID);

    expect(result).toBe(Number(TEST_CACHED_CARBON_KG));
    expect(redisMocks.get).toHaveBeenCalledWith(TEST_CACHE_KEY);
    expect(redisMocks.set).not.toHaveBeenCalled();
  });

  it("computes and caches lifetime carbon saved on cache miss", async () => {
    redisMocks.get.mockResolvedValue(null);
    mockLifetimeSavedRows();

    const result = await getLifetimeCarbonSaved(TEST_USER_ID);

    expect(result).toBe(EXPECTED_COMPUTED_SAVE_KG);
    expect(redisMocks.set).toHaveBeenCalledWith(
      TEST_CACHE_KEY,
      String(EXPECTED_COMPUTED_SAVE_KG),
      "EX",
      EXPECTED_CACHE_TTL_SECONDS
    );
  });

  it("invalidates the cached lifetime carbon saved value", async () => {
    await invalidateLifetimeCarbonSaved(TEST_USER_ID);

    expect(redisMocks.del).toHaveBeenCalledWith(TEST_CACHE_KEY);
  });

  it("returns aggregate impact totals", async () => {
    redisMocks.get.mockResolvedValue(null);
    mockImpactTotalRows();

    const result = await getImpactTotal(TEST_USER_ID);

    expect(result).toMatchObject({
      lifetime_carbon_saved_kg: EXPECTED_COMPUTED_SAVE_KG,
      challenges_completed: TEST_COMPLETED_CHALLENGE_COUNT,
      days_active: EXPECTED_DAYS_ACTIVE,
      current_streak: TEST_CURRENT_STREAK,
      best_streak: TEST_BEST_STREAK,
      teams_joined: TEST_TEAM_COUNT,
      achievements_earned: TEST_ACHIEVEMENT_COUNT
    });
  });

  it("returns share card data with the level theme", async () => {
    redisMocks.get.mockResolvedValue(null);
    mockShareCardRows();

    const result = await getImpactShareCard(TEST_USER_ID);

    expect(result).toMatchObject({
      user_name: "Soham",
      carbon_saved_kg: EXPECTED_COMPUTED_SAVE_KG,
      level_name: "Canopy Guardian",
      card_theme: "dark",
      challenges_completed: TEST_COMPLETED_CHALLENGE_COUNT
    });
  });

  it("returns impact equivalencies for saved carbon", async () => {
    redisMocks.get.mockResolvedValue(TEST_CACHED_CARBON_KG);

    const result = await getImpactEquivalencies(TEST_USER_ID);

    expect(result.carbon_saved_kg).toBe(Number(TEST_CACHED_CARBON_KG));
    expect(result.equivalencies.trees_year.text).toContain("trees absorbing CO2");
    expect(result.equivalencies.miles_not_driven.text).toContain("miles not driven");
  });

  it("returns 0 lifetime carbon saved when no completed challenges exist", async () => {
    redisMocks.get.mockResolvedValue(null);
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "user_challenges" && isSelect(call, "challenge_id")) {
        return { data: [], error: null };
      }
      return { data: null, error: null };
    });

    const result = await getLifetimeCarbonSaved(TEST_USER_ID);

    expect(result).toBe(0);
    expect(redisMocks.set).toHaveBeenCalledWith(TEST_CACHE_KEY, "0", "EX", EXPECTED_CACHE_TTL_SECONDS);
  });

  it("throws when challenge carbon savings fail to load", async () => {
    redisMocks.get.mockResolvedValue(null);
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "user_challenges" && isSelect(call, "challenge_id")) {
        return { data: [{ challenge_id: "challenge-1" }], error: null };
      }
      if (call.table === "challenges" && isSelect(call, "carbon_save_kg")) {
        return { data: null, error: { message: "DB error" } };
      }
      return { data: null, error: null };
    });

    await expect(getLifetimeCarbonSaved(TEST_USER_ID)).rejects.toThrow("Unable to load challenge carbon savings");
  });

  it("returns blue card theme for mid-level users", async () => {
    redisMocks.get.mockResolvedValue(null);
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "users" && isSelect(call, "name,created_at,streak_count,level,level_name")) {
        return {
          data: {
            name: "BlueUser",
            created_at: TEST_MEMBER_SINCE,
            streak_count: TEST_SHARE_CARD_STREAK,
            level: TEST_LEVEL_BLUE,
            level_name: "Forest Friend"
          },
          error: null
        };
      }
      if (call.table === "user_challenges" && isSelect(call, "id")) {
        return { count: TEST_COMPLETED_CHALLENGE_COUNT, error: null };
      }
      if (call.table === "user_challenges" && isSelect(call, "challenge_id")) {
        return {
          data: [{ challenge_id: "challenge-1" }],
          error: null
        };
      }
      if (call.table === "challenges" && isSelect(call, "carbon_save_kg")) {
        return {
          data: [{ carbon_save_kg: TEST_FIRST_CHALLENGE_SAVE_KG }],
          error: null
        };
      }
      return { data: null, error: null };
    });

    const result = await getImpactShareCard(TEST_USER_ID);

    expect(result.card_theme).toBe("blue");
  });

  it("returns green card theme for low-level users", async () => {
    redisMocks.get.mockResolvedValue(null);
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "users" && isSelect(call, "name,created_at,streak_count,level,level_name")) {
        return {
          data: {
            name: "GreenUser",
            created_at: TEST_MEMBER_SINCE,
            streak_count: TEST_SHARE_CARD_STREAK,
            level: TEST_LEVEL_GREEN,
            level_name: "Seedling"
          },
          error: null
        };
      }
      if (call.table === "user_challenges" && isSelect(call, "id")) {
        return { count: TEST_COMPLETED_CHALLENGE_COUNT, error: null };
      }
      if (call.table === "user_challenges" && isSelect(call, "challenge_id")) {
        return {
          data: [{ challenge_id: "challenge-1" }],
          error: null
        };
      }
      if (call.table === "challenges" && isSelect(call, "carbon_save_kg")) {
        return {
          data: [{ carbon_save_kg: TEST_FIRST_CHALLENGE_SAVE_KG }],
          error: null
        };
      }
      return { data: null, error: null };
    });

    const result = await getImpactShareCard(TEST_USER_ID);

    expect(result.card_theme).toBe("green");
  });

  it("throws when challenge count query fails in impact total", async () => {
    redisMocks.get.mockResolvedValue(null);
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "users") {
        return {
          data: {
            created_at: TEST_MEMBER_SINCE,
            streak_count: TEST_CURRENT_STREAK,
            streak_max: TEST_BEST_STREAK,
            level: TEST_LEVEL_DARK,
            level_name: "Canopy Guardian"
          },
          error: null
        };
      }
      if (call.table === "user_challenges" && isSelect(call, "id")) {
        return { count: null, error: { message: "DB error" } };
      }
      return { data: null, error: null };
    });

    await expect(getImpactTotal(TEST_USER_ID)).rejects.toThrow("Unable to count completed challenges");
  });

  it("returns null cached value when redis stores non-finite string", async () => {
    redisMocks.get.mockResolvedValue("not-a-number");
    setSupabaseHandler(() => ({ data: [], error: null }));

    const result = await getLifetimeCarbonSaved(TEST_USER_ID);

    expect(result).toBe(0);
    expect(redisMocks.set).toHaveBeenCalled();
  });
});
