/**
 * Express route bindings for CarbonSense API resources. Applies authentication/rate-limit middleware and maps endpoints to controllers.
 */
import { Router } from "express";
import { getLevelsCatalogController } from "../controllers/levels.controller";

const router = Router();

router.get("/", getLevelsCatalogController);

export const levelsRoutes = router;
