/**
 * Express route bindings for CarbonSense API resources. Applies authentication/rate-limit middleware and maps endpoints to controllers.
 */
import { Router } from "express";
import { z } from "zod";
import { login, logout, me, signup } from "../controllers/auth.controller";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();

const signupBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).optional(),
  name: z.string().trim().min(1).max(100)
});

const loginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

router.post("/signup", validateRequest({ body: signupBodySchema }), signup);
router.post("/login", validateRequest({ body: loginBodySchema }), login);
router.post("/logout", requireAuth, logout);
router.get("/me", requireAuth, me);

export const authRoutes = router;
