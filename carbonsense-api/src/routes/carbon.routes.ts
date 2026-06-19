/**
 * Express route bindings for CarbonSense API resources. Applies authentication/rate-limit middleware and maps endpoints to controllers.
 */
import { Router } from "express";
import {
  categoryDetail,
  compare,
  dashboard,
  transactions,
  trends
} from "../controllers/carbon.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/dashboard", requireAuth, dashboard);
router.get("/transactions", requireAuth, transactions);
router.get("/trends", requireAuth, trends);
router.get("/category/:category", requireAuth, categoryDetail);
router.get("/compare", requireAuth, compare);

export const carbonRoutes = router;
