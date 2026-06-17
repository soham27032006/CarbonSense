import { Router } from "express";
import {
  createPlaidLinkToken,
  disconnectPlaidBank,
  exchangePlaidToken,
  plaidWebhook,
  syncPlaidTransactions
} from "../controllers/plaid.controller";
import { requireAuth } from "../middleware/auth";

const router = Router();

router.post("/create-link-token", requireAuth, createPlaidLinkToken);
router.post("/exchange-token", requireAuth, exchangePlaidToken);
router.post("/sync-transactions", requireAuth, syncPlaidTransactions);
router.delete("/disconnect/:connectionId", requireAuth, disconnectPlaidBank);
router.post("/webhook", plaidWebhook);

export const plaidRoutes = router;
