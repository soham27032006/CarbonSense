import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../middleware/errorHandler";
import {
  acceptChallenge,
  completeChallenge,
  getChallengeHistory,
  getChallengeLibrary,
  getTodayChallenge,
  skipChallenge
} from "../services/challenge.service";

const paramsSchema = z.object({
  id: z.string().uuid()
});

const skipSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(500)
    .optional()
    .default("No reason provided")
});

const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
  }

  return req.user.id;
}

function toChallengeError(error: unknown): AppError {
  const message =
    error instanceof Error ? error.message : "Challenge request failed";

  return new AppError(message, 400, "CHALLENGE_REQUEST_FAILED");
}

export async function today(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const challenge = await getTodayChallenge(requireUserId(req));
    res.status(200).json({ success: true, data: { challenge } });
  } catch (error) {
    next(toChallengeError(error));
    return;
  }
}

export async function accept(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = paramsSchema.parse(req.params);
    const challenge = await acceptChallenge(requireUserId(req), id);
    res.status(200).json({ success: true, data: { challenge } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(error);
      return;
    }

    next(toChallengeError(error));
    return;
  }
}

export async function complete(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = paramsSchema.parse(req.params);
    const result = await completeChallenge(requireUserId(req), id);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(error);
      return;
    }

    next(toChallengeError(error));
    return;
  }
}

export async function skip(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = paramsSchema.parse(req.params);
    const { reason } = skipSchema.parse(req.body ?? {});
    const alternative_challenge = await skipChallenge(
      requireUserId(req),
      id,
      reason
    );

    res.status(200).json({
      success: true,
      data: {
        alternative_challenge
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(error);
      return;
    }

    next(toChallengeError(error));
    return;
  }
}

export async function history(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = historyQuerySchema.parse(req.query);
    const data = await getChallengeHistory(
      requireUserId(req),
      query.page,
      query.limit
    );

    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(error);
      return;
    }

    next(toChallengeError(error));
    return;
  }
}

export async function library(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    requireUserId(req);
    const data = await getChallengeLibrary();

    res.status(200).json({ success: true, data });
  } catch (error) {
    next(toChallengeError(error));
    return;
  }
}
