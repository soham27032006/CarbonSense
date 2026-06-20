/**
 * Shared Gemini retry handling for transient upstream failures.
 */
import { AI_REQUEST_TIMEOUT_MS } from "../config/timeouts";

export const GEMINI_MAX_RETRIES = 2;
export const GEMINI_RETRY_BASE_DELAY_MS = 1000;
export const GEMINI_BUSY_ERROR_CODE = "AI_UPSTREAM_BUSY";
export const GEMINI_BUSY_MESSAGE =
  "The AI assistant is a bit busy right now - please try again in a moment.";

const GEMINI_RATE_LIMIT_STATUS = 429;
const GEMINI_SERVICE_UNAVAILABLE_STATUS = 503;
const GEMINI_TRANSIENT_STATUS_CODES = [
  GEMINI_RATE_LIMIT_STATUS,
  GEMINI_SERVICE_UNAVAILABLE_STATUS
] as const;
const GEMINI_TRANSIENT_ERROR_PATTERNS = [
  "429",
  "503",
  "resource exhausted",
  "rate limit",
  "quota",
  "high demand",
  "try again later",
  "temporarily unavailable",
  "service unavailable"
] as const;

type GeminiRetryOptions = {
  sleep?: (delayMs: number) => Promise<void>;
};

export class GeminiRateLimitError extends Error {
  code = GEMINI_BUSY_ERROR_CODE;
  cause: unknown;

  constructor(cause: unknown) {
    super(GEMINI_BUSY_MESSAGE);
    this.name = "GeminiRateLimitError";
    this.cause = cause;
  }
}

export function isGeminiRateLimitError(error: unknown): error is GeminiRateLimitError {
  return (
    error instanceof GeminiRateLimitError ||
    (typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === GEMINI_BUSY_ERROR_CODE) ||
    isRateLimitedGeminiError(error)
  );
}

export async function withGeminiRetry<T>(
  work: () => Promise<T>,
  options: GeminiRetryOptions = {}
): Promise<T> {
  const startedAt = Date.now();
  const wait = options.sleep ?? sleep;

  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt += 1) {
    try {
      return await work();
    } catch (error) {
      const hasRetryLeft = attempt < GEMINI_MAX_RETRIES;
      const isRetryable = isTransientGeminiError(error);

      if (!hasRetryLeft || !isRetryable) {
        if (isRateLimitedGeminiError(error)) {
          throw new GeminiRateLimitError(error);
        }

        throw error;
      }

      const delayMs = getGeminiRetryDelay(attempt, startedAt);
      if (delayMs > 0) {
        await wait(delayMs);
      }
    }
  }

  throw new Error("Gemini request failed after retry");
}

function isTransientGeminiError(error: unknown): boolean {
  return isTransientStatusError(error) || hasTransientErrorMessage(error);
}

function isRateLimitedGeminiError(error: unknown): boolean {
  return getErrorStatus(error) === GEMINI_RATE_LIMIT_STATUS || hasRateLimitErrorMessage(error);
}

function isTransientStatusError(error: unknown): boolean {
  const status = getErrorStatus(error);
  return GEMINI_TRANSIENT_STATUS_CODES.some((transientStatus) => transientStatus === status);
}

function getErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const candidate = error as { status?: unknown; statusCode?: unknown; code?: unknown };
  const rawStatus = candidate.status ?? candidate.statusCode ?? candidate.code;
  return typeof rawStatus === "number" ? rawStatus : undefined;
}

function hasTransientErrorMessage(error: unknown): boolean {
  const message = getErrorMessage(error);
  return GEMINI_TRANSIENT_ERROR_PATTERNS.some((pattern) => message.includes(pattern));
}

function hasRateLimitErrorMessage(error: unknown): boolean {
  const message = getErrorMessage(error);
  return (
    message.includes(String(GEMINI_RATE_LIMIT_STATUS)) ||
    message.includes("resource exhausted") ||
    message.includes("rate limit") ||
    message.includes("quota")
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
}

function getGeminiRetryDelay(attempt: number, startedAt: number): number {
  const exponentialDelay = GEMINI_RETRY_BASE_DELAY_MS * 2 ** attempt;
  const elapsedMs = Date.now() - startedAt;
  const remainingTimeoutMs = AI_REQUEST_TIMEOUT_MS - elapsedMs;

  return Math.max(0, Math.min(exponentialDelay, remainingTimeoutMs));
}

async function sleep(delayMs: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}
