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
import { classifyTransaction, refreshCarbonSummaries } from "./carbon.service";
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

export async function exchangePublicToken(
  userId: string,
  publicToken: string,
  institutionId: string,
  institutionName: string
): Promise<PublicConnection & { initial_sync: SyncResult }> {
  const exchangeResponse = await getPlaidClient().itemPublicTokenExchange({
    public_token: publicToken
  });
  const { access_token: accessToken, item_id: itemId } = exchangeResponse.data;

  const { data: connection, error } = await supabaseAdmin
    .from("bank_connections")
    .insert({
      user_id: userId,
      plaid_access_token: encryptAccessToken(accessToken),
      plaid_item_id: itemId,
      institution_name: institutionName,
      institution_logo: null,
      status: "active"
    })
    .select("*")
    .single<BankConnectionRecord>();

  if (error || !connection) {
    throw new Error("Unable to save bank connection");
  }

  const initialSync = await syncTransactions(userId, connection.id);

  return {
    ...sanitizeConnection(connection),
    initial_sync: initialSync,
    plaid_item_id: itemId,
    institution_name: institutionName,
    id: connection.id,
    user_id: userId,
    institution_logo: connection.institution_logo,
    status: connection.status,
    last_synced: connection.last_synced,
    created_at: connection.created_at,
    plaid_cursor: connection.plaid_cursor
  };
}

export async function syncTransactions(
  userId: string,
  connectionId: string
): Promise<SyncResult> {
  const connection = await getOwnedConnection(userId, connectionId);

  if (connection.status === "disconnected") {
    throw new Error("Bank connection is disconnected");
  }

  const accessToken = decryptAccessToken(connection.plaid_access_token);
  let cursor = connection.plaid_cursor ?? undefined;
  let hasMore = true;
  let newTransactions = 0;
  let totalCarbonKg = 0;
  const affectedDates = new Set<string>();

  while (hasMore) {
    const syncResponse = await getPlaidClient().transactionsSync({
      access_token: accessToken,
      cursor,
      count: 500
    });
    const syncData = syncResponse.data;

    for (const removedTransaction of syncData.removed) {
      await supabaseAdmin
        .from("transactions")
        .update({ is_removed: true })
        .eq("user_id", userId)
        .eq("plaid_transaction_id", removedTransaction.transaction_id);
    }

    for (const transaction of [...syncData.added, ...syncData.modified]) {
      if (transaction.pending) {
        continue;
      }

      const merchantName = getMerchantName(transaction);
      const plaidCategory = mapPlaidCategory(transaction);
      const classification = await classifyTransaction(
        merchantName,
        plaidCategory,
        transaction.amount
      );
      const transactionDate = transaction.date;

      const { error } = await supabaseAdmin.from("transactions").upsert(
        {
          user_id: userId,
          bank_connection_id: connectionId,
          plaid_transaction_id: transaction.transaction_id,
          merchant_name: merchantName,
          merchant_category: plaidCategory,
          amount: transaction.amount,
          currency: transaction.iso_currency_code ?? "USD",
          carbon_kg: classification.carbon_kg,
          carbon_category: classification.carbon_category,
          carbon_confidence: classification.confidence,
          carbon_source: classification.source,
          transaction_date: transactionDate,
          is_removed: false
        },
        {
          onConflict: "plaid_transaction_id"
        }
      );

      if (error) {
        throw new Error("Unable to save synced transaction");
      }

      if (syncData.added.some((added) => added.transaction_id === transaction.transaction_id)) {
        newTransactions += 1;
        totalCarbonKg += classification.carbon_kg;
      }

      affectedDates.add(transactionDate);
    }

    cursor = syncData.next_cursor;
    hasMore = syncData.has_more;
  }

  await supabaseAdmin
    .from("bank_connections")
    .update({
      plaid_cursor: cursor,
      last_synced: new Date().toISOString(),
      status: "active"
    })
    .eq("id", connectionId)
    .eq("user_id", userId);

  await Promise.all(
    [...affectedDates].map((date) => refreshCarbonSummaries(userId, date))
  );

  return {
    new_transactions: newTransactions,
    total_carbon_kg: Math.round(totalCarbonKg * 100) / 100
  };
}

export async function disconnectBank(
  userId: string,
  connectionId: string
): Promise<PublicConnection> {
  const connection = await getOwnedConnection(userId, connectionId);
  const accessToken = decryptAccessToken(connection.plaid_access_token);

  await getPlaidClient().itemRemove({
    access_token: accessToken
  });

  const { data, error } = await supabaseAdmin
    .from("bank_connections")
    .update({
      status: "disconnected",
      last_synced: new Date().toISOString()
    })
    .eq("id", connectionId)
    .eq("user_id", userId)
    .select("*")
    .single<BankConnectionRecord>();

  if (error || !data) {
    throw new Error("Unable to disconnect bank connection");
  }

  await supabaseAdmin
    .from("transactions")
    .update({ is_removed: true })
    .eq("user_id", userId)
    .eq("bank_connection_id", connectionId);

  return sanitizeConnection(data);
}

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
  const parsedDate = new Date(`${date}T00:00:00.000Z`);
  const dayEnd = new Date(parsedDate);
  dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

  const weekStart = new Date(parsedDate);
  const daysSinceMonday = (weekStart.getUTCDay() + 6) % 7;
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  const monthStart = new Date(
    Date.UTC(parsedDate.getUTCFullYear(), parsedDate.getUTCMonth(), 1)
  );
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);

  return [
    {
      periodType: "day",
      periodStart: formatDate(parsedDate),
      periodEnd: formatDate(dayEnd)
    },
    {
      periodType: "week",
      periodStart: formatDate(weekStart),
      periodEnd: formatDate(weekEnd)
    },
    {
      periodType: "month",
      periodStart: formatDate(monthStart),
      periodEnd: formatDate(monthEnd)
    }
  ];
}

async function recalculateCarbonSummary(
  userId: string,
  periodType: "day" | "week" | "month",
  periodStart: string,
  periodEnd: string
): Promise<void> {
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

  const summary = transactions.reduce(
    (current, transaction) => {
      const carbonKg = Number(transaction.carbon_kg);
      const categoryKey = `${transaction.carbon_category}_kg` as keyof typeof current;

      return {
        ...current,
        total_carbon_kg: current.total_carbon_kg + carbonKg,
        [categoryKey]: current[categoryKey] + carbonKg
      };
    },
    {
      total_carbon_kg: 0,
      food_kg: 0,
      transport_kg: 0,
      home_kg: 0,
      shopping_kg: 0,
      travel_kg: 0,
      other_kg: 0
    }
  );

  await supabaseAdmin.from("carbon_summaries").upsert(
    {
      user_id: userId,
      period_type: periodType,
      period_start: periodStart,
      total_carbon_kg: roundCurrency(summary.total_carbon_kg),
      food_kg: roundCurrency(summary.food_kg),
      transport_kg: roundCurrency(summary.transport_kg),
      home_kg: roundCurrency(summary.home_kg),
      shopping_kg: roundCurrency(summary.shopping_kg),
      travel_kg: roundCurrency(summary.travel_kg),
      other_kg: roundCurrency(summary.other_kg),
      challenge_savings_kg: 0
    },
    {
      onConflict: "user_id,period_type,period_start"
    }
  );
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}
