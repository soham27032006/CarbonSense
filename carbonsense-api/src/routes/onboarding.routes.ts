/**
 * Express route bindings for CarbonSense API resources. Applies authentication/rate-limit middleware and maps endpoints to controllers.
 */
import { Router } from "express";
import { z } from "zod";
import {
  completeOnboarding,
  submitOnboardingQuiz
} from "../controllers/onboarding.controller";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();

const onboardingQuizBodySchema = z.object({
  transport_mode: z.enum(["car", "public_transit", "bike", "wfh", "mixed"]),
  meat_frequency: z.enum(["daily", "few_times_week", "rarely", "never"]),
  monthly_spending: z.enum(["under_2k", "2k_to_5k", "5k_to_10k", "over_10k"]),
  flight_frequency: z.enum(["never", "1_2_yearly", "monthly", "weekly"]),
  motivation: z.enum(["save_money", "reduce_anxiety", "family_values", "community"]),
  household_size: z.number().int().min(1).max(10),
  country: z.string().trim().length(2).regex(/^[A-Za-z]{2}$/).transform((value) => value.toUpperCase()).default("US"),
  biological_age: z.number().int().min(1).max(120).default(25)
});
const completeOnboardingBodySchema = z.object({
  selected_track: z.enum(["food_first", "commute_conscious", "surprise_me"]).optional()
});

router.post("/quiz", requireAuth, validateRequest({ body: onboardingQuizBodySchema }), submitOnboardingQuiz);
router.post("/complete", requireAuth, validateRequest({ body: completeOnboardingBodySchema }), completeOnboarding);

export const onboardingRoutes = router;
