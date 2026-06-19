/**
 * Express route bindings for CarbonSense API resources. Applies authentication/rate-limit middleware and maps endpoints to controllers.
 */
import { Router } from "express";
import {
  completeOnboarding,
  submitOnboardingQuiz
} from "../controllers/onboarding.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/quiz", requireAuth, submitOnboardingQuiz);
router.post("/complete", requireAuth, completeOnboarding);

export const onboardingRoutes = router;
