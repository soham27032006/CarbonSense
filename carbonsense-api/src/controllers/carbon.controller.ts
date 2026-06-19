/**
 * Controller layer for authenticated CarbonSense API requests. Validates request context, delegates business work to services, and returns stable response envelopes.
 */
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../middleware/errorHandler";
import {
  getCategoryDetail,
  getComparison,
  getDashboard,
  getTransactions,
  getTrends
} from "../services/carbon.service";

const carbonCategorySchema = z.enum([
  "food",
  "transport",
  "home",
  "shopping",
  "travel",
  "other"
]);

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

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
  }

  return req.user.id;
}

function toCarbonError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : "Carbon request failed";
  return new AppError(message, 400, "CARBON_REQUEST_FAILED");
}

/**
 * Handles the dashboard API request and returns the existing response contract.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function dashboard(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getDashboard(requireUserId(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(error);
      return;
    }

    next(toCarbonError(error));
    return;
  }
}

/**
 * Handles the transactions API request and returns the existing response contract.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function transactions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const filters = transactionsQuerySchema.parse(req.query);
    const data = await getTransactions(requireUserId(req), filters);
    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(error);
      return;
    }

    next(toCarbonError(error));
    return;
  }
}

/**
 * Handles the trends API request and returns the existing response contract.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function trends(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = trendsQuerySchema.parse(req.query);
    const data = await getTrends(requireUserId(req), query.period, query.range);
    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(error);
      return;
    }

    next(toCarbonError(error));
    return;
  }
}

/**
 * Handles the categoryDetail API request and returns the existing response contract.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function categoryDetail(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { category } = z
      .object({ category: carbonCategorySchema })
      .parse(req.params);
    const data = await getCategoryDetail(requireUserId(req), category);
    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(error);
      return;
    }

    next(toCarbonError(error));
    return;
  }
}

/**
 * Handles the compare API request and returns the existing response contract.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function compare(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const data = await getComparison(requireUserId(req));
    res.status(200).json({ success: true, data });
  } catch (error) {
    next(toCarbonError(error));
    return;
  }
}
