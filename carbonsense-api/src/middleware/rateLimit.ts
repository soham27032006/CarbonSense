/**
 * Rate-limiting middleware. Tracks per-client request counts in Redis
 * (production) with an automatic in-memory fallback (development / Redis-down).
 * Returns 429 with Retry-After header when the configured threshold is exceeded.
 */
import type { NextFunction, Request, Response } from "express";
import { redis, redisEnabled } from "../config/redis";
import { AppError } from "./errorHandler";

type RateLimitOptions = {
  maxRequests?: number;
  windowSeconds?: number;
  keyPrefix?: string;
};

const DEFAULT_WINDOW_SECONDS = 15 * 60;
const DEFAULT_MAX_REQUESTS = 100;
const AI_MAX_REQUESTS = 20;
const memoryRateLimitStore = new Map<string, { count: number; expiresAt: number }>();

/**
 * Derives a stable client identifier from the request.
 * Prefers the authenticated user id, then falls back to IP, then socket address.
 * @returns A string suitable for use as a Redis / memory key suffix.
 */
function getClientIdentifier(req: Request): string {
  return req.user?.id ?? req.ip ?? req.socket.remoteAddress ?? "unknown";
}

/**
 * Increments and returns the in-memory rate-limit counter for the given key.
 * Resets the counter when the previous window has expired.
 */
function consumeInMemoryRateLimit(key: string, windowSeconds: number) {
  const now = Date.now();
  const current = memoryRateLimitStore.get(key);

  if (!current || current.expiresAt <= now) {
    const next = {
      count: 1,
      expiresAt: now + windowSeconds * 1000
    };
    memoryRateLimitStore.set(key, next);
    return {
      requestCount: next.count,
      retryAfter: windowSeconds
    };
  }

  current.count += 1;
  memoryRateLimitStore.set(key, current);

  return {
    requestCount: current.count,
    retryAfter: Math.max(Math.ceil((current.expiresAt - now) / 1000), 1)
  };
}

/**
 * Increments the Redis counter and sets the TTL on the first hit.
 * @returns The current request count and the TTL-based retry-after.
 */
async function consumeRedisRateLimit(key: string, windowSeconds: number) {
  const requestCount = await redis!.incr(key);
  if (requestCount === 1) {
    await redis!.expire(key, windowSeconds);
  }
  const ttl = await redis!.ttl(key);
  return {
    requestCount,
    retryAfter: ttl > 0 ? ttl : windowSeconds
  };
}

/**
 * Sets the standard X-RateLimit-* headers on the response and, if the limit
 * is exceeded, also sets Retry-After and sends the 429 JSON envelope.
 * @param res - Express response object.
 * @param requestCount - The number of requests in the current window.
 * @param retryAfter - Seconds until the window resets.
 * @param maxRequests - The threshold for the window.
 * @returns `true` when the limit was exceeded (429 already sent); `false` when
 *          the caller should proceed to `next()`.
 */
function applyRateLimitResult(
  res: Response,
  requestCount: number,
  retryAfter: number,
  maxRequests: number
): boolean {
  res.setHeader("X-RateLimit-Limit", maxRequests.toString());
  res.setHeader(
    "X-RateLimit-Remaining",
    Math.max(maxRequests - requestCount, 0).toString()
  );
  res.setHeader("X-RateLimit-Reset", retryAfter.toString());

  if (requestCount > maxRequests) {
    res.setHeader("Retry-After", retryAfter.toString());
    res.status(429).json({
      success: false,
      error: {
        code: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests"
      }
    });
    return true;
  }

  return false;
}

/**
 * Counts the current request using the in-memory store and applies the
 * rate-limit result to the response. Used as a dev-mode fallback when
 * Redis is unavailable.
 * @returns `true` when the limit was exceeded (429 already sent).
 */
function handleDevFallback(
  res: Response,
  keyPrefix: string,
  maxRequests: number,
  windowSeconds: number,
  req: Request
): boolean {
  const identifier = getClientIdentifier(req);
  const key = `${keyPrefix}:${identifier}`;
  const memoryResult = consumeInMemoryRateLimit(key, windowSeconds);
  return applyRateLimitResult(res, memoryResult.requestCount, memoryResult.retryAfter, maxRequests);
}

/**
 * Handles errors from the Redis path. In dev mode, falls back to the
 * in-memory counter. In production, forwards a 503 AppError.
 * @throws Forwards an {@link AppError} with 503 RATE_LIMIT_UNAVAILABLE in production.
 */
function handleRateLimitError(
  error: unknown,
  res: Response,
  keyPrefix: string,
  maxRequests: number,
  windowSeconds: number,
  req: Request,
  next: NextFunction
): void {
  if (process.env.NODE_ENV !== "production") {
    if (handleDevFallback(res, keyPrefix, maxRequests, windowSeconds, req)) {
      return;
    }
    next();
    return;
  }

  next(
    new AppError(
      "Rate limiter unavailable",
      503,
      "RATE_LIMIT_UNAVAILABLE",
      true
    )
  );
}

/**
 * Creates a rate-limiting middleware instance with the given options.
 * @returns Express middleware that tracks per-client request counts and
 *          returns 429 when the threshold is exceeded.
 */
export function rateLimit(options: RateLimitOptions = {}) {
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const windowSeconds = options.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const keyPrefix = options.keyPrefix ?? "rate-limit";

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const identifier = getClientIdentifier(req);
      const key = `${keyPrefix}:${identifier}`;
      const result = redisEnabled && redis
        ? await consumeRedisRateLimit(key, windowSeconds)
        : consumeInMemoryRateLimit(key, windowSeconds);

      if (applyRateLimitResult(res, result.requestCount, result.retryAfter, maxRequests)) {
        return;
      }

      next();
    } catch (error) {
      handleRateLimitError(error, res, keyPrefix, maxRequests, windowSeconds, req, next);
    }
  };
}

/** Pre-configured rate limiter for general API routes (100 requests / 15 min). */
export const defaultRateLimit = rateLimit();
/** Pre-configured rate limiter for AI-heavy routes (20 requests / 15 min). */
export const aiRateLimit = rateLimit({
  maxRequests: AI_MAX_REQUESTS,
  windowSeconds: DEFAULT_WINDOW_SECONDS,
  keyPrefix: "ai-rate-limit"
});
