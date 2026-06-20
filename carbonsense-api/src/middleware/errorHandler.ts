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
 * Express error-handling middleware. Transforms every error into the standard
 * `{ success: false, error: { code, message } }` JSON envelope. Zod errors
 * become 400 VALIDATION_ERROR; AppErrors use their own statusCode/code;
 * all other errors become 500 INTERNAL_SERVER_ERROR.
 */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const timestamp = new Date().toISOString();

  if (error instanceof ZodError) {
    console.error(`[${timestamp}] Validation error`, error.flatten());

    const response: ErrorResponse = {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request payload"
      }
    };

    res.status(400).json(response);
    return;
  }

  const statusCode = error instanceof AppError ? error.statusCode : 500;
  const code = error instanceof AppError ? error.code : "INTERNAL_SERVER_ERROR";
  const message =
    error instanceof AppError ? error.message : "An unexpected error occurred";

  console.error(`[${timestamp}] ${code}`, {
    message: error instanceof Error ? error.message : String(error),
    stack: env.NODE_ENV === "production" ? undefined : error instanceof Error ? error.stack : undefined,
    isOperational: error instanceof AppError ? error.isOperational : false
  });

  const response: ErrorResponse = {
    success: false,
    error: {
      code,
      message
    }
  };

  res.status(statusCode).json(response);
};
