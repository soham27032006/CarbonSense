/**
 * Controller layer for authenticated CarbonSense API requests. Validates request context, delegates business work to services, and returns stable response envelopes.
 */
import type { NextFunction, Request, Response } from "express";
import { LEVEL_NAMES, LEVEL_THRESHOLDS } from "../services/gamification.service";

/**
 * Handles the getLevelsCatalogController API request and returns the existing response contract.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function getLevelsCatalogController(
  _req: Request,
  res: Response,
  _next: NextFunction
): Promise<void> {
  const levels = LEVEL_THRESHOLDS.map((xp_required, index) => ({
    level: index + 1,
    name: LEVEL_NAMES[index],
    xp_required
  }));

  res.status(200).json({
    success: true,
    data: { levels }
  });
}
