/**
 * Express route bindings for CarbonSense API resources. Applies authentication/rate-limit middleware and maps endpoints to controllers.
 */
import { Router } from "express";
import {
  createTeamController,
  getLeaderboardController,
  getMyTeamsController,
  getTeamController,
  joinTeamController
} from "../controllers/teams.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/create", requireAuth, createTeamController);
router.post("/join/:inviteCode", requireAuth, joinTeamController);
router.get("/my-teams", requireAuth, getMyTeamsController);
router.get("/:id", requireAuth, getTeamController);
router.get("/:id/leaderboard", requireAuth, getLeaderboardController);

export const teamsRoutes = router;
