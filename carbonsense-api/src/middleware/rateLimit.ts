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

function getClientIdentifier(req: Request): string {
  return req.user?.id ?? req.ip ?? req.socket.remoteAddress ?? "unknown";
}

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

export function rateLimit(options: RateLimitOptions = {}) {
  const maxRequests = options.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const windowSeconds = options.windowSeconds ?? DEFAULT_WINDOW_SECONDS;
  const keyPrefix = options.keyPrefix ?? "rate-limit";

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const identifier = getClientIdentifier(req);
      const key = `${keyPrefix}:${identifier}`;
      let requestCount: number;
      let retryAfter: number;

      if (redisEnabled && redis) {
        requestCount = await redis.incr(key);

        if (requestCount === 1) {
          await redis.expire(key, windowSeconds);
        }

        const ttl = await redis.ttl(key);
        retryAfter = ttl > 0 ? ttl : windowSeconds;
      } else {
        const memoryResult = consumeInMemoryRateLimit(key, windowSeconds);
        requestCount = memoryResult.requestCount;
        retryAfter = memoryResult.retryAfter;
      }

      res.setHeader("X-RateLimit-Limit", maxRequests.toString());
      res.setHeader("X-RateLimit-Remaining", Math.max(maxRequests - requestCount, 0).toString());
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
        return;
      }

      next();
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        const identifier = getClientIdentifier(req);
        const key = `${keyPrefix}:${identifier}`;
        const memoryResult = consumeInMemoryRateLimit(key, windowSeconds);

        res.setHeader("X-RateLimit-Limit", maxRequests.toString());
        res.setHeader(
          "X-RateLimit-Remaining",
          Math.max(maxRequests - memoryResult.requestCount, 0).toString()
        );
        res.setHeader("X-RateLimit-Reset", memoryResult.retryAfter.toString());

        if (memoryResult.requestCount > maxRequests) {
          res.setHeader("Retry-After", memoryResult.retryAfter.toString());
          res.status(429).json({
            success: false,
            error: {
              code: "RATE_LIMIT_EXCEEDED",
              message: "Too many requests"
            }
          });
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
  };
}

export const defaultRateLimit = rateLimit();
export const aiRateLimit = rateLimit({
  maxRequests: AI_MAX_REQUESTS,
  windowSeconds: DEFAULT_WINDOW_SECONDS,
  keyPrefix: "ai-rate-limit"
});
