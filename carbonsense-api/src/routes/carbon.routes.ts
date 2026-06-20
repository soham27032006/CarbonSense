/**
 * Express route bindings for CarbonSense API resources. Applies authentication/rate-limit middleware and maps endpoints to controllers.
 */
import { Router } from "express";
import { z } from "zod";
import {
  categoryDetail,
  compare,
  dashboard,
  transactions,
  trends
} from "../controllers/carbon.controller";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();

const carbonCategorySchema = z.enum(["food", "transport", "home", "shopping", "travel", "other"]);
const transactionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  category: carbonCategorySchema.optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional()
});
const trendsQuerySchema = z.object({
  period: z.enum(["weekly", "monthly"]).default("weekly"),
  range: z.coerce.number().int().min(1).max(36).default(12)
});
const categoryParamsSchema = z.object({ category: carbonCategorySchema });

router.get("/dashboard", requireAuth, dashboard);
router.get("/transactions", requireAuth, validateRequest({ query: transactionsQuerySchema }), transactions);
router.get("/trends", requireAuth, validateRequest({ query: trendsQuerySchema }), trends);
router.get("/category/:category", requireAuth, validateRequest({ params: categoryParamsSchema }), categoryDetail);
router.get("/compare", requireAuth, compare);

export const carbonRoutes = router;
