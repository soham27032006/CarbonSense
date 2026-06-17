import { Router } from "express";
import {
  getAllAchievementsWithUserProgressController,
  getLevelProgressController,
  getStreakInfoController,
  useStreakFreezeController
} from "../controllers/streaks.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, getStreakInfoController);
router.post("/freeze", requireAuth, useStreakFreezeController);

const achievementsRouter = Router();
achievementsRouter.get(
  "/",
  requireAuth,
  getAllAchievementsWithUserProgressController
);

const levelRouter = Router();
levelRouter.get("/", requireAuth, getLevelProgressController);

export const streakRoutes = router;
export const achievementsRoutes = achievementsRouter;
export const levelRoutes = levelRouter;
