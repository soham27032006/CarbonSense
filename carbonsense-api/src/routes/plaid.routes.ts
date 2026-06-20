/**
 * Express route bindings for CarbonSense API resources. Applies authentication/rate-limit middleware and maps endpoints to controllers.
 */
import { Router } from "express";
import { z } from "zod";
import {
  createPlaidLinkToken,
  disconnectPlaidBank,
  exchangePlaidToken,
  plaidWebhook,
  syncPlaidTransactions
} from "../controllers/plaid.controller";
import { requireAuth } from "../middleware/auth";
import { validateRequest } from "../middleware/validateRequest";

const router = Router();

const exchangeTokenBodySchema = z.object({
  public_token: z.string().min(1),
  institution: z.object({ id: z.string().min(1), name: z.string().min(1) })
});
const syncTransactionsBodySchema = z.object({ connection_id: z.string().uuid() });
const disconnectParamsSchema = z.object({ connectionId: z.string().uuid() });
const webhookBodySchema = z.object({
  webhook_type: z.string().optional(),
  webhook_code: z.string().optional(),
  item_id: z.string().optional()
}).passthrough();

router.post("/create-link-token", requireAuth, createPlaidLinkToken);
router.post("/exchange-token", requireAuth, validateRequest({ body: exchangeTokenBodySchema }), exchangePlaidToken);
router.post("/sync-transactions", requireAuth, validateRequest({ body: syncTransactionsBodySchema }), syncPlaidTransactions);
router.delete("/disconnect/:connectionId", requireAuth, validateRequest({ params: disconnectParamsSchema }), disconnectPlaidBank);
router.post("/webhook", validateRequest({ body: webhookBodySchema }), plaidWebhook);

export const plaidRoutes = router;
