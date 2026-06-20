/**
 * Express route bindings for CarbonSense API resources. Applies authentication/rate-limit middleware and maps endpoints to controllers.
 */
import { Router } from "express";
import { z } from "zod";
import {
  deleteProfileController,
  getCarbonAgeController,
  getProfileController,
  updateProfileController
} from "../controllers/profile.controller";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();

const notificationPreferencesSchema = z.object({
  daily_challenge: z.object({
    enabled: z.boolean().optional(),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:mm time format").optional()
  }).optional(),
  streak_at_risk: z.boolean().optional(),
  weekly_summary: z.boolean().optional(),
  achievement_earned: z.boolean().optional()
}).strip();
const profileUpdateBodySchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  avatar_url: z.string().url().nullable().optional(),
  notification_preferences: notificationPreferencesSchema.optional(),
  settings: z.object({
    units: z.enum(["metric", "imperial"]).optional(),
    country: z.string().trim().min(2).max(2).transform((value) => value.toUpperCase()).optional()
  }).strip().optional()
});

router.get("/", requireAuth, getProfileController);
router.patch("/", requireAuth, validateRequest({ body: profileUpdateBodySchema }), updateProfileController);
router.get("/carbon-age", requireAuth, getCarbonAgeController);
router.delete("/", requireAuth, deleteProfileController);

export const profileRoutes = router;
