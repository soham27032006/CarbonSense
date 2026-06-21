import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createTeam,
  getLeaderboard,
  getMyTeams,
  getTeam,
  joinTeam,
  updateTeamStats,
  updateUserTeamStats
} from "../../src/services/team.service";
import { resetSupabaseMock, setSupabaseHandler, supabaseAdminMock, type SupabaseCall } from "../helpers/supabase";

const TEST_USER_ID = "user-1";
const TEST_TEAM_ID = "team-1";
const TEST_INVITE_CODE = "ABCD1234";
const TEST_TEAM_NAME = "Green Warriors";
const TEST_TEAM_TYPE = "friends";

const TEST_TEAM_ROW = {
  id: TEST_TEAM_ID,
  name: TEST_TEAM_NAME,
  type: TEST_TEAM_TYPE,
  description: null,
  invite_code: TEST_INVITE_CODE,
  created_by: TEST_USER_ID,
  member_count: 2,
  total_carbon_saved_kg: 7,
  created_at: "2026-01-01T00:00:00.000Z"
};

const TEST_ADMIN_MEMBERSHIP = {
  id: "m-admin",
  team_id: TEST_TEAM_ID,
  user_id: "admin-1",
  role: "admin",
  joined_at: "2026-01-01"
};

const TEST_MEMBER_MEMBERSHIP = {
  id: "m-member",
  team_id: TEST_TEAM_ID,
  user_id: "member-1",
  role: "member",
  joined_at: "2026-01-02"
};

const TEST_MEMBERSHIPS = [TEST_ADMIN_MEMBERSHIP, TEST_MEMBER_MEMBERSHIP];

const TEST_ADMIN_USER = { avatar_url: null, level: 5, streak_count: 7 };
const TEST_MEMBER_USER = { avatar_url: null, level: 3, streak_count: 3 };

const redisMocks = vi.hoisted(() => ({
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn()
}));

vi.mock("../../src/config/redis", () => ({
  redis: redisMocks,
  redisEnabled: true
}));

vi.mock("../../src/utils/date", () => ({
  todayIndia: () => "2026-06-21",
  yesterdayIndia: () => "2026-06-20",
  currentIndiaWeekStart: () => "2026-06-16",
  currentIndiaMonthStart: () => "2026-06-01",
  daysAgoIndia: (days: number) => "2026-06-21"
}));

function isSelect(call: SupabaseCall, value: string): boolean {
  return call.selectArgs?.[0] === value;
}

describe("team.service createTeam", () => {
  beforeEach(() => {
    resetSupabaseMock();
  });

  it("creates a team on the first successful RPC call", async () => {
    supabaseAdminMock.rpc.mockResolvedValueOnce({ data: TEST_TEAM_ROW, error: null });

    const result = await createTeam(TEST_USER_ID, TEST_TEAM_NAME, TEST_TEAM_TYPE);

    expect(result).toEqual(TEST_TEAM_ROW);
    expect(supabaseAdminMock.rpc).toHaveBeenCalledWith("create_team_with_admin", {
      p_user_id: TEST_USER_ID,
      p_name: TEST_TEAM_NAME,
      p_type: TEST_TEAM_TYPE,
      p_description: null,
      p_invite_code: expect.any(String)
    });
  });

  it("retries on duplicate invite code and succeeds on the next attempt", async () => {
    supabaseAdminMock.rpc
      .mockResolvedValueOnce({ data: null, error: { message: "duplicate key value violates unique constraint" } })
      .mockResolvedValueOnce({ data: null, error: { message: "duplicate invite code" } })
      .mockResolvedValueOnce({ data: TEST_TEAM_ROW, error: null });

    const result = await createTeam(TEST_USER_ID, TEST_TEAM_NAME, TEST_TEAM_TYPE);

    expect(result).toEqual(TEST_TEAM_ROW);
    expect(supabaseAdminMock.rpc).toHaveBeenCalledTimes(3);
  });

  it("throws after 5 failed duplicate attempts", async () => {
    for (let i = 0; i < 5; i++) {
      supabaseAdminMock.rpc.mockResolvedValueOnce({ data: null, error: { message: "duplicate invite code" } });
    }

    await expect(createTeam(TEST_USER_ID, TEST_TEAM_NAME, TEST_TEAM_TYPE)).rejects.toThrow(
      "Unable to generate a unique invite code"
    );
  });

  it("throws on a non-duplicate RPC error immediately", async () => {
    supabaseAdminMock.rpc.mockResolvedValueOnce({ data: null, error: { message: "permission denied" } });

    await expect(createTeam(TEST_USER_ID, TEST_TEAM_NAME, TEST_TEAM_TYPE)).rejects.toThrow(
      "Unable to create team"
    );
  });
});

describe("team.service joinTeam", () => {
  beforeEach(() => {
    resetSupabaseMock();
    redisMocks.del.mockReset();
  });

  it("joins a team and clears the leaderboard cache", async () => {
    supabaseAdminMock.rpc.mockResolvedValueOnce({ data: TEST_TEAM_ROW, error: null });

    const result = await joinTeam(TEST_USER_ID, TEST_INVITE_CODE);

    expect(result).toEqual(TEST_TEAM_ROW);
    expect(redisMocks.del).toHaveBeenCalledTimes(3);
  });

  it("throws when the user is already a member", async () => {
    supabaseAdminMock.rpc.mockResolvedValueOnce({ data: null, error: { message: "ALREADY_TEAM_MEMBER" } });

    await expect(joinTeam(TEST_USER_ID, TEST_INVITE_CODE)).rejects.toThrow(
      "You are already a member of this team"
    );
  });

  it("throws when the invite code is not found", async () => {
    supabaseAdminMock.rpc.mockResolvedValueOnce({ data: null, error: { message: "TEAM_NOT_FOUND" } });

    await expect(joinTeam(TEST_USER_ID, TEST_INVITE_CODE)).rejects.toThrow(
      "Team invite code was not found"
    );
  });

  it("throws on other RPC errors", async () => {
    supabaseAdminMock.rpc.mockResolvedValueOnce({ data: null, error: { message: "database error" } });

    await expect(joinTeam(TEST_USER_ID, TEST_INVITE_CODE)).rejects.toThrow(
      "Unable to join team"
    );
  });

  it("uppercases the invite code before passing to the RPC", async () => {
    supabaseAdminMock.rpc.mockResolvedValueOnce({ data: TEST_TEAM_ROW, error: null });

    await joinTeam(TEST_USER_ID, "abcd1234");

    expect(supabaseAdminMock.rpc).toHaveBeenCalledWith("join_team_atomic", {
      p_user_id: TEST_USER_ID,
      p_invite_code: "ABCD1234"
    });
  });
});

describe("team.service getTeam", () => {
  beforeEach(() => {
    resetSupabaseMock();
  });

  it("returns team detail with anonymized members and stats", async () => {
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "team_memberships" && call.operation === "maybeSingle") {
        return { data: { id: "membership" }, error: null };
      }
      if (call.table === "teams" && isSelect(call, "*")) {
        return { data: TEST_TEAM_ROW, error: null };
      }
      if (call.table === "team_memberships" && isSelect(call, "id,team_id,user_id,role,joined_at")) {
        return { data: TEST_MEMBERSHIPS, error: null };
      }
      if (call.table === "users") {
        const isAdmin = call.filters.some((f) => f.args[1] === "admin-1");
        return { data: isAdmin ? TEST_ADMIN_USER : TEST_MEMBER_USER, error: null };
      }
      if (call.table === "user_challenges") {
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });

    const result = await getTeam(TEST_USER_ID, TEST_TEAM_ID);

    expect(result.team).toEqual(TEST_TEAM_ROW);
    expect(result.members).toHaveLength(2);
    expect(result.stats.total_carbon_saved).toBe(7);
  });

  it("throws when user is not a member of the team", async () => {
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "team_memberships" && call.operation === "maybeSingle") {
        return { data: null, error: { message: "not found" } };
      }
      return { data: null, error: null };
    });

    await expect(getTeam(TEST_USER_ID, TEST_TEAM_ID)).rejects.toThrow(
      "You are not a member of this team"
    );
  });
});

describe("team.service getLeaderboard", () => {
  beforeEach(() => {
    resetSupabaseMock();
    redisMocks.get.mockReset();
    redisMocks.set.mockReset();
  });

  it("returns ranked leaderboard rows for team members (cache miss)", async () => {
    redisMocks.get.mockResolvedValue(null);
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "team_memberships" && call.operation === "maybeSingle") {
        return { data: { id: "membership" }, error: null };
      }
      if (call.table === "team_memberships" && isSelect(call, "id,team_id,user_id,role,joined_at")) {
        return { data: TEST_MEMBERSHIPS, error: null };
      }
      if (call.table === "users") {
        const isAdmin = call.filters.some((f) => f.args[1] === "admin-1");
        return { data: isAdmin ? TEST_ADMIN_USER : TEST_MEMBER_USER, error: null };
      }
      if (call.table === "user_challenges" && isSelect(call, "challenge_id,date_assigned")) {
        const userFilter = call.filters.find((f) => f.args[0] === "user_id");
        return {
          data: userFilter?.args[1] === "admin-1"
            ? [{ challenge_id: "ch-1", date_assigned: "2026-06-20" }]
            : [{ challenge_id: "ch-2", date_assigned: "2026-06-20" }],
          error: null
        };
      }
      if (call.table === "challenges") {
        const idFilter = call.filters.find((f) => f.method === "in");
        return {
          data: idFilter?.args[1]?.[0] === "ch-1"
            ? [{ carbon_save_kg: 5 }]
            : [{ carbon_save_kg: 2 }],
          error: null
        };
      }
      return { data: null, error: null };
    });

    const result = await getLeaderboard(TEST_USER_ID, TEST_TEAM_ID, "week");

    expect(result.period).toBe("week");
    expect(result.leaderboard).toHaveLength(2);
    expect(result.leaderboard[0]).toMatchObject({ rank: 1, display_name: "Team Admin", carbon_saved_kg: 5 });
    expect(redisMocks.set).toHaveBeenCalledOnce();
  });

  it("returns cached leaderboard on cache hit without querying Supabase further", async () => {
    const cachedPayload = { period: "month", leaderboard: [{ rank: 1, carbon_saved_kg: 10 }] };
    redisMocks.get.mockResolvedValue(JSON.stringify(cachedPayload));
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "team_memberships" && call.operation === "maybeSingle") {
        return { data: { id: "membership" }, error: null };
      }
      return { data: null, error: null };
    });

    const result = await getLeaderboard(TEST_USER_ID, TEST_TEAM_ID, "month");

    expect(result).toEqual(cachedPayload);
    expect(redisMocks.set).not.toHaveBeenCalled();
  });

  it("returns an empty leaderboard when the team has no members", async () => {
    redisMocks.get.mockResolvedValue(null);
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "team_memberships" && call.operation === "maybeSingle") {
        return { data: { id: "membership" }, error: null };
      }
      if (call.table === "team_memberships" && isSelect(call, "id,team_id,user_id,role,joined_at")) {
        return { data: [], error: null };
      }
      return { data: null, error: null };
    });

    const result = await getLeaderboard(TEST_USER_ID, TEST_TEAM_ID, "alltime");

    expect(result.leaderboard).toEqual([]);
  });

  it("throws when the user is not a team member", async () => {
    redisMocks.get.mockResolvedValue(null);
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "team_memberships" && call.operation === "maybeSingle") {
        return { data: null, error: new Error("not member") };
      }
      return { data: null, error: null };
    });

    await expect(getLeaderboard(TEST_USER_ID, TEST_TEAM_ID, "week")).rejects.toThrow(
      "You are not a member of this team"
    );
  });
});

describe("team.service getMyTeams", () => {
  beforeEach(() => {
    resetSupabaseMock();
  });

  it("returns teams the user has joined", async () => {
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "team_memberships" && isSelect(call, "team_id,role,joined_at")) {
        return {
          data: [
            { team_id: TEST_TEAM_ID, role: "admin", joined_at: "2026-01-01" },
            { team_id: "team-2", role: "member", joined_at: "2026-02-01" }
          ],
          error: null
        };
      }
      if (call.table === "teams" && isSelect(call, "*")) {
        const teamFilter = call.filters.find((f) => f.args[0] === "id");
        if (teamFilter?.args[1] === TEST_TEAM_ID) {
          return { data: { ...TEST_TEAM_ROW, id: TEST_TEAM_ID }, error: null };
        }
        return { data: { ...TEST_TEAM_ROW, id: "team-2", name: "Eco Squad" }, error: null };
      }
      return { data: null, error: null };
    });

    const result = await getMyTeams(TEST_USER_ID);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe(TEST_TEAM_NAME);
  });

  it("throws when memberships cannot be loaded", async () => {
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "team_memberships" && isSelect(call, "team_id,role,joined_at")) {
        return { data: null, error: { message: "DB error" } };
      }
      return { data: null, error: null };
    });

    await expect(getMyTeams(TEST_USER_ID)).rejects.toThrow("Unable to load your teams");
  });

  it("filters out teams that fail to load", async () => {
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "team_memberships" && isSelect(call, "team_id,role,joined_at")) {
        return {
          data: [
            { team_id: TEST_TEAM_ID, role: "admin", joined_at: "2026-01-01" },
            { team_id: "team-missing", role: "member", joined_at: "2026-02-01" }
          ],
          error: null
        };
      }
      if (call.table === "teams" && isSelect(call, "*")) {
        const teamFilter = call.filters.find((f) => f.args[0] === "id");
        if (teamFilter?.args[1] === TEST_TEAM_ID) {
          return { data: { ...TEST_TEAM_ROW }, error: null };
        }
        return { data: null, error: { message: "not found" } };
      }
      return { data: null, error: null };
    });

    const result = await getMyTeams(TEST_USER_ID);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(TEST_TEAM_ID);
  });
});

describe("team.service updateTeamStats", () => {
  beforeEach(() => {
    resetSupabaseMock();
    redisMocks.del.mockReset();
  });

  it("computes and persists aggregated stats, then clears leaderboard cache", async () => {
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "team_memberships" && isSelect(call, "id,team_id,user_id,role,joined_at")) {
        return { data: TEST_MEMBERSHIPS, error: null };
      }
      if (call.table === "users") {
        const isAdmin = call.filters.some((f) => f.args[1] === "admin-1");
        return { data: isAdmin ? TEST_ADMIN_USER : TEST_MEMBER_USER, error: null };
      }
      if (call.table === "user_challenges" && isSelect(call, "challenge_id,date_assigned")) {
        const userFilter = call.filters.find((f) => f.args[0] === "user_id");
        return {
          data: userFilter?.args[1] === "admin-1"
            ? [{ challenge_id: "ch-1", date_assigned: "2026-06-20" }]
            : [{ challenge_id: "ch-2", date_assigned: "2026-06-20" }],
          error: null
        };
      }
      if (call.table === "challenges") {
        const idFilter = call.filters.find((f) => f.method === "in");
        return {
          data: idFilter?.args[1]?.[0] === "ch-1"
            ? [{ carbon_save_kg: 3.5 }]
            : [{ carbon_save_kg: 1.5 }],
          error: null
        };
      }
      if (call.table === "teams" && call.payload && "total_carbon_saved_kg" in (call.payload as Record<string, unknown>)) {
        return { data: null, error: null };
      }
      return { data: null, error: null };
    });

    await updateTeamStats(TEST_TEAM_ID);

    expect(redisMocks.del).toHaveBeenCalledTimes(3);
  });

  it("returns early when the team has no members", async () => {
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "team_memberships" && isSelect(call, "id,team_id,user_id,role,joined_at")) {
        return { data: [], error: null };
      }
      return { data: null, error: null };
    });

    await updateTeamStats(TEST_TEAM_ID);

    expect(redisMocks.del).not.toHaveBeenCalled();
  });

  it("throws when the stats update fails", async () => {
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "team_memberships" && isSelect(call, "id,team_id,user_id,role,joined_at")) {
        return { data: TEST_MEMBERSHIPS, error: null };
      }
      if (call.table === "users") {
        return { data: TEST_ADMIN_USER, error: null };
      }
      if (call.table === "user_challenges" && isSelect(call, "challenge_id,date_assigned")) {
        return { data: [{ challenge_id: "ch-1", date_assigned: "2026-06-20" }], error: null };
      }
      if (call.table === "challenges") {
        return { data: [{ carbon_save_kg: 2 }], error: null };
      }
      if (call.table === "teams" && call.payload && "total_carbon_saved_kg" in (call.payload as Record<string, unknown>)) {
        return { data: null, error: { message: "update failed" } };
      }
      return { data: null, error: null };
    });

    await expect(updateTeamStats(TEST_TEAM_ID)).rejects.toThrow("Unable to update team stats");
  });
});

describe("team.service updateUserTeamStats", () => {
  beforeEach(() => {
    resetSupabaseMock();
  });

  it("returns early when the user has no team memberships", async () => {
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "team_memberships" && isSelect(call, "team_id")) {
        return { data: null, error: { message: "not found" } };
      }
      return { data: null, error: null };
    });

    await updateUserTeamStats(TEST_USER_ID);
  });

  it("returns early on empty membership list", async () => {
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "team_memberships" && isSelect(call, "team_id")) {
        return { data: [], error: null };
      }
      return { data: null, error: null };
    });

    await updateUserTeamStats(TEST_USER_ID);
  });
});
