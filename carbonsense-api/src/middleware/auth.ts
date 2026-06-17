import type { NextFunction, Request, Response } from "express";
import { supabase } from "../config/supabase";
import { AppError } from "./errorHandler";

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

function getAuthErrorCode(message: string): string {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes("expired")) {
    return "AUTH_TOKEN_EXPIRED";
  }

  return "AUTH_TOKEN_INVALID";
}

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
