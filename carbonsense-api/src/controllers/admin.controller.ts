/**
 * Controller layer for authenticated CarbonSense API requests. Validates request context, delegates business work to services, and returns stable response envelopes.
 */
import type { Request, Response } from "express";
import { env } from "../config/env";
import { AppError } from "../middleware/errorHandler";
import { runDailyJobs } from "../jobs/daily";

/**
 * Handles the runDailyJobsController API request and returns the existing response contract.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
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
