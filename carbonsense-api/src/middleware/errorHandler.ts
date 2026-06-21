/**
 * Central error-handling middleware. Converts all thrown errors into a
 * consistent JSON response envelope. Distinguishes Zod validation errors
 * (400), operational AppErrors (their own statusCode), and unexpected errors (500).
 * Never leaks stack traces in production.
 */
import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { env } from "../config/env";

type ErrorResponse = {
  success: false;
  error: {
    code: string;
    message: string;
  };
};

type ErrorEnvelope = {
  statusCode: number;
  response: ErrorResponse;
};

/**
 * Typed operational error. Controllers and services throw this to signal
 * expected failure modes with a specific HTTP status code and machine-readable
 * error code. Always has `isOperational: true` so the error handler can
 * decide whether to log at warn vs error level.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  public constructor(
    message: string,
    statusCode = 500,
    code = "INTERNAL_SERVER_ERROR",
    isOperational = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
  }
}

/**
 * Builds the standard JSON error response envelope for any status/code/message.
 * @returns Status and response payload consumed by the Express error handler.
 */
function buildErrorEnvelope(statusCode: number, code: string, message: string): ErrorEnvelope {
  return {
    statusCode,
    response: {
      success: false,
      error: { code, message }
    }
  };
}

/**
 * Logs validation, operational, and unexpected errors without leaking stacks in production.
 */
function logError(error: unknown, code: string, timestamp: string): void {
  if (error instanceof ZodError) {
    console.error(`[${timestamp}] Validation error`, error.flatten());
    return;
  }

  console.error(`[${timestamp}] ${code}`, {
    message: error instanceof Error ? error.message : String(error),
    stack: env.NODE_ENV === "production" ? undefined : error instanceof Error ? error.stack : undefined,
    isOperational: error instanceof AppError ? error.isOperational : false
  });
}

/**
 * Resolves any thrown value into the public error response contract.
 * @returns Status and response payload matching the existing API shape.
 */
function getErrorEnvelope(error: unknown): ErrorEnvelope {
  if (error instanceof ZodError) {
    return buildErrorEnvelope(400, "VALIDATION_ERROR", "Invalid request payload");
  }

  return buildErrorEnvelope(
    error instanceof AppError ? error.statusCode : 500,
    error instanceof AppError ? error.code : "INTERNAL_SERVER_ERROR",
    error instanceof AppError ? error.message : "An unexpected error occurred"
  );
}

/**
 * Express error-handling middleware. Transforms every error into the standard
 * `{ success: false, error: { code, message } }` JSON envelope. Zod errors
 * become 400 VALIDATION_ERROR; AppErrors use their own statusCode/code;
 * all other errors become 500 INTERNAL_SERVER_ERROR.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const timestamp = new Date().toISOString();
  const { statusCode, response } = getErrorEnvelope(error);

  logError(error, response.error.code, timestamp);

  res.status(statusCode).json(response);
};
