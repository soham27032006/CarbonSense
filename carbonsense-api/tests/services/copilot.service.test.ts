import { beforeEach, describe, expect, it, vi } from "vitest";
import { chat } from "../../src/services/copilot.service";
import { resetSupabaseMock, setSupabaseHandler, type SupabaseCall } from "../helpers/supabase";

const aiMocks = vi.hoisted(() => ({
  structuredCopilotReply: vi.fn()
}));

vi.mock("../../src/services/ai.service", () => ({
  structuredCopilotReply: aiMocks.structuredCopilotReply
}));

function isSelect(call: SupabaseCall, value: string): boolean {
  return call.selectArgs?.[0] === value;
}

function mockCopilotContext() {
  setSupabaseHandler((call: SupabaseCall) => {
    if (call.table === "users") {
      return {
        data: {
          name: "Soham",
          carbon_age: 22,
          level: 1,
          level_name: "Seedling",
          streak_count: 1
        },
        error: null
      };
    }
    if (call.table === "carbon_summaries") {
      return {
        data: {
          total_carbon_kg: 12,
          food_kg: 2,
          transport_kg: 7,
          home_kg: 1,
          shopping_kg: 2,
          travel_kg: 0,
          other_kg: 0
        },
        error: null
      };
    }
    if (call.table === "user_challenges" && isSelect(call, "challenge_id,status,date_assigned")) {
      return {
        data: [
          {
            challenge_id: "challenge-1",
            status: "completed",
            date_assigned: "2026-06-21"
          }
        ],
        error: null
      };
    }
    if (call.table === "challenges" && isSelect(call, "id,title")) {
      return { data: [{ id: "challenge-1", title: "Learn Your Impact" }], error: null };
    }
    if (call.table === "copilot_conversations" && call.operation === "maybeSingle") {
      return {
        data: {
          id: "conversation-1",
          user_id: "user-1",
          messages: [],
          created_at: "2026-06-21T00:00:00.000Z",
          updated_at: "2026-06-21T00:00:00.000Z"
        },
        error: null
      };
    }
    if (call.table === "copilot_conversations" && call.payload) {
      return { data: null, error: null };
    }
    return { data: null, error: null };
  });
}

describe("copilot.service chat Gemini rate limits", () => {
  beforeEach(() => {
    resetSupabaseMock();
    aiMocks.structuredCopilotReply.mockReset();
  });

  it("returns an honest busy message instead of the insufficient-data fallback after Gemini 429 exhaustion", async () => {
    mockCopilotContext();
    aiMocks.structuredCopilotReply.mockRejectedValue(
      new Error("429 TooManyRequests: Resource exhausted")
    );

    const result = await chat("user-1", "What should I do next?");

    expect(result.response).toContain("busy");
    expect(result.response).not.toContain("little more carbon data");
  });
});
