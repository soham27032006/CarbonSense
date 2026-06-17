import { Router } from "express";
import {
  chatController,
  historyController,
  suggestionsController
} from "../controllers/copilot.controller";
import { requireAuth } from "../middleware/auth";
import { aiRateLimit } from "../middleware/rateLimit";

const router = Router();

router.post("/chat", requireAuth, aiRateLimit, chatController);
router.get("/suggestions", requireAuth, suggestionsController);
router.get("/history", requireAuth, historyController);

export const copilotRoutes = router;
