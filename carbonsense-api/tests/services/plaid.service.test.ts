import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetSupabaseMock, setSupabaseHandler, type SupabaseCall } from "../helpers/supabase";

const plaidMocks = vi.hoisted(() => ({
  transactionsSync: vi.fn(),
  itemPublicTokenExchange: vi.fn(),
  itemRemove: vi.fn(),
  linkTokenCreate: vi.fn()
}));

const carbonMocks = vi.hoisted(() => ({
  classifyTransactionsBatch: vi.fn(),
  refreshCarbonSummaries: vi.fn()
}));

vi.mock("plaid", () => ({
  Configuration: vi.fn(),
  PlaidApi: vi.fn(function MockPlaidApi() { return plaidMocks; }),
  PlaidEnvironments: { sandbox: "sandbox" },
  Products: { Transactions: "transactions" },
  CountryCode: { Us: "US" }
}));

vi.mock("../../src/services/carbon.service", () => carbonMocks);

function encryptedToken(value = "access-token") {
  const key = crypto.createHash("sha256").update("x".repeat(32)).digest();
  const iv = Buffer.alloc(12, 1);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64url"), tag.toString("base64url"), encrypted.toString("base64url")].join(".");
}

async function importService() {
  return await import("../../src/services/plaid.service");
}

function mockConnection(overrides: Record<string, unknown> = {}) {
  return {
    id: "conn-1",
    user_id: "user-1",
    plaid_access_token: encryptedToken(),
    plaid_item_id: "item-1",
    institution_name: "Bank",
    institution_logo: null,
    status: "active",
    last_synced: null,
    created_at: "2026-01-01T00:00:00.000Z",
    plaid_cursor: null,
    ...overrides
  };
}

describe("plaid.service syncTransactions", () => {
  beforeEach(() => {
    resetSupabaseMock();
    vi.clearAllMocks();
    carbonMocks.classifyTransactionsBatch.mockResolvedValue([{ carbon_kg: 4.2, carbon_category: "shopping", confidence: 0.9, source: "mock" }]);
    carbonMocks.refreshCarbonSummaries.mockResolvedValue(undefined);
  });

  it("syncs added transactions and returns rounded carbon totals", async () => {
    plaidMocks.transactionsSync.mockResolvedValueOnce({ data: { added: [{ transaction_id: "tx-1", pending: false, merchant_name: "Shop", name: "Shop", amount: 42, date: "2026-06-20", iso_currency_code: "USD", personal_finance_category: { primary: "GENERAL_MERCHANDISE" } }], modified: [], removed: [], next_cursor: "cursor-1", has_more: false } });
    setSupabaseHandler((call: SupabaseCall) => {
      if (call.table === "bank_connections" && call.operation === "single") return { data: mockConnection(), error: null };
      if (call.table === "transactions" && call.operation === "upsert") return { data: null, error: null };
      if (call.table === "bank_connections" && call.operation === "update") return { data: null, error: null };
      return { data: null, error: null };
    });

    const { syncTransactions } = await importService();
    const result = await syncTransactions("user-1", "conn-1");

    expect(result).toEqual({ new_transactions: 1, total_carbon_kg: 4.2 });
    expect(carbonMocks.refreshCarbonSummaries).toHaveBeenCalledWith("user-1", "2026-06-20");
  });

  it("ignores pending transactions and returns zero new carbon", async () => {
    plaidMocks.transactionsSync.mockResolvedValueOnce({ data: { added: [{ transaction_id: "tx-pending", pending: true, amount: 10, date: "2026-06-20" }], modified: [], removed: [], next_cursor: "cursor-1", has_more: false } });
    setSupabaseHandler((call: SupabaseCall) => call.table === "bank_connections" && call.operation === "single" ? { data: mockConnection(), error: null } : { data: null, error: null });

    const { syncTransactions } = await importService();
    const result = await syncTransactions("user-1", "conn-1");

    expect(result).toEqual({ new_transactions: 0, total_carbon_kg: 0 });
    expect(carbonMocks.classifyTransactionsBatch).not.toHaveBeenCalled();
  });

  it("throws when the owned connection is disconnected", async () => {
    setSupabaseHandler((call: SupabaseCall) => call.table === "bank_connections" && call.operation === "single" ? { data: mockConnection({ status: "disconnected" }), error: null } : { data: null, error: null });

    const { syncTransactions } = await importService();
    await expect(syncTransactions("user-1", "conn-1")).rejects.toThrow("Bank connection is disconnected");
  });
});
