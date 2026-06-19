/**
 * Controller layer for authenticated CarbonSense API requests. Validates request context, delegates business work to services, and returns stable response envelopes.
 */
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../middleware/errorHandler";
import {
  getImpactEquivalencies,
  getImpactShareCard,
  getImpactTotal
} from "../services/impact.service";

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
  }

  return req.user.id;
}

function toImpactError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : "Impact request failed";
  return new AppError(message, 400, "IMPACT_REQUEST_FAILED");
}

/**
 * Handles the total API request and returns the existing response contract.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function total(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getImpactTotal(requireUserId(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(toImpactError(error));
    return;
  }
}

/**
 * Handles the equivalencies API request and returns the existing response contract.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function equivalencies(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getImpactEquivalencies(requireUserId(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(toImpactError(error));
    return;
  }
}

/**
 * Handles the shareCard API request and returns the existing response contract.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function shareCard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getImpactShareCard(requireUserId(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(toImpactError(error));
    return;
  }
}
