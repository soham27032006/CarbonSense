import { Router } from "express";
import { getLevelsCatalogController } from "../controllers/levels.controller";

const router = Router();

router.get("/", getLevelsCatalogController);

export const levelsRoutes = router;
