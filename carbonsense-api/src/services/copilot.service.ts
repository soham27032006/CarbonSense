/**
 * Service layer for CarbonSense domain logic. Keeps persistence, third-party API calls, and calculations behind controller-safe functions.
 */
import { z } from "zod";
import { supabaseAdmin } from "../config/supabase";
import type { CarbonCategory, CopilotConversation, CopilotMessage } from "../types";
import { getEquivalencies } from "../utils/equivalencies";
import { todayIndia } from "../utils/date";
import { structuredCopilotReply } from "./ai.service";
import {
  GEMINI_BUSY_MESSAGE,
  isGeminiRateLimitError
} from "./gemini-retry";

/** Shape of the "today's challenge" context block. `null` when no challenge
 *  has been assigned yet today. Independent of live carbon data so challenge,
 *  streak, and XP questions stay answerable without bank transactions. */
type TodaysChallengeContext = {
  title: string;
  status: string;
  category: string;
  difficulty: string;
  carbon_save_kg: number;
  xp_reward: number;
  tips: string[];
};

type UserContext = {
  name: string;
  carbon_age: number;
  level: number;
  level_name: string;
  xp: number;
  streak_count: number;
  monthly_kg: number;
  top_category: CarbonCategory;
  top_category_percent: number;
  category_breakdown: Record<CarbonCategory, number>;
  /** True only when the user has real transaction-derived carbon totals this
   *  month. Drives whether carbon/comparison questions can be answered. */
  has_live_carbon_data: boolean;
  todays_challenge: TodaysChallengeContext | null;
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
  return await chatWorkflow(userId, userMessage);
}

/**
 * Executes the extracted chat service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `chat`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function chatWorkflow(
  userId: string,
  userMessage: string
): Promise<ChatResult> {
  const { context, conversation } = await loadChatContext(userId);
  const history = conversation.messages.slice(-16);
  const userEntry = buildUserMessage(userMessage);
  const { response, suggestions } = await getAssistantResponse(context, userMessage, history);
  const assistantEntry = buildAssistantMessage(response);

  await saveChatMessages(conversation, userEntry, assistantEntry);

  return { response, suggestions };
}

/**
 * Loads the profile context and persisted conversation required for a chat turn.
 * @returns The user context and existing or newly created conversation.
 * @throws When context or conversation persistence cannot be loaded.
 */
async function loadChatContext(userId: string): Promise<{
  context: UserContext;
  conversation: CopilotConversation;
}> {
  const [context, conversation] = await Promise.all([
    getUserContext(userId),
    getOrCreateConversation(userId)
  ]);

  return { context, conversation };
}

/**
 * Builds the user-side persisted chat message.
 * @returns A Copilot message with the current timestamp.
 */
function buildUserMessage(userMessage: string): CopilotMessage {
  return {
    role: "user",
    content: userMessage,
    timestamp: new Date().toISOString()
  };
}

/**
 * Requests the assistant response and follow-up suggestions in a single Gemini call.
 * @returns Trimmed AI reply and a 1-3 element suggestions array, or the original fallbacks.
 * @throws When the upstream AI call fails or returns malformed JSON.
 */
async function getAssistantResponse(
  context: UserContext,
  userMessage: string,
  history: CopilotMessage[]
): Promise<{ response: string; suggestions: string[] }> {
  const fallbackResponse =
    "I can help with that once I have a little more carbon data from your recent activity.";
  const fallbackSuggestions = [
    `How can I reduce my ${context.top_category} footprint?`,
    "What challenge should I do next?",
    "How does this compare to the average American?"
  ];

  try {
    const structured = (await structuredCopilotReply(
      buildSystemPrompt(context),
      userMessage,
      toAiHistory(history)
    )) as { response?: unknown; suggestions?: unknown };

    const response =
      typeof structured?.response === "string" && structured.response.trim().length > 0
        ? structured.response.trim()
        : fallbackResponse;

    const parsed = suggestionsSchema.safeParse(structured?.suggestions);
    const suggestions = parsed.success ? parsed.data.suggestions : fallbackSuggestions;

    return { response, suggestions };
  } catch (error) {
    if (isGeminiRateLimitError(error)) {
      return { response: GEMINI_BUSY_MESSAGE, suggestions: fallbackSuggestions };
    }

    return { response: fallbackResponse, suggestions: fallbackSuggestions };
  }
}

/**
 * Converts persisted Copilot history into the role/content shape accepted by AI.
 * @returns User and assistant messages only, preserving original order.
 */
function toAiHistory(history: CopilotMessage[]): Array<{
  role: "user" | "assistant";
  content: string;
}> {
  return history
    .filter(
      (message): message is CopilotMessage & { role: "user" | "assistant" } =>
        message.role === "user" || message.role === "assistant"
    )
    .map((message) => ({
      role: message.role,
      content: message.content
    }));
}

/**
 * Builds the assistant-side persisted chat message.
 * @returns A Copilot assistant message with the current timestamp.
 */
function buildAssistantMessage(assistantText: string): CopilotMessage {
  return {
    role: "assistant",
    content: assistantText,
    timestamp: new Date().toISOString()
  };
}

/**
 * Persists the user and assistant messages onto the conversation.
 * @returns Resolves after the existing save routine succeeds.
 * @throws When conversation persistence fails.
 */
async function saveChatMessages(
  conversation: CopilotConversation,
  userEntry: CopilotMessage,
  assistantEntry: CopilotMessage
): Promise<void> {
  await saveConversationMessages(conversation.id, [
    ...conversation.messages,
    userEntry,
    assistantEntry
  ]);
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
  const [profile, monthlySummary, recentChallenges, todaysChallenge] = await Promise.all([
    getProfile(userId),
    getMonthlyCarbonSummary(userId),
    getRecentChallenges(userId),
    getTodaysChallenge(userId)
  ]);
  const categoryEntries = Object.entries(monthlySummary.category_breakdown) as Array<
    [CarbonCategory, number]
  >;
  const [topCategory, topCategoryKg] = categoryEntries.reduce((highest, current) =>
    current[1] > highest[1] ? current : highest
  );
  const hasLiveCarbonData = monthlySummary.monthly_kg > 0;
  const topCategoryPercent =
    hasLiveCarbonData
      ? Math.round((topCategoryKg / monthlySummary.monthly_kg) * 100)
      : 0;

  return {
    ...profile,
    monthly_kg: monthlySummary.monthly_kg,
    top_category: topCategory,
    top_category_percent: topCategoryPercent,
    category_breakdown: monthlySummary.category_breakdown,
    has_live_carbon_data: hasLiveCarbonData,
    todays_challenge: todaysChallenge,
    recent_challenges: recentChallenges
  };
}

async function getProfile(userId: string): Promise<{
  name: string;
  carbon_age: number;
  level: number;
  level_name: string;
  xp: number;
  streak_count: number;
}> {
  const { data, error } = await supabaseAdmin
    .from("users")
    .select("name,carbon_age,level,level_name,xp,streak_count")
    .eq("id", userId)
    .single<{
      name: string;
      carbon_age: number;
      level: number;
      level_name: string;
      xp: number;
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
  return await getMonthlyCarbonSummaryWorkflow(userId);
}

/**
 * Executes the extracted getMonthlyCarbonSummary service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `getMonthlyCarbonSummary`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function getMonthlyCarbonSummaryWorkflow(userId: string): Promise<{
  monthly_kg: number;
  category_breakdown: Record<CarbonCategory, number>;
}> {
  const periodStart = getCurrentMonthPeriodStart();
  const data = await loadMonthlyCarbonSummary(userId, periodStart);

  return buildMonthlyCarbonSummary(data);
}

/**
 * Computes the first day of the current UTC month for monthly summaries.
 * @returns The date string used by carbon_summaries.period_start.
 */
function getCurrentMonthPeriodStart(): string {
  const currentMonth = new Date();
  currentMonth.setUTCDate(1);

  return currentMonth.toISOString().slice(0, 10);
}

/**
 * Loads the persisted monthly carbon summary row for Copilot context.
 * @returns The summary row or null when no row exists.
 * @throws When Supabase returns an error.
 */
async function loadMonthlyCarbonSummary(userId: string, periodStart: string) {
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

  return data;
}

/**
 * Shapes a nullable carbon summary row into Copilot's category breakdown.
 * @returns Monthly totals with zero fallbacks for missing rows.
 */
function buildMonthlyCarbonSummary(data: Awaited<ReturnType<typeof loadMonthlyCarbonSummary>>): {
  monthly_kg: number;
  category_breakdown: Record<CarbonCategory, number>;
} {
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

/** Maximum number of today-challenge tips surfaced into Copilot context. Keeps
 *  the system prompt concise while still giving the model actionable detail. */
const COPILOT_CHALLENGE_TIP_LIMIT = 3;

/**
 * Loads today's assigned challenge for Copilot context.
 * Reads the existing daily assignment (pending/accepted/completed) without
 * running challenge-assignment logic, so challenge, streak, and XP questions
 * stay answerable even when no live carbon data exists. Returns null when the
 * user has no non-skipped assignment for today.
 * @returns Today's challenge context, or null when none exists.
 */
async function getTodaysChallenge(
  userId: string
): Promise<TodaysChallengeContext | null> {
  const today = todayIndia();
  const { data: assignment, error } = await supabaseAdmin
    .from("user_challenges")
    .select("challenge_id,status")
    .eq("user_id", userId)
    .eq("date_assigned", today)
    .in("status", ["pending", "accepted", "completed"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ challenge_id: string; status: string }>();

  if (error || !assignment) {
    return null;
  }

  const { data: challenge, error: challengeError } = await supabaseAdmin
    .from("challenges")
    .select("title,category,difficulty,carbon_save_kg,xp_reward,tips")
    .eq("id", assignment.challenge_id)
    .maybeSingle<{
      title: string;
      category: string;
      difficulty: string;
      carbon_save_kg: number;
      xp_reward: number;
      tips: string[];
    }>();

  if (challengeError || !challenge) {
    return null;
  }

  return {
    title: challenge.title,
    status: assignment.status,
    category: challenge.category,
    difficulty: challenge.difficulty,
    carbon_save_kg: Number(challenge.carbon_save_kg ?? 0),
    xp_reward: Number(challenge.xp_reward ?? 0),
    tips: Array.isArray(challenge.tips) ? challenge.tips.slice(0, COPILOT_CHALLENGE_TIP_LIMIT) : []
  };
}

async function getOrCreateConversation(
  userId: string
): Promise<CopilotConversation> {
  return await getOrCreateConversationWorkflow(userId);
}

/**
 * Executes the extracted getOrCreateConversation service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `getOrCreateConversation`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function getOrCreateConversationWorkflow(
  userId: string
): Promise<CopilotConversation> {
  const conversation = await findLatestConversation(userId);

  if (conversation) {
    return normalizeConversation(conversation);
  }

  return await createConversation(userId);
}

/**
 * Finds the most recently updated Copilot conversation for a user.
 * @returns The latest conversation or null when none exists.
 * @throws When Supabase returns a query error.
 */
async function findLatestConversation(userId: string): Promise<CopilotConversation | null> {
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

  return data;
}

/**
 * Creates an empty Copilot conversation for the user.
 * @returns The newly created conversation with an empty message list.
 * @throws When Supabase cannot create the conversation.
 */
async function createConversation(userId: string): Promise<CopilotConversation> {
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

/**
 * Normalizes stored messages on an existing conversation.
 * @returns The conversation with safe Copilot message objects.
 */
function normalizeConversation(conversation: CopilotConversation): CopilotConversation {
  return {
    ...conversation,
    messages: normalizeMessages(conversation.messages)
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

/**
 * Assembles the Gemini system prompt for the Copilot chat turn.
 * Orchestrates context gathering and delegates to the template function.
 * @returns The complete system prompt string sent to the Gemini API.
 */
function buildSystemPrompt(context: UserContext): string {
  const equivalencies = getEquivalencies(context.monthly_kg);
  const carbonSection = context.has_live_carbon_data
    ? buildLiveCarbonSection(context, equivalencies)
    : buildNoCarbonDataSection();

  return formatSystemPrompt(
    context.name,
    context.carbon_age,
    context.level_name,
    context.level,
    context.xp,
    context.streak_count,
    buildTodaysChallengeSection(context.todays_challenge),
    carbonSection,
    context.recent_challenges
  );
}

/**
 * Renders the full Copilot system prompt template from its component parts.
 * Extracted from buildSystemPrompt so the orchestrator stays under 30 lines.
 * Every interpolated value is passed as an argument to keep the template
 * deterministic and testable.
 * @returns The complete system prompt string.
 */
function formatSystemPrompt(
  name: string,
  carbonAge: number,
  levelName: string,
  level: number,
  xp: number,
  streakCount: number,
  todaysChallengeSection: string,
  carbonSection: string,
  recentChallenges: string[]
): string {
  return `
You are CarbonSense AI, a friendly and knowledgeable personal climate coach.

USER CONTEXT:
- Name: ${name}
- Carbon Age: ${carbonAge}
- Level: ${levelName} (Level ${level})
- XP: ${xp}
- Current Streak: ${streakCount} days

TODAY'S CHALLENGE:
${todaysChallengeSection}

CARBON DATA:
${carbonSection}

RECENT CHALLENGE HISTORY:
- ${recentChallenges.join(", ") || "No recent challenges yet"}

RULES:
1. Be encouraging, specific, and action-oriented
2. Never guilt-trip or shame the user
3. Reference their ACTUAL data when answering questions
4. Provide specific numbers and comparisons
5. Suggest concrete, achievable actions
6. If asked about topics outside carbon/sustainability, politely redirect
7. Use equivalencies to make carbon tangible (trees, drives, flights) ONLY when the CARBON DATA section above contains real numbers
8. Keep responses concise - max 3 paragraphs
9. If the user seems discouraged, emphasize their progress and small wins
10. Never make up data you don't have - say "I don't have that data yet" if unsure

WHICH QUESTIONS YOU CAN ANSWER:
- Challenge, streak, XP, and "what should I do next" questions: ALWAYS answer from TODAY'S CHALLENGE, RECENT CHALLENGE HISTORY, and the user's streak/level/XP. These never depend on carbon data. Name the specific assigned challenge and its tips.
- General carbon-reduction advice (e.g. "how can I reduce my food footprint", "low-carbon swaps"): ALWAYS answer with concrete, general tips, even without personalized carbon data.
- Carbon-category questions ("what's my biggest carbon category", category breakdowns), comparisons ("how do I compare to the average"), and questions referencing the user's spending/transaction carbon: answer with real numbers ONLY when the CARBON DATA section above contains live transaction data. If it says there is no live carbon data yet, tell the user you'll be able to answer those once they connect a bank account, and offer a related tip or today's challenge instead.
`.trim();
}

/**
 * Renders the carbon block when the user has real transaction-derived totals.
 * @returns Lines presenting monthly totals, top category, and equivalencies.
 */
function buildLiveCarbonSection(
  context: UserContext,
  equivalencies: ReturnType<typeof getEquivalencies>
): string {
  return [
    `- This month's carbon: ${context.monthly_kg} kg CO2`,
    `- Top carbon category: ${context.top_category} (${context.top_category_percent}% of total)`,
    `- Category breakdown: Food: ${context.category_breakdown.food}kg, Transport: ${context.category_breakdown.transport}kg, Home: ${context.category_breakdown.home}kg, Shopping: ${context.category_breakdown.shopping}kg, Travel: ${context.category_breakdown.travel}kg`,
    `- Monthly carbon equivalencies: ${equivalencies.human_readable.miles_driven}; ${equivalencies.human_readable.trees_absorbed}`
  ].join("\n");
}

/**
 * Renders the carbon block when no transaction-derived totals exist yet.
 * @returns Lines telling the model there is no live carbon data and why.
 */
function buildNoCarbonDataSection(): string {
  return [
    "- No live carbon data yet: the user has not connected a bank account, so there are no transaction-derived category totals.",
    "- Do NOT present any carbon category, breakdown, or equivalency as if you know it.",
    "- You can still fully answer challenge, streak, XP, and general carbon-reduction-advice questions."
  ].join("\n");
}

/**
 * Renders the today's challenge block, or a clear absence message.
 * @returns Lines naming today's assigned challenge and its tips, or a
 *          "no challenge today" line when none is assigned.
 */
function buildTodaysChallengeSection(
  challenge: TodaysChallengeContext | null
): string {
  if (!challenge) {
    return "- No challenge has been assigned for today yet.";
  }

  const tips = challenge.tips.length > 0 ? challenge.tips.join(" | ") : "none";
  return [
    `- Title: ${challenge.title}`,
    `- Status: ${challenge.status}`,
    `- Category: ${challenge.category} | Difficulty: ${challenge.difficulty}`,
    `- Carbon saved if completed: ${challenge.carbon_save_kg} kg | XP reward: ${challenge.xp_reward}`,
    `- Tips: ${tips}`
  ].join("\n");
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
