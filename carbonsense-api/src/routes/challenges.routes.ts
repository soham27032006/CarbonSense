/**
 * Express route bindings for CarbonSense API resources. Applies authentication/rate-limit middleware and maps endpoints to controllers.
 */
import { Router } from "express";
import { z } from "zod";
import {
  accept,
  complete,
  history,
  library,
  skip,
  today
} from "../controllers/challenges.controller";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();

const idParamsSchema = z.object({ id: z.string().uuid() });
const todayQuerySchema = z.object({ alt: z.coerce.number().int().min(0).max(20).default(0) });
const skipBodySchema = z.object({ reason: z.string().trim().max(500).optional().default("No reason provided") });
const historyQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});

router.get("/today", requireAuth, validateRequest({ query: todayQuerySchema }), today);
router.post("/:id/accept", requireAuth, validateRequest({ params: idParamsSchema }), accept);
router.post("/:id/complete", requireAuth, validateRequest({ params: idParamsSchema }), complete);
router.post("/:id/skip", requireAuth, validateRequest({ params: idParamsSchema, body: skipBodySchema }), skip);
router.get("/history", requireAuth, validateRequest({ query: historyQuerySchema }), history);
router.get("/library", requireAuth, library);

export const challengesRoutes = router;
