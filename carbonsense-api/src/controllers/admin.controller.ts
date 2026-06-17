import type { Request, Response } from "express";
import { env } from "../config/env";
import { AppError } from "../middleware/errorHandler";
import { runDailyJobs } from "../jobs/daily";

export async function runDailyJobsController(
  req: Request,
  res: Response
): Promise<void> {
  const providedSecret = req.header("x-admin-secret");

  if (!providedSecret || providedSecret !== env.ADMIN_JOB_SECRET) {
    throw new AppError("Admin job secret is invalid", 401, "ADMIN_UNAUTHORIZED");
  }

  const result = await runDailyJobs();

  res.status(200).json({
    success: true,
    data: {
      ...result,
      timestamp: new Date().toISOString()
    }
  });
}
