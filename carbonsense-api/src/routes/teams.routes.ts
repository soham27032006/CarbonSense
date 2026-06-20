/**
 * Express route bindings for CarbonSense API resources. Applies authentication/rate-limit middleware and maps endpoints to controllers.
 */
import { Router } from "express";
import { z } from "zod";
import {
  createTeamController,
  getLeaderboardController,
  getMyTeamsController,
  getTeamController,
  joinTeamController
} from "../controllers/teams.controller";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();

const createTeamBodySchema = z.object({
  name: z.string().trim().min(2).max(100),
  type: z.enum(["neighborhood", "employer", "friends", "custom"]),
  description: z.string().trim().max(500).optional()
});
const inviteCodeParamsSchema = z.object({ inviteCode: z.string().trim().min(8).max(16) });
const teamIdParamsSchema = z.object({ id: z.string().uuid() });
const leaderboardQuerySchema = z.object({ period: z.enum(["week", "month", "alltime"]).default("week") });

router.post("/create", requireAuth, validateRequest({ body: createTeamBodySchema }), createTeamController);
router.post("/join/:inviteCode", requireAuth, validateRequest({ params: inviteCodeParamsSchema }), joinTeamController);
router.get("/my-teams", requireAuth, getMyTeamsController);
router.get("/:id", requireAuth, validateRequest({ params: teamIdParamsSchema }), getTeamController);
router.get("/:id/leaderboard", requireAuth, validateRequest({ params: teamIdParamsSchema, query: leaderboardQuerySchema }), getLeaderboardController);

export const teamsRoutes = router;
