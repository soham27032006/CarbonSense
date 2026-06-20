/**
 * Service layer for CarbonSense domain logic. Keeps persistence, third-party API calls, and calculations behind controller-safe functions.
 */
import crypto from "crypto";
import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
  type Transaction as PlaidTransaction
} from "plaid";
import { env } from "../config/env";
import { supabaseAdmin } from "../config/supabase";
import { PLAID_REQUEST_TIMEOUT_MS } from "../config/timeouts";
import { classifyTransactionsBatch, refreshCarbonSummaries } from "./carbon.service";
import type { BankConnection } from "../types";

type BankConnectionRecord = BankConnection;

type PublicConnection = Omit<BankConnectionRecord, "plaid_access_token">;

type SyncResult = {
  new_transactions: number;
  total_carbon_kg: number;
};

type PlaidWebhookPayload = {
  webhook_type?: string;
  webhook_code?: string;
  item_id?: string;
};

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
let plaidClient: PlaidApi | null = null;

try {
  plaidClient = new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[env.PLAID_ENV],
      baseOptions: {
        timeout: PLAID_REQUEST_TIMEOUT_MS,
        headers: {
          "PLAID-CLIENT-ID": env.PLAID_CLIENT_ID,
          "PLAID-SECRET": env.PLAID_SECRET
        }
      }
    })
  );
} catch (error) {
  console.warn("Plaid not configured - bank features disabled", {
    message: error instanceof Error ? error.message : "Unknown Plaid setup error"
  });
}

function getPlaidClient(): PlaidApi {
  if (!plaidClient) {
    throw new Error("Bank connection is temporarily unavailable");
  }

  return plaidClient;
}

function encryptionKey(): Buffer {
  return crypto.createHash("sha256").update(env.JWT_SECRET).digest();
}

function encryptAccessToken(accessToken: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(accessToken, "utf8"),
    cipher.final()
  ]);
  const authTag = cipher.getAuthTag();

  return [
    iv.toString("base64url"),
    authTag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(".");
}

function decryptAccessToken(encryptedToken: string): string {
  const [iv, authTag, encrypted] = encryptedToken.split(".");

  if (!iv || !authTag || !encrypted) {
    throw new Error("Stored Plaid token is malformed");
  }

  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    encryptionKey(),
    Buffer.from(iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(authTag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

function sanitizeConnection(
  connection: BankConnectionRecord
): PublicConnection {
  const { plaid_access_token: _accessToken, ...safeConnection } = connection;
  return safeConnection;
}

function mapPlaidCategory(transaction: PlaidTransaction): string {
  const personalFinanceCategory = transaction.personal_finance_category?.primary;

  if (personalFinanceCategory) {
    return personalFinanceCategory
      .toLowerCase()
      .split("_")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  }

  return transaction.category?.join(" > ") ?? "Other";
}

function getMerchantName(transaction: PlaidTransaction): string {
  return (
    transaction.merchant_name ??
    transaction.name ??
    transaction.original_description ??
    "Unknown merchant"
  );
}

async function getOwnedConnection(
  userId: string,
  connectionId: string
): Promise<BankConnectionRecord> {
  const { data, error } = await supabaseAdmin
    .from("bank_connections")
    .select("*")
    .eq("id", connectionId)
    .eq("user_id", userId)
    .single<BankConnectionRecord>();

  if (error || !data) {
    throw new Error("Bank connection not found");
  }

  return data;
}

/**
 * Runs the createLinkToken service workflow for CarbonSense domain data.
 * @param userId - Input consumed by this workflow.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function createLinkToken(userId: string): Promise<string> {
  const response = await getPlaidClient().linkTokenCreate({
    user: {
      client_user_id: userId
    },
    client_name: "CarbonSense",
    products: [Products.Transactions],
    country_codes: [CountryCode.Us],
    language: "en",
    redirect_uri: env.PLAID_REDIRECT_URI || undefined
  });

  return response.data.link_token;
}

/**
 * Runs the exchangePublicToken service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function exchangePublicToken(
  userId: string,
  publicToken: string,
  institutionId: string,
  institutionName: string
): Promise<PublicConnection & { initial_sync: SyncResult }> {
  return await exchangePublicTokenWorkflow(userId, publicToken, institutionId, institutionName);
}

/**
 * Executes the extracted exchangePublicToken service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `exchangePublicToken`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function exchangePublicTokenWorkflow(
  userId: string,
  publicToken: string,
  institutionId: string,
  institutionName: string
): Promise<PublicConnection & { initial_sync: SyncResult }> {
  const token = await exchangePlaidPublicToken(publicToken);
  const connection = await saveBankConnection(userId, institutionName, token);
  const initialSync = await syncTransactions(userId, connection.id);

  return buildPublicConnectionWithSync(userId, institutionName, token.itemId, connection, initialSync);
}

/**
 * Exchanges a Plaid public token for an access token and item id.
 * @returns Plaid token values needed to persist the connection.
 * @throws When Plaid token exchange fails.
 */
async function exchangePlaidPublicToken(publicToken: string): Promise<{ accessToken: string; itemId: string }> {
  const exchangeResponse = await getPlaidClient().itemPublicTokenExchange({ public_token: publicToken });
  const { access_token: accessToken, item_id: itemId } = exchangeResponse.data;

  return { accessToken, itemId };
}

/**
 * Persists an encrypted bank connection record.
 * @returns The saved bank connection row.
 * @throws When the connection cannot be saved.
 */
async function saveBankConnection(
  userId: string,
  institutionName: string,
  token: Awaited<ReturnType<typeof exchangePlaidPublicToken>>
): Promise<BankConnectionRecord> {
  const { data: connection, error } = await supabaseAdmin
    .from("bank_connections")
    .insert({
      user_id: userId, plaid_access_token: encryptAccessToken(token.accessToken),
      plaid_item_id: token.itemId, institution_name: institutionName,
      institution_logo: null, status: "active"
    })
    .select("*")
    .single<BankConnectionRecord>();

  if (error || !connection) {
    throw new Error("Unable to save bank connection");
  }

  return connection;
}

/**
 * Shapes a saved connection and initial sync result into the public response.
 * @returns Public bank connection with initial sync metadata.
 */
function buildPublicConnectionWithSync(
  userId: string,
  institutionName: string,
  itemId: string,
  connection: BankConnectionRecord,
  initialSync: SyncResult
): PublicConnection & { initial_sync: SyncResult } {
  return {
    ...sanitizeConnection(connection), initial_sync: initialSync, plaid_item_id: itemId,
    institution_name: institutionName, id: connection.id, user_id: userId,
    institution_logo: connection.institution_logo, status: connection.status,
    last_synced: connection.last_synced, created_at: connection.created_at,
    plaid_cursor: connection.plaid_cursor
  };
}

/**
 * Runs the syncTransactions service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function syncTransactions(
  userId: string,
  connectionId: string
): Promise<SyncResult> {
  return await syncTransactionsWorkflow(userId, connectionId);
}

/**
 * Executes the extracted syncTransactions service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `syncTransactions`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function syncTransactionsWorkflow(
  userId: string,
  connectionId: string
): Promise<SyncResult> {
  const connection = await getOwnedConnection(userId, connectionId);
  assertConnectedBank(connection);

  const state = createSyncState(connection);
  await syncPlaidTransactionPages(userId, connectionId, state);
  await updateBankConnectionSyncState(userId, connectionId, state.cursor);
  await refreshAffectedCarbonSummaries(userId, state.affectedDates);

  return buildSyncResult(state);
}

/**
 * Validates that a bank connection can be synced.
 * @returns Nothing when the connection is active.
 * @throws When the bank connection is disconnected.
 */
function assertConnectedBank(connection: BankConnectionRecord): void {
  if (connection.status === "disconnected") {
    throw new Error("Bank connection is disconnected");
  }
}

/**
 * Creates mutable sync state matching the original workflow variables.
 * @returns State used while paging through Plaid sync results.
 */
function createSyncState(connection: BankConnectionRecord) {
  return {
    accessToken: decryptAccessToken(connection.plaid_access_token),
    cursor: connection.plaid_cursor ?? undefined,
    hasMore: true,
    newTransactions: 0,
    totalCarbonKg: 0,
    affectedDates: new Set<string>()
  };
}

/**
 * Pages through Plaid transaction sync responses in the original order.
 * @returns Resolves after every page has been processed.
 */
async function syncPlaidTransactionPages(
  userId: string,
  connectionId: string,
  state: ReturnType<typeof createSyncState>
): Promise<void> {
  while (state.hasMore) {
    const syncData = (await getPlaidClient().transactionsSync({
      access_token: state.accessToken, cursor: state.cursor, count: 500
    })).data;

    await markRemovedTransactions(userId, syncData.removed);
    await upsertChangedTransactions(userId, connectionId, syncData, state);
    state.cursor = syncData.next_cursor;
    state.hasMore = syncData.has_more;
  }
}

/**
 * Marks Plaid-removed transactions as removed locally.
 * @returns Resolves after removed transactions are updated.
 */
async function markRemovedTransactions(userId: string, removed: Array<{ transaction_id: string }>): Promise<void> {
  if (removed.length === 0) {
    return;
  }

  const removedIds = removed.map((entry) => entry.transaction_id);
  const { error } = await supabaseAdmin
    .from("transactions")
    .update({ is_removed: true })
    .eq("user_id", userId)
    .in("plaid_transaction_id", removedIds);

  if (error) {
    throw new Error("Unable to mark removed transactions");
  }
}

/**
 * Upserts added and modified Plaid transactions, batching AI classification
 * into a single Gemini call for any transactions that miss the local cache.
 * @returns Resolves after every non-pending changed transaction is processed.
 */
async function upsertChangedTransactions(
  userId: string,
  connectionId: string,
  syncData: Awaited<ReturnType<PlaidApi["transactionsSync"]>>["data"],
  state: ReturnType<typeof createSyncState>
): Promise<void> {
  const changedTransactions = [...syncData.added, ...syncData.modified].filter(
    (transaction) => !transaction.pending
  );

  if (changedTransactions.length === 0) {
    return;
  }

  const merchantNames = changedTransactions.map(getMerchantName);
  const plaidCategories = changedTransactions.map(mapPlaidCategory);
  const classifications = await classifyTransactionsBatch(
    changedTransactions.map((transaction, index) => ({
      merchantName: merchantNames[index],
      plaidCategory: plaidCategories[index],
      amount: transaction.amount
    }))
  );

  await Promise.all(
    changedTransactions.map((transaction, index) =>
      saveSyncedTransaction(
        userId,
        connectionId,
        transaction,
        merchantNames[index],
        plaidCategories[index],
        classifications[index]
      )
    )
  );

  changedTransactions.forEach((transaction, index) => {
    updateSyncCounters(transaction, syncData, classifications[index].carbon_kg, state);
  });
}

/**
 * Saves one classified Plaid transaction locally.
 * @returns Resolves after upsert succeeds.
 * @throws When the transaction cannot be saved.
 */
async function saveSyncedTransaction(
  userId: string,
  connectionId: string,
  transaction: PlaidTransaction,
  merchantName: string,
  plaidCategory: string,
  classification: Awaited<ReturnType<typeof classifyTransactionsBatch>>[number]
): Promise<void> {
  const { error } = await supabaseAdmin.from("transactions").upsert(
    {
      user_id: userId, bank_connection_id: connectionId,
      plaid_transaction_id: transaction.transaction_id, merchant_name: merchantName,
      merchant_category: plaidCategory, amount: transaction.amount,
      currency: transaction.iso_currency_code ?? "USD", carbon_kg: classification.carbon_kg,
      carbon_category: classification.carbon_category, carbon_confidence: classification.confidence,
      carbon_source: classification.source, transaction_date: transaction.date, is_removed: false
    },
    { onConflict: "plaid_transaction_id" }
  );

  if (error) {
    throw new Error("Unable to save synced transaction");
  }
}

/**
 * Updates sync counters and affected date set for one saved transaction.
 * @returns Nothing; mutates sync state.
 */
function updateSyncCounters(
  transaction: PlaidTransaction,
  syncData: Awaited<ReturnType<PlaidApi["transactionsSync"]>>["data"],
  carbonKg: number,
  state: ReturnType<typeof createSyncState>
): void {
  if (syncData.added.some((added) => added.transaction_id === transaction.transaction_id)) {
    state.newTransactions += 1;
    state.totalCarbonKg += carbonKg;
  }

  state.affectedDates.add(transaction.date);
}

/**
 * Persists the final Plaid cursor and sync metadata on the connection.
 * @returns Resolves after the connection update completes.
 */
async function updateBankConnectionSyncState(
  userId: string,
  connectionId: string,
  cursor: string | undefined
): Promise<void> {
  await supabaseAdmin
    .from("bank_connections")
    .update({ plaid_cursor: cursor, last_synced: new Date().toISOString(), status: "active" })
    .eq("id", connectionId)
    .eq("user_id", userId);
}

/**
 * Refreshes carbon summaries for all affected transaction dates.
 * @returns Resolves after all affected summaries are refreshed.
 */
async function refreshAffectedCarbonSummaries(userId: string, affectedDates: Set<string>): Promise<void> {
  await Promise.all([...affectedDates].map((date) => refreshCarbonSummaries(userId, date)));
}

/**
 * Shapes final sync counters into the public sync result.
 * @returns New transaction count and rounded carbon total.
 */
function buildSyncResult(state: ReturnType<typeof createSyncState>): SyncResult {
  return {
    new_transactions: state.newTransactions,
    total_carbon_kg: Math.round(state.totalCarbonKg * 100) / 100
  };
}

/**
 * Runs the disconnectBank service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function disconnectBank(
  userId: string,
  connectionId: string
): Promise<PublicConnection> {
  return await disconnectBankWorkflow(userId, connectionId);
}

/**
 * Executes the extracted disconnectBank service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `disconnectBank`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function disconnectBankWorkflow(
  userId: string,
  connectionId: string
): Promise<PublicConnection> {
  const connection = await getOwnedConnection(userId, connectionId);
  await removePlaidItem(connection);

  const disconnected = await markBankConnectionDisconnected(userId, connectionId);
  await markConnectionTransactionsRemoved(userId, connectionId);

  return sanitizeConnection(disconnected);
}

/**
 * Removes the Plaid item for a bank connection.
 * @returns Resolves after Plaid confirms item removal.
 */
async function removePlaidItem(connection: BankConnectionRecord): Promise<void> {
  await getPlaidClient().itemRemove({
    access_token: decryptAccessToken(connection.plaid_access_token)
  });
}

/**
 * Marks a bank connection disconnected locally.
 * @returns The updated bank connection record.
 * @throws When the connection cannot be updated.
 */
async function markBankConnectionDisconnected(userId: string, connectionId: string): Promise<BankConnectionRecord> {
  const { data, error } = await supabaseAdmin
    .from("bank_connections")
    .update({ status: "disconnected", last_synced: new Date().toISOString() })
    .eq("id", connectionId)
    .eq("user_id", userId)
    .select("*")
    .single<BankConnectionRecord>();

  if (error || !data) {
    throw new Error("Unable to disconnect bank connection");
  }

  return data;
}

/**
 * Marks all transactions for a bank connection as removed.
 * @returns Resolves after the transaction update completes.
 */
async function markConnectionTransactionsRemoved(userId: string, connectionId: string): Promise<void> {
  await supabaseAdmin
    .from("transactions")
    .update({ is_removed: true })
    .eq("user_id", userId)
    .eq("bank_connection_id", connectionId);
}

/**
 * Runs the handlePlaidWebhook service workflow for CarbonSense domain data.
 * @returns Returns the service result consumed by controllers.
 * @throws Throws service, persistence, or upstream API errors for the caller to handle.
 */
export async function handlePlaidWebhook(
  payload: PlaidWebhookPayload
): Promise<{ handled: boolean; synced_connections: number }> {
  if (
    payload.webhook_type !== "TRANSACTIONS" ||
    payload.webhook_code !== "SYNC_UPDATES_AVAILABLE" ||
    !payload.item_id
  ) {
    return { handled: false, synced_connections: 0 };
  }

  const { data: connections, error } = await supabaseAdmin
    .from("bank_connections")
    .select("id,user_id")
    .eq("plaid_item_id", payload.item_id)
    .eq("status", "active");

  if (error || !connections) {
    throw new Error("Unable to find bank connection for Plaid webhook");
  }

  let syncedConnections = 0;

  for (const connection of connections) {
    await syncTransactions(connection.user_id, connection.id);
    syncedConnections += 1;
  }

  return { handled: true, synced_connections: syncedConnections };
}

async function recalculateCarbonSummaries(
  userId: string,
  affectedDates: string[]
): Promise<void> {
  const periods = new Map<
    string,
    { periodType: "day" | "week" | "month"; periodStart: string; periodEnd: string }
  >();

  for (const affectedDate of affectedDates) {
    for (const period of getAffectedPeriods(affectedDate)) {
      periods.set(`${period.periodType}:${period.periodStart}`, period);
    }
  }

  for (const { periodType, periodStart, periodEnd } of periods.values()) {
    await recalculateCarbonSummary(userId, periodType, periodStart, periodEnd);
  }
}

function getAffectedPeriods(date: string): Array<{
  periodType: "day" | "week" | "month";
  periodStart: string;
  periodEnd: string;
}> {
  return getAffectedPeriodsWorkflow(date);
}

/**
 * Executes the extracted getAffectedPeriods service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `getAffectedPeriods`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
function getAffectedPeriodsWorkflow(date: string): Array<{
  periodType: "day" | "week" | "month";
  periodStart: string;
  periodEnd: string;
}> {
  const parsedDate = new Date(`${date}T00:00:00.000Z`);

  return [
    buildAffectedPeriod("day", parsedDate, getDatePlusDays(parsedDate, 1)),
    buildAffectedPeriod("week", getWeekStart(parsedDate), getDatePlusDays(getWeekStart(parsedDate), 7)),
    buildAffectedPeriod("month", getMonthStart(parsedDate), getNextMonthStart(parsedDate))
  ];
}

/**
 * Builds one affected period descriptor from start and end dates.
 * @returns Period type and formatted boundaries.
 */
function buildAffectedPeriod(
  periodType: "day" | "week" | "month",
  periodStart: Date,
  periodEnd: Date
) {
  return { periodType, periodStart: formatDate(periodStart), periodEnd: formatDate(periodEnd) };
}

/**
 * Adds UTC days to a date copy.
 * @returns A new date shifted by the requested day count.
 */
function getDatePlusDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Gets the UTC Monday week start for a date.
 * @returns Week start date.
 */
function getWeekStart(date: Date): Date {
  const weekStart = new Date(date);
  const daysSinceMonday = (weekStart.getUTCDay() + 6) % 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);
  return weekStart;
}

/**
 * Gets the UTC month start for a date.
 * @returns First day of the month.
 */
function getMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

/**
 * Gets the UTC start of the next month for a date.
 * @returns First day of the following month.
 */
function getNextMonthStart(date: Date): Date {
  const monthEnd = getMonthStart(date);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  return monthEnd;
}

async function recalculateCarbonSummary(
  userId: string,
  periodType: "day" | "week" | "month",
  periodStart: string,
  periodEnd: string
): Promise<void> {
  return await recalculateCarbonSummaryWorkflow(userId, periodType, periodStart, periodEnd);
}

/**
 * Executes the extracted recalculateCarbonSummary service workflow without changing side-effect order or return shape.
 * @returns The same value previously returned by `recalculateCarbonSummary`.
 * @throws The same persistence, validation, or upstream errors as the original workflow.
 */
async function recalculateCarbonSummaryWorkflow(
  userId: string,
  periodType: "day" | "week" | "month",
  periodStart: string,
  periodEnd: string
): Promise<void> {
  const transactions = await loadSummaryTransactions(userId, periodStart, periodEnd);
  const summary = summarizeTransactions(transactions);

  await upsertCarbonSummary(userId, periodType, periodStart, summary);
}

/**
 * Loads transactions included in one carbon summary period.
 * @returns Transaction rows for summary aggregation.
 * @throws When transactions cannot be loaded.
 */
async function loadSummaryTransactions(userId: string, periodStart: string, periodEnd: string) {
  const { data: transactions, error } = await supabaseAdmin
    .from("transactions")
    .select("carbon_kg,carbon_category")
    .eq("user_id", userId)
    .eq("is_removed", false)
    .gte("transaction_date", periodStart)
    .lt("transaction_date", periodEnd);

  if (error || !transactions) {
    throw new Error("Unable to recalculate carbon summaries");
  }

  return transactions;
}

/**
 * Aggregates transactions into category and total carbon buckets.
 * @returns Unrounded carbon summary totals.
 */
function summarizeTransactions(transactions: Awaited<ReturnType<typeof loadSummaryTransactions>>) {
  return transactions.reduce(addTransactionToSummary, {
    total_carbon_kg: 0, food_kg: 0, transport_kg: 0, home_kg: 0,
    shopping_kg: 0, travel_kg: 0, other_kg: 0
  });
}

/**
 * Adds one transaction to a carbon summary accumulator.
 * @returns Updated summary accumulator.
 */
function addTransactionToSummary(
  current: ReturnType<typeof emptyCarbonSummary>,
  transaction: Awaited<ReturnType<typeof loadSummaryTransactions>>[number]
) {
  const carbonKg = Number(transaction.carbon_kg);
  const categoryKey = `${transaction.carbon_category}_kg` as keyof typeof current;

  return { ...current, total_carbon_kg: current.total_carbon_kg + carbonKg, [categoryKey]: current[categoryKey] + carbonKg };
}

/**
 * Provides the empty carbon summary shape for typing aggregation.
 * @returns Empty carbon summary totals.
 */
function emptyCarbonSummary() {
  return { total_carbon_kg: 0, food_kg: 0, transport_kg: 0, home_kg: 0, shopping_kg: 0, travel_kg: 0, other_kg: 0 };
}

/**
 * Upserts the rounded carbon summary row for a period.
 * @returns Resolves after the upsert completes.
 */
async function upsertCarbonSummary(
  userId: string,
  periodType: "day" | "week" | "month",
  periodStart: string,
  summary: ReturnType<typeof emptyCarbonSummary>
): Promise<void> {
  await supabaseAdmin.from("carbon_summaries").upsert(
    buildCarbonSummaryUpsert(userId, periodType, periodStart, summary),
    { onConflict: "user_id,period_type,period_start" }
  );
}

/**
 * Shapes a carbon summary upsert payload.
 * @returns Database payload with rounded category values.
 */
function buildCarbonSummaryUpsert(
  userId: string,
  periodType: "day" | "week" | "month",
  periodStart: string,
  summary: ReturnType<typeof emptyCarbonSummary>
) {
  return {
    user_id: userId, period_type: periodType, period_start: periodStart,
    total_carbon_kg: roundCurrency(summary.total_carbon_kg), food_kg: roundCurrency(summary.food_kg),
    transport_kg: roundCurrency(summary.transport_kg), home_kg: roundCurrency(summary.home_kg),
    shopping_kg: roundCurrency(summary.shopping_kg), travel_kg: roundCurrency(summary.travel_kg),
    other_kg: roundCurrency(summary.other_kg), challenge_savings_kg: 0
  };
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
