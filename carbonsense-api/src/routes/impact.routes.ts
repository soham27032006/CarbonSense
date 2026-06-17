import { Router } from "express";
import {
  equivalencies,
  shareCard,
  total
} from "../controllers/impact.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/total", requireAuth, total);
router.get("/equivalencies", requireAuth, equivalencies);
router.get("/share-card", requireAuth, shareCard);

export const impactRoutes = router;
