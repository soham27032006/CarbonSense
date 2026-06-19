/**
 * Express route bindings for CarbonSense API resources. Applies authentication/rate-limit middleware and maps endpoints to controllers.
 */
import { Router } from "express";
import { runDailyJobsController } from "../controllers/admin.controller";

const router = Router();

router.get("/run-daily-jobs", runDailyJobsController);

export const adminRoutes = router;
