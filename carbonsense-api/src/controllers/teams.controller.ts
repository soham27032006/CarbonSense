import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { AppError } from "../middleware/errorHandler";
import {
  createTeam,
  getLeaderboard,
  getMyTeams,
  getTeam,
  joinTeam
} from "../services/team.service";

const createTeamSchema = z.object({
  name: z.string().trim().min(2).max(100),
  type: z.enum(["neighborhood", "employer", "friends", "custom"]),
  description: z.string().trim().max(500).optional()
});

const inviteCodeParamsSchema = z.object({
  inviteCode: z.string().trim().min(8).max(16)
});

const teamIdParamsSchema = z.object({
  id: z.string().uuid()
});

const leaderboardQuerySchema = z.object({
  period: z.enum(["week", "month", "alltime"]).default("week")
});

function requireUserId(req: Request): string {
  if (!req.user) {
    throw new AppError("Authentication required", 401, "AUTH_REQUIRED");
  }

  return req.user.id;
}

function toTeamError(error: unknown): AppError {
  const message = error instanceof Error ? error.message : "Team request failed";

  return new AppError(message, 400, "TEAM_REQUEST_FAILED");
}

export async function createTeamController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const input = createTeamSchema.parse(req.body);
    const team = await createTeam(
      requireUserId(req),
      input.name,
      input.type,
      input.description
    );

    res.status(201).json({ success: true, data: { team } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(error);
      return;
    }

    next(toTeamError(error));
    return;
  }
}

export async function joinTeamController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { inviteCode } = inviteCodeParamsSchema.parse(req.params);
    const team = await joinTeam(requireUserId(req), inviteCode);

    res.status(200).json({ success: true, data: { team } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(error);
      return;
    }

    next(toTeamError(error));
    return;
  }
}

export async function getMyTeamsController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const teams = await getMyTeams(requireUserId(req));
    res.status(200).json({ success: true, data: { teams } });
  } catch (error) {
    next(toTeamError(error));
    return;
  }
}

export async function getTeamController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = teamIdParamsSchema.parse(req.params);
    const data = await getTeam(requireUserId(req), id);

    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(error);
      return;
    }

    next(toTeamError(error));
    return;
  }
}

export async function getLeaderboardController(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = teamIdParamsSchema.parse(req.params);
    const { period } = leaderboardQuerySchema.parse(req.query);
    const data = await getLeaderboard(requireUserId(req), id, period);

    res.status(200).json({ success: true, data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(error);
      return;
    }

    next(toTeamError(error));
    return;
  }
}
