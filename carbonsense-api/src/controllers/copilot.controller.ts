import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../middleware/errorHandler";
import {
  chat,
  getHistory,
  getSuggestions
} from "../services/copilot.service";

const chatSchema = z.object({
  message: z.string().trim().min(1).max(2000)
});

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
  }

  return req.user.id;
}

function toCopilotError(error: unknown): AppError {
  const message =
    error instanceof Error ? error.message : "Copilot request failed";

  return new AppError(message, 400, "COPILOT_REQUEST_FAILED");
}

export async function chatController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { message } = chatSchema.parse(req.body);
    const data = await chat(requireUserId(req), message);
    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(error);
      return;
    }

    next(toCopilotError(error));
    return;
  }
}

export async function suggestionsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const suggestions = await getSuggestions(requireUserId(req));
    res.status(200).json({ success: true, data: { suggestions } });
  } catch (error) {
    next(toCopilotError(error));
    return;
  }
}

export async function historyController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const history = await getHistory(requireUserId(req));
    res.status(200).json({ success: true, data: { history } });
  } catch (error) {
    next(toCopilotError(error));
    return;
  }
}
