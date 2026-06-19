/**
 * Service layer for CarbonSense domain logic. Keeps persistence, third-party API calls, and calculations behind controller-safe functions.
 */
import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
const TRANSIENT_AI_ERROR_PATTERNS = [
  "503 service unavailable",
  "429",
  "resource exhausted",
  "rate limit",
  "quota",
  "high demand",
  "try again later",
  "temporarily unavailable"
] as const;

type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

function isTransientAiError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return TRANSIENT_AI_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withAiRetry<T>(work: () => Promise<T>): Promise<T> {
  const delays = [350, 900];

  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      const shouldRetry = attempt < delays.length && isTransientAiError(error);
      if (!shouldRetry) {
        throw error;
      }

      await sleep(delays[attempt]);
    }
  }

  throw new Error("AI request failed after retry");
}

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
  return withAiRetry(async () => {
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

  const result = await withAiRetry(() => model.generateContent(prompt));
  return JSON.parse(extractJson(result.response.text()));
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
