import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../middleware/errorHandler";
import {
  deleteProfile,
  getCarbonAgeDetail,
  getProfile,
  updateProfile
} from "../services/profile.service";

const notificationPreferencesSchema = z
  .object({
    daily_challenge: z
      .object({
        enabled: z.boolean().optional(),
        time: z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm time format")
          .optional()
      })
      .optional(),
    streak_at_risk: z.boolean().optional(),
    weekly_summary: z.boolean().optional(),
    achievement_earned: z.boolean().optional()
  })
  .strip();

const profileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  avatar_url: z.string().url().nullable().optional(),
  notification_preferences: notificationPreferencesSchema.optional(),
  settings: z
    .object({
      units: z.enum(["metric", "imperial"]).optional(),
      country: z.string().trim().min(2).max(2).transform((value) => value.toUpperCase()).optional()
    })
    .strip()
    .optional()
});

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
  }

  return req.user.id;
}

function toProfileError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : "Profile request failed";
  return new AppError(message, 400, "PROFILE_REQUEST_FAILED");
}

export async function getProfileController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getProfile(requireUserId(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(toProfileError(error));
    return;
  }
}

export async function updateProfileController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = profileUpdateSchema.parse(req.body);
    const data = await updateProfile(requireUserId(req), input);
    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(error);
      return;
    }

    next(toProfileError(error));
    return;
  }
}

export async function getCarbonAgeController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getCarbonAgeDetail(requireUserId(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(toProfileError(error));
    return;
  }
}

export async function deleteProfileController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await deleteProfile(requireUserId(req));
    res.status(200).json(data);
  } catch (error) {
    next(toProfileError(error));
    return;
  }
}
