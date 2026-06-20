/**
 * Service layer for CarbonSense domain logic. Keeps persistence, third-party API calls, and calculations behind controller-safe functions.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env";
import { AI_REQUEST_TIMEOUT_MS } from "../config/timeouts";
import { withGeminiRetry } from "./gemini-retry";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel(
  { model: "gemini-2.5-flash" },
  { timeout: AI_REQUEST_TIMEOUT_MS }
);
type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Runs the chatWithAI service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function chatWithAI(
  systemPrompt: string,
  userMessage: string,
  history: ChatHistoryMessage[] = []
): Promise<string> {
  return withGeminiRetry(async () => {
    const chat = model.startChat({
      history: history.map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }]
      })),
      generationConfig: { maxOutputTokens: 500, temperature: 0.7 }
    });

    const fullPrompt =
      history.length === 0 ? `${systemPrompt}

User: ${userMessage}` : userMessage;

    const result = await chat.sendMessage(fullPrompt);
    return result.response.text();
  });
}

/**
 * Runs the classifyCarbon service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function classifyCarbon(
  merchantName: string,
  category: string,
  amount: number
): Promise<unknown> {
  const prompt = `You are a carbon emissions classifier. Given this transaction:
Merchant: ${merchantName}, Category: ${category}, Amount: $${amount}
Return ONLY valid JSON: {"carbon_category":"food|transport|home|shopping|travel|other","emission_factor_per_dollar":number,"reasoning":"string"}`;

  const result = await withGeminiRetry(() => model.generateContent(prompt));
  return JSON.parse(extractJson(result.response.text()));
}

/**
 * Runs the classifyCarbonBatch service workflow for CarbonSense domain data.
 * @param items - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function classifyCarbonBatch(
  items: Array<{ merchant: string; category: string; amount: number }>
): Promise<Array<{
  carbon_category: "food" | "transport" | "home" | "shopping" | "travel" | "other";
  emission_factor_per_dollar: number;
  reasoning: string;
}>> {
  if (items.length === 0) {
    return [];
  }

  const prompt = `You are a carbon emissions classifier. Classify each transaction into a carbon category and emission factor (kg CO2 per USD).
Return ONLY a JSON array (one element per transaction, in the same order):
[{"carbon_category":"food|transport|home|shopping|travel|other","emission_factor_per_dollar":number,"reasoning":"string"}]

Transactions:
${items
    .map(
      (item, index) =>
        `${index + 1}. Merchant: ${item.merchant}, Category: ${item.category}, Amount: $${item.amount}`
    )
    .join("\n")}`;

  const result = await withGeminiRetry(() => model.generateContent(prompt));
  const parsed = JSON.parse(extractJson(result.response.text())) as unknown;

  return Array.isArray(parsed) ? (parsed as Array<{
    carbon_category: "food" | "transport" | "home" | "shopping" | "travel" | "other";
    emission_factor_per_dollar: number;
    reasoning: string;
  }>) : [];
}

/**
 * Runs the structuredCopilotReply service workflow for CarbonSense domain data.
 * @param systemPrompt - Input consumed by this workflow.
 * @param userMessage - Input consumed by this workflow.
 * @param history - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function structuredCopilotReply(
  systemPrompt: string,
  userMessage: string,
  history: ChatHistoryMessage[] = []
): Promise<unknown> {
  return withGeminiRetry(async () => {
    const chat = model.startChat({
      history: history.map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }]
      })),
      generationConfig: { maxOutputTokens: 700, temperature: 0.7 }
    });

    const fullPrompt =
      `${systemPrompt}

When you reply, also return three concise follow-up prompts the user might tap next.
Return ONLY valid JSON: {"response": string, "suggestions": [string, string, string]}

User: ${userMessage}`;

    const result = await chat.sendMessage(fullPrompt);
    return JSON.parse(extractJson(result.response.text()));
  });
}

/**
 * Runs the extractJson service workflow for CarbonSense domain data.
 * @param text - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export function extractJson(text: string): string {
  const trimmed = text.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const objectStart = withoutFence.indexOf("{");
  const objectEnd = withoutFence.lastIndexOf("}");

  if (objectStart >= 0 && objectEnd > objectStart) {
    return withoutFence.slice(objectStart, objectEnd + 1);
  }

  return withoutFence;
}
