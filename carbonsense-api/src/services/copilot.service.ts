/**
 * Service layer for CarbonSense domain logic. Keeps persistence, third-party API calls, and calculations behind controller-safe functions.
 */
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase";
import type { CarbonCategory, CopilotConversation, CopilotMessage } from "../types";
import { getEquivalencies } from "../utils/equivalencies";
import { chatWithAI, extractJson } from "./ai.service";

type UserContext = {
  name: string;
  carbon_age: number;
  level: number;
  level_name: string;
  streak_count: number;
  monthly_kg: number;
  top_category: CarbonCategory;
  top_category_percent: number;
  category_breakdown: Record<CarbonCategory, number>;
  recent_challenges: string[];
};

type ChatResult = {
  response: string;
  suggestions: string[];
};

const suggestionsSchema = z.object({
  suggestions: z.array(z.string().min(1)).min(1).max(3)
});

/**
 * Runs the chat service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function chat(
  userId: string,
  userMessage: string
): Promise<ChatResult> {
  const [context, conversation] = await Promise.all([
    getUserContext(userId),
    getOrCreateConversation(userId)
  ]);
  const history = conversation.messages.slice(-16);
  const now = new Date().toISOString();
  const userEntry: CopilotMessage = {
    role: "user",
    content: userMessage,
    timestamp: now
  };

  const assistantText =
    (
      await chatWithAI(
        buildSystemPrompt(context),
        userMessage,
        history
          .filter(
            (message): message is CopilotMessage & { role: "user" | "assistant" } =>
              message.role === "user" || message.role === "assistant"
          )
          .map((message) => ({
            role: message.role,
            content: message.content
          }))
      )
    ).trim() ||
    "I can help with that once I have a little more carbon data from your recent activity.";
  const assistantEntry: CopilotMessage = {
    role: "assistant",
    content: assistantText,
    timestamp: new Date().toISOString()
  };

  await saveConversationMessages(conversation.id, [
    ...conversation.messages,
    userEntry,
    assistantEntry
  ]);

  return {
    response: assistantText,
    suggestions: await generateFollowUpSuggestions(context, userMessage, assistantText)
  };
}

/**
 * Runs the getSuggestions service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function getSuggestions(userId: string): Promise<string[]> {
  const context = await getUserContext(userId);
  const prompts = [
    "What's my biggest carbon category?",
    "How do I compare to the average American?",
    `What can I do to reduce my ${context.top_category} carbon?`,
    "Is organic food really better for the environment?",
    "Plan me a low-carbon week"
  ];

  if (context.recent_challenges.length === 0) {
    return [
      "What challenge should I start with today?",
      ...prompts.slice(0, 4)
    ];
  }

  return prompts;
}

/**
 * Runs the getHistory service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function getHistory(userId: string): Promise<CopilotMessage[]> {
  const conversation = await getOrCreateConversation(userId);

  return conversation.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      role: message.role,
      content: message.content,
      timestamp: message.timestamp
    }));
}

async function getUserContext(userId: string): Promise<UserContext> {
  const [profile, monthlySummary, recentChallenges] = await Promise.all([
    getProfile(userId),
    getMonthlyCarbonSummary(userId),
    getRecentChallenges(userId)
  ]);
  const categoryEntries = Object.entries(monthlySummary.category_breakdown) as Array<
    [CarbonCategory, number]
  >;
  const [topCategory, topCategoryKg] = categoryEntries.reduce((highest, current) =>
    current[1] > highest[1] ? current : highest
  );
  const topCategoryPercent =
    monthlySummary.monthly_kg > 0
      ? Math.round((topCategoryKg / monthlySummary.monthly_kg) * 100)
      : 0;

  return {
    ...profile,
    monthly_kg: monthlySummary.monthly_kg,
    top_category: topCategory,
    top_category_percent: topCategoryPercent,
    category_breakdown: monthlySummary.category_breakdown,
    recent_challenges: recentChallenges
  };
}

async function getProfile(userId: string): Promise<{
  name: string;
  carbon_age: number;
  level: number;
  level_name: string;
  streak_count: number;
}> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("name,carbon_age,level,level_name,streak_count")
    .eq("id", userId)
    .single<{
      name: string;
      carbon_age: number;
      level: number;
      level_name: string;
      streak_count: number;
    }>();

  if (error || !data) {
    throw new Error("Unable to load Copilot profile context");
  }

  return data;
}

async function getMonthlyCarbonSummary(userId: string): Promise<{
  monthly_kg: number;
  category_breakdown: Record<CarbonCategory, number>;
}> {
  const currentMonth = new Date();
  currentMonth.setUTCDate(1);
  const periodStart = currentMonth.toISOString().slice(0, 10);
  const { data, error } = await supabaseAdmin
    .from("carbon_summaries")
    .select("total_carbon_kg,food_kg,transport_kg,home_kg,shopping_kg,travel_kg,other_kg")
    .eq("user_id", userId)
    .eq("period_type", "month")
    .eq("period_start", periodStart)
    .maybeSingle();

  if (error) {
    throw new Error("Unable to load Copilot carbon context");
  }

  return {
    monthly_kg: Number(data?.total_carbon_kg ?? 0),
    category_breakdown: {
      food: Number(data?.food_kg ?? 0),
      transport: Number(data?.transport_kg ?? 0),
      home: Number(data?.home_kg ?? 0),
      shopping: Number(data?.shopping_kg ?? 0),
      travel: Number(data?.travel_kg ?? 0),
      other: Number(data?.other_kg ?? 0)
    }
  };
}

async function getRecentChallenges(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("user_challenges")
    .select("challenge_id,status,date_assigned")
    .eq("user_id", userId)
    .in("status", ["completed", "skipped"])
    .order("date_assigned", { ascending: false })
    .limit(10);

  if (error || !data || data.length === 0) {
    return [];
  }

  const challengeIds = [...new Set(data.map((row) => row.challenge_id))];
  const { data: challenges, error: challengesError } = await supabaseAdmin
    .from("challenges")
    .select("id,title")
    .in("id", challengeIds);

  if (challengesError || !challenges) {
    return [];
  }

  const titlesById = new Map(challenges.map((challenge) => [challenge.id, challenge.title]));

  return data.map((row) => {
    const title = titlesById.get(row.challenge_id) ?? "Unknown challenge";
    return `${title} (${row.status})`;
  });
}

async function getOrCreateConversation(
  userId: string
): Promise<CopilotConversation> {
  const { data, error } = await supabaseAdmin
    .from("copilot_conversations")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<CopilotConversation>();

  if (error) {
    throw new Error("Unable to load Copilot conversation");
  }

  if (data) {
    return {
      ...data,
      messages: normalizeMessages(data.messages)
    };
  }

  const { data: created, error: createError } = await supabaseAdmin
    .from("copilot_conversations")
    .insert({
      user_id: userId,
      messages: []
    })
    .select("*")
    .single<CopilotConversation>();

  if (createError || !created) {
    throw new Error("Unable to create Copilot conversation");
  }

  return {
    ...created,
    messages: []
  };
}

async function saveConversationMessages(
  conversationId: string,
  messages: CopilotMessage[]
): Promise<void> {
  const trimmedMessages = messages.slice(-50);
  const { error } = await supabaseAdmin
    .from("copilot_conversations")
    .update({
      messages: trimmedMessages,
      updated_at: new Date().toISOString()
    })
    .eq("id", conversationId);

  if (error) {
    throw new Error("Unable to save Copilot conversation");
  }
}

function buildSystemPrompt(context: UserContext): string {
  const equivalencies = getEquivalencies(context.monthly_kg);

  return `
You are CarbonSense AI, a friendly and knowledgeable personal climate coach.

USER CONTEXT:
- Name: ${context.name}
- Carbon Age: ${context.carbon_age}
- Level: ${context.level_name} (Level ${context.level})
- Current Streak: ${context.streak_count} days
- This month's carbon: ${context.monthly_kg} kg CO2
- Top carbon category: ${context.top_category} (${context.top_category_percent}% of total)
- Category breakdown: Food: ${context.category_breakdown.food}kg, Transport: ${context.category_breakdown.transport}kg, Home: ${context.category_breakdown.home}kg, Shopping: ${context.category_breakdown.shopping}kg, Travel: ${context.category_breakdown.travel}kg
- Recent challenges completed: ${context.recent_challenges.join(", ") || "I don't have that data yet"}
- Monthly carbon equivalencies: ${equivalencies.human_readable.miles_driven}; ${equivalencies.human_readable.trees_absorbed}

RULES:
1. Be encouraging, specific, and action-oriented
2. Never guilt-trip or shame the user
3. Reference their ACTUAL data when answering questions
4. Provide specific numbers and comparisons
5. Suggest concrete, achievable actions
6. If asked about topics outside carbon/sustainability, politely redirect
7. Use equivalencies to make carbon tangible (trees, drives, flights)
8. Keep responses concise - max 3 paragraphs
9. If the user seems discouraged, emphasize their progress and small wins
10. Never make up data you don't have - say "I don't have that data yet" if unsure
`.trim();
}

async function generateFollowUpSuggestions(
  context: UserContext,
  userMessage: string,
  assistantResponse: string
): Promise<string[]> {
  try {
    const response = await chatWithAI(
      "Return JSON only: { \"suggestions\": [string, string, string] }. Suggest three concise follow-up prompts for a climate coaching chat.",
      JSON.stringify({
        top_category: context.top_category,
        user_message: userMessage,
        assistant_response: assistantResponse
      })
    );
    const parsed = suggestionsSchema.parse(JSON.parse(extractJson(response)));

    return parsed.suggestions;
  } catch {
    return [
      `How can I reduce my ${context.top_category} footprint?`,
      "What challenge should I do next?",
      "How does this compare to the average American?"
    ];
  }
}

function normalizeMessages(messages: unknown): CopilotMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.filter(isCopilotMessage);
}

function isCopilotMessage(message: unknown): message is CopilotMessage {
  if (!message || typeof message !== "object") {
    return false;
  }

  const candidate = message as Partial<CopilotMessage>;

  return (
    (candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.content === "string" &&
    typeof candidate.timestamp === "string"
  );
}
