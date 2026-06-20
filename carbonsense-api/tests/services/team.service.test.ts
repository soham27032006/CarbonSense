import { beforeEach, describe, expect, it } from "vitest";
import { getLeaderboard } from "../../src/services/team.service";
import { resetSupabaseMock, setSupabaseHandler, type SupabaseCall } from "../helpers/supabase";

function isSelect(call: SupabaseCall, value: string) {
  return call.selectArgs?.[0] === value;
}

const memberships = [
  { id: "m-admin", team_id: "team-1", user_id: "admin-1", role: "admin", joined_at: "2026-01-01" },
  { id: "m-member", team_id: "team-1", user_id: "member-1", role: "member", joined_at: "2026-01-02" }
];

function mockLeaderboard(options: { noMembers?: boolean; membershipError?: boolean; statsError?: boolean } = {}) {
  setSupabaseHandler((call: SupabaseCall) => {
    if (call.table === "team_memberships" && call.operation === "maybeSingle") {
      return options.membershipError ? { data: null, error: new Error("not member") } : { data: { id: "membership" }, error: null };
    }
    if (call.table === "team_memberships" && isSelect(call, "id,team_id,user_id,role,joined_at")) {
      return { data: options.noMembers ? [] : memberships, error: null };
    }
    if (call.table === "users") return { data: { avatar_url: null, level: 2, streak_count: call.filters.some((filter) => filter.args[1] === "admin-1") ? 7 : 3 }, error: null };
    if (call.table === "user_challenges" && isSelect(call, "challenge_id,date_assigned")) {
      if (options.statsError) return { data: null, error: new Error("stats failed") };
      const userFilter = call.filters.find((filter) => filter.args[0] === "user_id");
      return { data: userFilter?.args[1] === "admin-1" ? [{ challenge_id: "ch-1", date_assigned: "2026-06-20" }] : [{ challenge_id: "ch-2", date_assigned: "2026-06-20" }], error: null };
    }
    if (call.table === "challenges") {
      const idFilter = call.filters.find((filter) => filter.method === "in");
      return { data: idFilter?.args[1]?.[0] === "ch-1" ? [{ carbon_save_kg: 5 }] : [{ carbon_save_kg: 2 }], error: null };
    }
    return { data: null, error: null };
  });
}

describe("team.service getLeaderboard", () => {
  beforeEach(() => resetSupabaseMock());

  it("returns ranked leaderboard rows for team members", async () => {
    mockLeaderboard();

    const result = await getLeaderboard("user-1", "team-1", "week");

    expect(result.period).toBe("week");
    expect(result.leaderboard).toHaveLength(2);
    expect(result.leaderboard[0]).toMatchObject({ rank: 1, display_name: "Team Admin", carbon_saved_kg: 5 });
  });

  it("returns an empty leaderboard when the team has no members", async () => {
    mockLeaderboard({ noMembers: true });

    const result = await getLeaderboard("user-1", "team-1", "alltime");

    expect(result.leaderboard).toEqual([]);
  });

  it("throws when the user is not a team member", async () => {
    mockLeaderboard({ membershipError: true });

    await expect(getLeaderboard("user-1", "team-1", "week")).rejects.toThrow("You are not a member of this team");
  });
});
