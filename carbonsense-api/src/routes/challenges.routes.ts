import { Router } from "express";
import {
  accept,
  complete,
  history,
  library,
  skip,
  today
} from "../controllers/challenges.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/today", requireAuth, today);
router.post("/:id/accept", requireAuth, accept);
router.post("/:id/complete", requireAuth, complete);
router.post("/:id/skip", requireAuth, skip);
router.get("/history", requireAuth, history);
router.get("/library", requireAuth, library);

export const challengesRoutes = router;
