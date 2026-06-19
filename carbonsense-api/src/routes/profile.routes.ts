/**
 * Express route bindings for CarbonSense API resources. Applies authentication/rate-limit middleware and maps endpoints to controllers.
 */
import { Router } from "express";
import {
  deleteProfileController,
  getCarbonAgeController,
  getProfileController,
  updateProfileController
} from "../controllers/profile.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, getProfileController);
router.patch("/", requireAuth, updateProfileController);
router.get("/carbon-age", requireAuth, getCarbonAgeController);
router.delete("/", requireAuth, deleteProfileController);

export const profileRoutes = router;
