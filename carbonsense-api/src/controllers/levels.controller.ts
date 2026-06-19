import type { NextFunction, Request, Response } from "express";
import { LEVEL_NAMES, LEVEL_THRESHOLDS } from "../services/gamification.service";

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
