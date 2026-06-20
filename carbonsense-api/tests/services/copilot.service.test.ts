import { beforeEach, describe, expect, it, vi } from "vitest";
import { chat } from "../../src/services/copilot.service";
import { resetSupabaseMock, setSupabaseHandler, type SupabaseCall } from "../helpers/supabase";

type CapturedPrompt = { systemPrompt: string };

const aiMocks = vi.hoisted(() => {
  const captured: CapturedPrompt = { systemPrompt: "" };
  return {
    captured,
    structuredCopilotReply: vi.fn(async (systemPrompt: string) => {
      captured.systemPrompt = systemPrompt;
      return { response: "", suggestions: [] };
    })
  };
});

vi.mock("../../src/services/ai.service", () => ({
  structuredCopilotReply: aiMocks.structuredCopilotReply
}));

function isSelect(call: SupabaseCall, value: string): boolean {
  return call.selectArgs?.[0] === value;
}

function hasFilter(call: SupabaseCall, column: string): boolean {
  return call.filters.some((filter) => filter.args[0] === column);
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
          xp: 120,
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
    if (call.table === "user_challenges" && hasFilter(call, "date_assigned")) {
      return {
        data: { challenge_id: "challenge-1", status: "accepted" },
        error: null
      };
    }
    if (call.table === "challenges" && isSelect(call, "id,title")) {
      return { data: [{ id: "challenge-1", title: "Learn Your Impact" }], error: null };
    }
    if (call.table === "challenges" && isSelect(call, "title,category,difficulty,carbon_save_kg,xp_reward,tips")) {
      return {
        data: {
          title: "Learn Your Impact",
          category: "lifestyle",
          difficulty: "easy",
          carbon_save_kg: 2,
          xp_reward: 20,
          tips: ["Track one footprint category this week"]
        },
        error: null
      };
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

/** Resolves structuredCopilotReply with a captured AI reply and records the
 *  system prompt it was called with so prompt-instruction assertions can run. */
function mockCopilotReply(reply: unknown) {
  aiMocks.structuredCopilotReply.mockImplementation(async (systemPrompt: string) => {
    aiMocks.captured.systemPrompt = systemPrompt;
    return reply;
  });
}

describe("copilot.service chat Gemini rate limits", () => {
  beforeEach(() => {
    resetSupabaseMock();
    aiMocks.structuredCopilotReply.mockReset();
    aiMocks.captured.systemPrompt = "";
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

describe("copilot.service challenge context without carbon data", () => {
  beforeEach(() => {
    resetSupabaseMock();
    aiMocks.structuredCopilotReply.mockReset();
    aiMocks.captured.systemPrompt = "";
  });

  it("includes today's assigned challenge in the system prompt so challenge questions stay answerable without carbon data", async () => {
    mockCopilotContext();
    // No carbon_summaries row for this month -> has_live_carbon_data is false.
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "carbon_summaries") {
        return { data: null, error: null };
      }
      if (call.table === "users") {
        return {
          data: { name: "Soham", carbon_age: 22, level: 1, level_name: "Seedling", xp: 120, streak_count: 3 },
          error: null
        };
      }
      if (call.table === "user_challenges" && isSelect(call, "challenge_id,status,date_assigned")) {
        return { data: [], error: null };
      }
      if (call.table === "user_challenges" && hasFilter(call, "date_assigned")) {
        return { data: { challenge_id: "challenge-1", status: "accepted" }, error: null };
      }
      if (call.table === "challenges" && isSelect(call, "title,category,difficulty,carbon_save_kg,xp_reward,tips")) {
        return {
          data: {
            title: "Learn Your Impact",
            category: "lifestyle",
            difficulty: "easy",
            carbon_save_kg: 2,
            xp_reward: 20,
            tips: ["Track one footprint category this week"]
          },
          error: null
        };
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

    mockCopilotReply({ response: "Go for Learn Your Impact today.", suggestions: ["a", "b", "c"] });

    await chat("user-1", "What challenge should I do next?");

    const prompt = aiMocks.captured.systemPrompt;
    // Challenge questions are answerable: today's challenge is surfaced by name.
    expect(prompt).toContain("Learn Your Impact");
    expect(prompt).toContain("accepted");
    // Carbon-category questions correctly defer: no fabricated totals.
    expect(prompt).toContain("No live carbon data yet");
  });
});
