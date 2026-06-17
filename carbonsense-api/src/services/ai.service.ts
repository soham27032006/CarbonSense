import { GoogleGenerativeAI } from "@google/generative-ai";
import { env } from "../config/env";

const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

type ChatHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export async function chatWithAI(
  systemPrompt: string,
  userMessage: string,
  history: ChatHistoryMessage[] = []
): Promise<string> {
  const chat = model.startChat({
    history: history.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }]
    })),
    generationConfig: { maxOutputTokens: 500, temperature: 0.7 }
  });

  const fullPrompt =
    history.length === 0 ? `${systemPrompt}\n\nUser: ${userMessage}` : userMessage;

  const result = await chat.sendMessage(fullPrompt);
  return result.response.text();
}

export async function classifyCarbon(
  merchantName: string,
  category: string,
  amount: number
): Promise<unknown> {
  const prompt = `You are a carbon emissions classifier. Given this transaction:
Merchant: ${merchantName}, Category: ${category}, Amount: $${amount}
Return ONLY valid JSON: {"carbon_category":"food|transport|home|shopping|travel|other","emission_factor_per_dollar":number,"reasoning":"string"}`;

  const result = await model.generateContent(prompt);
  return JSON.parse(extractJson(result.response.text()));
}

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
