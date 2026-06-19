/**
 * Controller layer for authenticated CarbonSense API requests. Validates request context, delegates business work to services, and returns stable response envelopes.
 */
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../middleware/errorHandler";
import {
  chat,
  getHistory,
  getSuggestions
} from "../services/copilot.service";

const chatSchema = z.object({
  message: z
    .string({
      error: () => "Message is required"
    })
    .trim()
    .min(1, "Message is required")
    .max(2000, "Message must be 2000 characters or less")
});

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
  }

  return req.user.id;
}

function firstIssueMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Invalid Copilot request";
}

function logCopilotValidationFailure(req: Request, error: z.ZodError): void {
  console.error("[copilot] Validation failed", {
    userId: req.user?.id ?? null,
    bodyType: Array.isArray(req.body) ? "array" : typeof req.body,
    bodyKeys:
      req.body && typeof req.body === "object" && !Array.isArray(req.body)
        ? Object.keys(req.body)
        : [],
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
      code: issue.code
    }))
  });
}

function messageFrom(error: unknown): string {
  return (error instanceof Error ? error.message : "Copilot request failed").toLowerCase();
}

function isRateLimited(message: string): boolean {
  return message.includes("rate limit") || message.includes("quota");
}

function isUnavailable(message: string): boolean {
  return ["service unavailable", "high demand", "temporarily unavailable", "try again later"].some((term) => message.includes(term));
}

function isConfigError(message: string): boolean {
  return ["api key", "permission", "unauthorized", "forbidden"].some((term) => message.includes(term));
}

function isContextError(message: string): boolean {
  return ["unable to load copilot", "unable to create copilot", "unable to save copilot"].some((term) => message.includes(term));
}

function toCopilotError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  const message = messageFrom(error);
  if (isRateLimited(message)) {
    return new AppError("You've reached today's Copilot limit. Try again tomorrow.", 429, "COPILOT_RATE_LIMITED");
  }

  if (isUnavailable(message)) {
    return new AppError("The assistant is under heavy demand right now. Try again in a moment.", 503, "COPILOT_UPSTREAM_UNAVAILABLE");
  }

  if (isConfigError(message)) {
    return new AppError("The assistant is unavailable right now.", 503, "COPILOT_UPSTREAM_CONFIG_ERROR");
  }

  if (message.includes("timed out") || message.includes("timeout")) {
    return new AppError("The assistant took too long to respond.", 504, "COPILOT_TIMEOUT");
  }

  if (isContextError(message)) {
    return new AppError("I couldn't load your Copilot context right now.", 503, "COPILOT_CONTEXT_UNAVAILABLE");
  }

  return new AppError("The assistant couldn't answer that right now.", 502, "COPILOT_UPSTREAM_ERROR");
}

function parseChatBody(req: Request, next: NextFunction): z.infer<typeof chatSchema> | null {
  const parsed = chatSchema.safeParse(req.body);
  if (parsed.success) return parsed.data;

  logCopilotValidationFailure(req, parsed.error);
  next(new AppError(firstIssueMessage(parsed.error), 400, "COPILOT_VALIDATION_FAILED"));
  return null;
}

function logCopilotFailure(req: Request, stage: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  const upstreamStatus = /\[(\d{3})[^\]]*\]/.exec(message)?.[1] ?? null;

  console.error(`[copilot] ${stage} failed`, {
    userId: req.user?.id ?? null,
    upstreamStatus,
    message,
    stack: error instanceof Error ? error.stack : undefined
  });
}

/**
 * Handles the chatController API request and returns the existing response contract.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function chatController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const input = parseChatBody(req, next);
  if (!input) return;

  try {
    const data = await chat(requireUserId(req), input.message);
    res.status(200).json({ success: true, data });
  } catch (error) {
    logCopilotFailure(req, "chat", error);
    next(toCopilotError(error));
    return;
  }
}

/**
 * Handles the suggestionsController API request and returns the existing response contract.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function suggestionsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const suggestions = await getSuggestions(requireUserId(req));
    res.status(200).json({ success: true, data: { suggestions } });
  } catch (error) {
    logCopilotFailure(req, "suggestions", error);
    next(toCopilotError(error));
    return;
  }
}

/**
 * Handles the historyController API request and returns the existing response contract.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function historyController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const history = await getHistory(requireUserId(req));
    res.status(200).json({ success: true, data: { messages: history } });
  } catch (error) {
    logCopilotFailure(req, "history", error);
    next(toCopilotError(error));
    return;
  }
}
