/**
 * Controller layer for authenticated CarbonSense API requests. Validates request context, delegates business work to services, and returns stable response envelopes.
 */
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../middleware/errorHandler";
import {
  createLinkToken,
  disconnectBank,
  exchangePublicToken,
  handlePlaidWebhook,
  syncTransactions
} from "../services/plaid.service";

const exchangeTokenSchema = z.object({
  public_token: z.string().min(1),
  institution: z.object({
    id: z.string().min(1),
    name: z.string().min(1)
  })
});

const syncTransactionsSchema = z.object({
  connection_id: z.string().uuid()
});

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
  }

  return req.user.id;
}

function toBankError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : "Banking request failed";

  console.error("Plaid integration error", { message });

  return new AppError(
    "We could not complete the bank connection request. Please try again.",
    502,
    "BANK_INTEGRATION_FAILED"
  );
}

/**
 * Handles the createPlaidLinkToken API request and returns the existing response contract.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function createPlaidLinkToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const linkToken = await createLinkToken(requireUserId(req));

    res.status(200).json({
      success: true,
      data: {
        link_token: linkToken
      }
    });
  } catch (error) {
    next(toBankError(error));
    return;
  }
}

/**
 * Handles the exchangePlaidToken API request and returns the existing response contract.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function exchangePlaidToken(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = requireUserId(req);
    const input = exchangeTokenSchema.parse(req.body);
    const connection = await exchangePublicToken(
      userId,
      input.public_token,
      input.institution.id,
      input.institution.name
    );

    res.status(201).json({
      success: true,
      data: {
        connection
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(error);
      return;
    }

    next(toBankError(error));
    return;
  }
}

/**
 * Handles the syncPlaidTransactions API request and returns the existing response contract.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function syncPlaidTransactions(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = requireUserId(req);
    const input = syncTransactionsSchema.parse(req.body);
    const result = await syncTransactions(userId, input.connection_id);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(error);
      return;
    }

    next(toBankError(error));
    return;
  }
}

/**
 * Handles the disconnectPlaidBank API request and returns the existing response contract.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function disconnectPlaidBank(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = requireUserId(req);
    const { connectionId } = z
      .object({ connectionId: z.string().uuid() })
      .parse(req.params);
    const connection = await disconnectBank(userId, connectionId);

    res.status(200).json({
      success: true,
      data: {
        connection
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(error);
      return;
    }

    next(toBankError(error));
    return;
  }
}

/**
 * Handles the plaidWebhook API request and returns the existing response contract.
 * @returns Sends a JSON response through Express.
 * @throws Forwards validation, authentication, and service failures to Express error middleware.
 */
export async function plaidWebhook(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const result = await handlePlaidWebhook(req.body);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(toBankError(error));
    return;
  }
}
