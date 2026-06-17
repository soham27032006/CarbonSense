import type { NextFunction, Request, Response } from "express";
import { AppError } from "../middleware/errorHandler";
import {
  getAllAchievementsWithUserProgress,
  getProgress
} from "../services/gamification.service";
import {
  getStreakInfo,
  useStreakFreeze as useStreakFreezeService
} from "../services/streak.service";

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
  }

  return req.user.id;
}

function toStreakError(error: unknown): AppError {
  const message =
    error instanceof Error ? error.message : "Streak request failed";

  return new AppError(message, 400, "STREAK_REQUEST_FAILED");
}

export async function getStreakInfoController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getStreakInfo(requireUserId(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(toStreakError(error));
    return;
  }
}

export async function useStreakFreezeController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await useStreakFreezeService(requireUserId(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(toStreakError(error));
    return;
  }
}

export async function getAllAchievementsWithUserProgressController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getAllAchievementsWithUserProgress(requireUserId(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(toStreakError(error));
    return;
  }
}

export async function getLevelProgressController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getProgress(requireUserId(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(toStreakError(error));
    return;
  }
}
