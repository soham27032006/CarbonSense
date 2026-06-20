/**
 * Express route bindings for CarbonSense API resources. Applies authentication/rate-limit middleware and maps endpoints to controllers.
 */
import { Router } from "express";
import { z } from "zod";
import {
  chatController,
  historyController,
  suggestionsController
} from "../controllers/copilot.controller";
import { requireAuth } from "../middleware/auth";
import { aiRateLimit } from "../middleware/rateLimit";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();

const chatBodySchema = z.object({
  message: z.string().trim().min(1, "Message is required").max(2000, "Message must be 2000 characters or less")
});

router.post("/chat", requireAuth, aiRateLimit, validateRequest({ body: chatBodySchema }), chatController);
router.get("/suggestions", requireAuth, suggestionsController);
router.get("/history", requireAuth, historyController);

export const copilotRoutes = router;
