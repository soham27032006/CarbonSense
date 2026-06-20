/**
 * Authentication middleware. Extracts the Bearer token from the Authorization
 * header, validates it against Supabase Auth, and attaches the decoded user
 * onto `req.user`. Used by every protected route in the API.
 */
import type { NextFunction, Request, Response } from "express";
import { supabase } from "../config/supabase";
import { AppError } from "./errorHandler";

/**
 * Extracts the raw JWT string from the request's Authorization header.
 * @returns The token string after the "Bearer " scheme.
 * @throws {AppError} 401 AUTH_TOKEN_MISSING when no Authorization header is present.
 * @throws {AppError} 401 AUTH_TOKEN_INVALID when the scheme is not "Bearer" or the token is empty.
 */
export function extractBearerToken(req: Request): string {
  const authorizationHeader = req.header("authorization");

  if (!authorizationHeader) {
    throw new AppError("Missing authorization token", 401, "AUTH_TOKEN_MISSING");
  }

  const [scheme, token] = authorizationHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    throw new AppError("Invalid authorization header", 401, "AUTH_TOKEN_INVALID");
  }

  return token;
}

/**
 * Maps a Supabase Auth error message to a structured error code.
 * @param message - The raw error message from Supabase.
 * @returns "AUTH_TOKEN_EXPIRED" when the message mentions expiration, otherwise "AUTH_TOKEN_INVALID".
 */
function getAuthErrorCode(message: string): string {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("expired")) {
    return "AUTH_TOKEN_EXPIRED";
  }

  return "AUTH_TOKEN_INVALID";
}

/**
 * Express middleware that enforces authentication on a route.
 * Extracts and validates the Bearer token, then attaches the Supabase user
 * to `req.user`. Forwards any authentication failure to the error handler.
 * @throws Forwards {@link AppError} with 401 status on authentication failure.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearerToken(req);
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      throw new AppError(error.message, 401, getAuthErrorCode(error.message));
    }

    if (!data.user) {
      throw new AppError("Invalid authorization token", 401, "AUTH_TOKEN_INVALID");
    }

    req.user = data.user;
    next();
  } catch (error) {
    next(error);
  }
}
