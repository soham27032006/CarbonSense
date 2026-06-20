import { beforeEach, describe, expect, it } from "vitest";
import { getProfile, updateProfile } from "../../src/services/profile.service";
import { resetSupabaseMock, setSupabaseHandler, type SupabaseCall } from "../helpers/supabase";

function profileUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    name: "Soham",
    email: "soham@example.com",
    avatar_url: null,
    carbon_age: 28,
    level: 2,
    level_name: "Carbon Aware",
    xp: 125,
    streak_count: 3,
    streak_max: 5,
    streak_freeze_available: false,
    onboarding_complete: true,
    onboarding_data: { country: "india", settings: { units: "metric", country: "IN" } },
    notification_preferences: { weekly_summary: false },
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function mockProfileSupabase(options: { userError?: boolean; optionalErrors?: boolean; updateError?: boolean } = {}) {
  setSupabaseHandler((call: SupabaseCall) => {
    if (call.table === "users" && call.payload) {
      return options.updateError ? { data: null, error: new Error("update failed") } : { data: profileUser(), error: null };
    }
    if (call.table === "users" && call.operation === "single" && call.selectArgs?.[0] === "onboarding_data,notification_preferences") {
      return { data: { onboarding_data: { country: "IN" }, notification_preferences: { daily_challenge: { enabled: true, time: "09:00" } } }, error: null };
    }
    if (call.table === "users" && call.operation === "single") {
      return options.userError ? { data: null, error: new Error("missing") } : { data: profileUser(), error: null };
    }
    if (options.optionalErrors && (call.table === "bank_connections" || call.table === "team_memberships")) {
      return { data: null, error: new Error("optional failed") };
    }
    if (call.table === "bank_connections") return { data: [{ id: "bank-1", institution_name: "Bank", status: "active", last_synced: null }], error: null };
    if (call.table === "team_memberships") return { data: [{ team_id: "team-1" }], error: null };
    if (call.table === "teams") return { data: [{ id: "team-1", name: "Crew", type: "friends", member_count: 2 }], error: null };
    if (call.table === "user_challenges" && call.selectArgs?.[1] && typeof call.selectArgs[1] === "object") return { data: null, error: null, count: 2 };
    if (call.table === "user_challenges") return { data: [{ challenge: { carbon_save_kg: 1.2 } }, { challenge: [{ carbon_save_kg: 2.3 }] }], error: null };
    return { data: null, error: null };
  });
}

describe("profile.service getProfile", () => {
  beforeEach(() => resetSupabaseMock());

  it("returns profile shape with related bank, team, and carbon totals", async () => {
    mockProfileSupabase();

    const result = await getProfile("user-1");

    expect(result.name).toBe("Soham");
    expect(result.bank_connections).toHaveLength(1);
    expect(result.teams).toHaveLength(1);
    expect(result.challenges_completed).toBe(2);
    expect(result.carbon_saved_kg).toBe(3.5);
  });

  it("keeps profile loading when optional related data fails", async () => {
    mockProfileSupabase({ optionalErrors: true });

    const result = await getProfile("user-1");

    expect(result.bank_connections).toEqual([]);
    expect(result.teams).toEqual([]);
  });

  it("throws when the base profile cannot be loaded", async () => {
    mockProfileSupabase({ userError: true });

    await expect(getProfile("missing-user")).rejects.toThrow("Unable to load profile");
  });
});

describe("profile.service updateProfile", () => {
  beforeEach(() => resetSupabaseMock());

  it("updates direct fields and returns the refreshed profile", async () => {
    mockProfileSupabase();

    const result = await updateProfile("user-1", { name: "New Name" });

    expect(result.email).toBe("soham@example.com");
  });

  it("returns the current profile when the update payload is empty", async () => {
    mockProfileSupabase();

    const result = await updateProfile("user-1", {});

    expect(result.name).toBe("Soham");
  });

  it("throws when the profile update fails", async () => {
    mockProfileSupabase({ updateError: true });

    await expect(updateProfile("user-1", { name: "Nope" })).rejects.toThrow("Unable to update profile");
  });
});
