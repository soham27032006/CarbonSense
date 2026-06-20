/**
 * Named external-call timeout constants. Centralized so every upstream client agrees
 * on how long to wait before giving up on a stalled dependency.
 */

export const AI_REQUEST_TIMEOUT_MS = 30_000;
export const PLAID_REQUEST_TIMEOUT_MS = 20_000;
export const SUPABASE_REQUEST_TIMEOUT_MS = 15_000;
