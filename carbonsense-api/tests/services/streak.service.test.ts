import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  checkAndResetStreak,
  getStreakInfo,
  incrementStreak,
  regenerateStreakFreeze,
  useStreakFreeze
} from "../../src/services/streak.service";
import { resetSupabaseMock, setSupabaseHandler, type SupabaseCall } from "../helpers/supabase";

const TEST_USER_ID = "user-streak";
const TEST_TODAY = "2026-06-21";
const TEST_YESTERDAY = "2026-06-20";
const TEST_NOW = "2026-06-21T00:00:00.000Z";
const TEST_WEEK_OLD_CREATED_AT = "2026-06-14T00:00:00.000Z";
const TEST_STREAK_COUNT = 2;
const TEST_STREAK_MAX = 5;
const TEST_NEXT_STREAK = 3;
const TEST_MILESTONE_PREVIOUS_STREAK = 6;
const TEST_MILESTONE_STREAK = 7;
const TEST_MILESTONE_BONUS_XP = 50;
const TEST_DUPLICATE_COMPLETION_COUNT = 2;
const TEST_SINGLE_COMPLETION_COUNT = 1;
const TEST_NO_COMPLETION_COUNT = 0;
const NO_MILESTONE_BONUS_XP = 0;
const NO_REMAINING_FREEZES = 0;

const gamificationMocks = vi.hoisted(() => ({
  addXP: vi.fn()
}));

vi.mock("../../src/utils/date", () => ({
  todayIndia: () => TEST_TODAY,
  yesterdayIndia: () => TEST_YESTERDAY
}));

vi.mock("../../src/services/gamification.service", () => ({
  addXP: gamificationMocks.addXP
}));

function isSelect(call: SupabaseCall, value: string): boolean {
  return call.selectArgs?.[0] === value;
}

function mockIncrementStreakRows(options: {
  streakCount?: number;
  streakMax?: number;
  completedCount?: number;
} = {}) {
  setSupabaseHandler((call: SupabaseCall) => {
    if (call.table === "users" && isSelect(call, "streak_count,streak_max")) {
      return {
        data: {
          streak_count: options.streakCount ?? TEST_STREAK_COUNT,
          streak_max: options.streakMax ?? TEST_STREAK_MAX
        },
        error: null
      };
    }
    if (call.table === "user_challenges" && isSelect(call, "id")) {
      return { count: options.completedCount ?? TEST_SINGLE_COMPLETION_COUNT, error: null };
    }
    if (call.table === "users" && call.operation === "update") {
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });
}

function mockResetRows(options: {
  lastCheckedDate?: string | null;
  yesterdayCompletedCount?: number;
  freezeAvailable?: boolean;
  streakCount?: number;
} = {}) {
  setSupabaseHandler((call: SupabaseCall) => {
    if (
      call.table === "users" &&
      isSelect(call, "streak_count,streak_freeze_available,streak_last_checked_date")
    ) {
      return {
        data: {
          streak_count: options.streakCount ?? TEST_STREAK_COUNT,
          streak_freeze_available: options.freezeAvailable ?? false,
          streak_last_checked_date: options.lastCheckedDate ?? null
        },
        error: null
      };
    }
    if (call.table === "user_challenges" && isSelect(call, "id")) {
      return { count: options.yesterdayCompletedCount ?? TEST_NO_COMPLETION_COUNT, error: null };
    }
    if (call.table === "users" && call.operation === "update") {
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });
}

function mockRegenerateRows(freezeAvailable: boolean) {
  setSupabaseHandler((call: SupabaseCall) => {
    if (call.table === "users" && isSelect(call, "created_at,streak_freeze_available")) {
      return {
        data: {
          created_at: TEST_WEEK_OLD_CREATED_AT,
          streak_freeze_available: freezeAvailable
        },
        error: null
      };
    }
    if (call.table === "users" && call.operation === "update") {
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });
}

function mockUseFreezeRows(freezeAvailable: boolean) {
  setSupabaseHandler((call: SupabaseCall) => {
    if (call.table === "users" && isSelect(call, "streak_freeze_available")) {
      return { data: { streak_freeze_available: freezeAvailable }, error: null };
    }
    if (call.table === "users" && call.operation === "update") {
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });
}

function mockStreakInfoRows() {
  setSupabaseHandler((call: SupabaseCall) => {
    if (call.table === "users" && isSelect(call, "created_at,streak_freeze_available")) {
      return { data: { created_at: TEST_NOW, streak_freeze_available: true }, error: null };
    }
    if (
      call.table === "users" &&
      isSelect(call, "streak_count,streak_freeze_available,streak_last_checked_date")
    ) {
      return {
        data: {
          streak_count: TEST_STREAK_COUNT,
          streak_freeze_available: true,
          streak_last_checked_date: TEST_TODAY
        },
        error: null
      };
    }
    if (call.table === "users" && isSelect(call, "streak_count,streak_max,streak_freeze_available")) {
      return {
        data: {
          streak_count: TEST_STREAK_COUNT,
          streak_max: TEST_STREAK_MAX,
          streak_freeze_available: true
        },
        error: null
      };
    }
    return { data: null, error: null };
  });
}

describe("streak.service", () => {
  beforeEach(() => {
    resetSupabaseMock();
    gamificationMocks.addXP.mockReset();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(TEST_NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("increments the streak once for today's first completed challenge", async () => {
    mockIncrementStreakRows();

    const result = await incrementStreak(TEST_USER_ID);

    expect(result).toEqual({
      streak_count: TEST_NEXT_STREAK,
      streak_max: TEST_STREAK_MAX,
      is_milestone: false,
      milestone_bonus_xp: NO_MILESTONE_BONUS_XP
    });
  });

  it("awards bonus XP on a streak milestone", async () => {
    mockIncrementStreakRows({
      streakCount: TEST_MILESTONE_PREVIOUS_STREAK,
      streakMax: TEST_MILESTONE_PREVIOUS_STREAK
    });

    const result = await incrementStreak(TEST_USER_ID);

    expect(result).toEqual({
      streak_count: TEST_MILESTONE_STREAK,
      streak_max: TEST_MILESTONE_STREAK,
      is_milestone: true,
      milestone_bonus_xp: TEST_MILESTONE_BONUS_XP
    });
    expect(gamificationMocks.addXP).toHaveBeenCalledWith(TEST_USER_ID, TEST_MILESTONE_BONUS_XP);
  });

  it("does not increment again after multiple completed challenges today", async () => {
    mockIncrementStreakRows({ completedCount: TEST_DUPLICATE_COMPLETION_COUNT });

    const result = await incrementStreak(TEST_USER_ID);

    expect(result).toEqual({
      streak_count: TEST_STREAK_COUNT,
      streak_max: TEST_STREAK_MAX,
      is_milestone: false,
      milestone_bonus_xp: NO_MILESTONE_BONUS_XP
    });
    expect(gamificationMocks.addXP).not.toHaveBeenCalled();
  });

  it("returns already checked when the streak was checked today", async () => {
    mockResetRows({ lastCheckedDate: TEST_TODAY });

    const result = await checkAndResetStreak(TEST_USER_ID);

    expect(result).toEqual({ streak_safe: true, already_checked: true });
  });

  it("marks the streak safe when yesterday has a completed challenge", async () => {
    mockResetRows({ yesterdayCompletedCount: TEST_SINGLE_COMPLETION_COUNT });

    const result = await checkAndResetStreak(TEST_USER_ID);

    expect(result).toEqual({ streak_safe: true, already_checked: false });
  });

  it("uses an available streak freeze when yesterday was missed", async () => {
    mockResetRows({ freezeAvailable: true });

    const result = await checkAndResetStreak(TEST_USER_ID);

    expect(result).toEqual({ streak_saved: true, freeze_used: true });
  });

  it("resets an expired streak when no freeze is available", async () => {
    mockResetRows();

    const result = await checkAndResetStreak(TEST_USER_ID);

    expect(result).toEqual({ streak_reset: true, previous_streak: TEST_STREAK_COUNT });
  });

  it("regenerates a streak freeze on the weekly cadence", async () => {
    mockRegenerateRows(false);

    const result = await regenerateStreakFreeze(TEST_USER_ID);

    expect(result).toEqual({ success: true, freeze_available: true });
  });

  it("uses a manually requested streak freeze", async () => {
    mockUseFreezeRows(true);

    const result = await useStreakFreeze(TEST_USER_ID);

    expect(result).toEqual({ success: true, remaining_freezes: NO_REMAINING_FREEZES });
  });

  it("throws when no manually requested streak freeze is available", async () => {
    mockUseFreezeRows(false);

    await expect(useStreakFreeze(TEST_USER_ID)).rejects.toThrow("No streak freeze available");
  });

  it("returns streak info with regenerated freeze and reset status", async () => {
    mockStreakInfoRows();

    const result = await getStreakInfo(TEST_USER_ID);

    expect(result).toEqual({
      current: TEST_STREAK_COUNT,
      max: TEST_STREAK_MAX,
      freeze_available: true,
      status: { streak_safe: true, already_checked: true }
    });
  });

  it("throws when useStreakFreeze fails to load freeze state", async () => {
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "users" && isSelect(call, "streak_freeze_available")) {
        return { data: null, error: { message: "DB error" } };
      }
      return { data: null, error: null };
    });

    await expect(useStreakFreeze(TEST_USER_ID)).rejects.toThrow("Unable to load streak freeze state");
  });

  it("throws when useStreakFreeze fails to update freeze flag", async () => {
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "users" && isSelect(call, "streak_freeze_available")) {
        return { data: { streak_freeze_available: true }, error: null };
      }
      if (call.table === "users" && call.payload && "streak_freeze_available" in (call.payload as object)) {
        return { data: null, error: { message: "DB error" } };
      }
      return { data: null, error: null };
    });

    await expect(useStreakFreeze(TEST_USER_ID)).rejects.toThrow("Unable to use streak freeze");
  });

  it("throws when getStreakInfo fails to load final streak data", async () => {
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "users" && isSelect(call, "created_at,streak_freeze_available")) {
        return { data: { created_at: TEST_NOW, streak_freeze_available: true }, error: null };
      }
      if (
        call.table === "users" &&
        isSelect(call, "streak_count,streak_freeze_available,streak_last_checked_date")
      ) {
        return {
          data: {
            streak_count: TEST_STREAK_COUNT,
            streak_freeze_available: true,
            streak_last_checked_date: TEST_TODAY
          },
          error: null
        };
      }
      if (call.table === "users" && isSelect(call, "streak_count,streak_max,streak_freeze_available")) {
        return { data: null, error: { message: "DB error" } };
      }
      return { data: null, error: null };
    });

    await expect(getStreakInfo(TEST_USER_ID)).rejects.toThrow("Unable to load streak info");
  });

  it("throws when markStreakChecked fails during checkAndResetStreak", async () => {
    setSupabaseHandler((call: SupabaseCall) => {
      if (
        call.table === "users" &&
        isSelect(call, "streak_count,streak_freeze_available,streak_last_checked_date")
      ) {
        return {
          data: {
            streak_count: TEST_STREAK_COUNT,
            streak_freeze_available: true,
            streak_last_checked_date: null
          },
          error: null
        };
      }
      if (call.table === "user_challenges" && isSelect(call, "id")) {
        return { count: 1, error: null };
      }
      if (call.table === "users" && call.payload && "streak_last_checked_date" in (call.payload as object)) {
        return { data: null, error: { message: "DB error" } };
      }
      return { data: null, error: null };
    });

    await expect(checkAndResetStreak(TEST_USER_ID)).rejects.toThrow("Unable to mark streak checked");
  });
});
