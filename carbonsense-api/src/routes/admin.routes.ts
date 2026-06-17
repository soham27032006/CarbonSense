import { Router } from "express";
import { runDailyJobsController } from "../controllers/admin.controller";

const router = Router();

router.get("/run-daily-jobs", runDailyJobsController);

export const adminRoutes = router;
