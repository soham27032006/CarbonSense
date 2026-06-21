/**
 * Contract test for the createPlaidLinkToken controller.
 *
 * The previous diagnosis established that the controller wraps every Plaid
 * failure in a try/catch and forwards to errorHandler.ts, which always
 * serializes a JSON envelope. This test pins that contract: regardless of
 * what createLinkToken throws (sync Error, rejected Promise, Plaid-shaped
 * error, non-Error value), the next() call always receives an AppError
 * with status 502 and code BANK_INTEGRATION_FAILED — never a raw unknown
 * error that errorHandler can't serialize.
 *
 * If a future refactor ever introduces a code path that lets an unhandled
 * throw escape the controller, this test will fail.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppError, errorHandler } from "../../src/middleware/errorHandler";
import {
  createPlaidLinkToken,
  disconnectPlaidBank,
  exchangePlaidToken,
  plaidWebhook,
  syncPlaidTransactions
} from "../../src/controllers/plaid.controller";

type ControllerArgs = Parameters<typeof createPlaidLinkToken>;

const plaidServiceMocks = vi.hoisted(() => ({
  createLinkToken: vi.fn(),
  exchangePublicToken: vi.fn(),
  handlePlaidWebhook: vi.fn(),
  syncTransactions: vi.fn(),
  disconnectBank: vi.fn()
}));

vi.mock("../../src/services/plaid.service", () => ({
  createLinkToken: plaidServiceMocks.createLinkToken,
  exchangePublicToken: plaidServiceMocks.exchangePublicToken,
  handlePlaidWebhook: plaidServiceMocks.handlePlaidWebhook,
  syncTransactions: plaidServiceMocks.syncTransactions,
  disconnectBank: plaidServiceMocks.disconnectBank
}));

const TEST_USER_ID = "user-1";
const TEST_LINK_TOKEN = "link-sandbox-abc";
const TEST_PUBLIC_TOKEN = "public-sandbox-xyz";
const TEST_INSTITUTION_ID = "ins-1";
const TEST_INSTITUTION_NAME = "First Platypus Bank";
const TEST_CONNECTION_ID = "a1b2c3d4-e5f6-1789-9abc-def012345678";
const TEST_BANK_ERROR_MESSAGE = "We could not complete the bank connection request. Please try again.";
const TEST_WEBHOOK_RESULT = { handled: true, synced_connections: 1 };
const TEST_SYNC_RESULT = { new_transactions: 2, total_carbon_kg: 8.4 };
const TEST_DISCONNECTED_CONNECTION = { id: TEST_CONNECTION_ID, status: "disconnected" };

function buildReqResNext(reqOverrides: Partial<ControllerArgs[0]> = {}): {
  req: ControllerArgs[0];
  res: ControllerArgs[1];
  next: ReturnType<typeof vi.fn>;
} {
  const req = {
    user: { id: TEST_USER_ID },
    body: {},
    ...reqOverrides
  } as unknown as ControllerArgs[0];
  const res = {} as ControllerArgs[1];
  const next = vi.fn();
  return { req, res, next };
}

function buildResMock(): ControllerArgs[1] {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis()
  } as unknown as ControllerArgs[1];
}

function getAppError(next: ReturnType<typeof vi.fn>): AppError {
  expect(next).toHaveBeenCalledOnce();
  const forwarded = next.mock.calls[0]?.[0];
  expect(forwarded).toBeInstanceOf(AppError);
  return forwarded as AppError;
}

function expectBankIntegrationFailed(next: ReturnType<typeof vi.fn>): AppError {
  const appError = getAppError(next);
  expect(appError.statusCode).toBe(502);
  expect(appError.code).toBe("BANK_INTEGRATION_FAILED");
  return appError;
}

describe("createPlaidLinkToken controller — error contract", () => {
  beforeEach(() => {
    plaidServiceMocks.createLinkToken.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the link_token on the success path", async () => {
    plaidServiceMocks.createLinkToken.mockResolvedValueOnce(TEST_LINK_TOKEN);
    const resMock = buildResMock();
    const { req, res: _res, next } = buildReqResNext();

    await createPlaidLinkToken(req, resMock, next);

    expect(resMock.status).toHaveBeenCalledWith(200);
    expect(resMock.json).toHaveBeenCalledWith({
      success: true,
      data: { link_token: TEST_LINK_TOKEN }
    });
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards an AppError 502 BANK_INTEGRATION_FAILED when createLinkToken throws a Plaid-shaped error", async () => {
    const plaidError = Object.assign(new Error("invalid client"), {
      response: { status: 401, data: { error_code: "INVALID_INPUT" } }
    });
    plaidServiceMocks.createLinkToken.mockRejectedValueOnce(plaidError);
    const { req, res, next } = buildReqResNext();

    await createPlaidLinkToken(req, res, next);

    expectBankIntegrationFailed(next);
  });

  it("forwards an AppError 502 BANK_INTEGRATION_FAILED when createLinkToken throws a plain Error (e.g. 'Bank connection is temporarily unavailable')", async () => {
    plaidServiceMocks.createLinkToken.mockRejectedValueOnce(
      new Error("Bank connection is temporarily unavailable")
    );
    const { req, res, next } = buildReqResNext();

    await createPlaidLinkToken(req, res, next);

    expectBankIntegrationFailed(next);
  });

  it("forwards an AppError 502 BANK_INTEGRATION_FAILED when createLinkToken rejects with a non-Error value (string)", async () => {
    plaidServiceMocks.createLinkToken.mockRejectedValueOnce("plaid upstream exploded");
    const { req, res, next } = buildReqResNext();

    await createPlaidLinkToken(req, res, next);

    expectBankIntegrationFailed(next);
  });

  it("forwards an AppError 502 BANK_INTEGRATION_FAILED when createLinkToken throws synchronously", async () => {
    plaidServiceMocks.createLinkToken.mockImplementationOnce(() => {
      throw new Error("sync construction failure");
    });
    const { req, res, next } = buildReqResNext();

    await createPlaidLinkToken(req, res, next);

    expectBankIntegrationFailed(next);
  });

  it("errorHandler always returns a JSON 502 envelope for the forwarded AppError — never an empty body or raw status", async () => {
    plaidServiceMocks.createLinkToken.mockRejectedValueOnce(new Error("upstream timeout"));
    const { req, res: _res, next } = buildReqResNext();
    const resMock = buildResMock();

    await createPlaidLinkToken(req, resMock, next);
    errorHandler(
      next.mock.calls[0]?.[0] as unknown as Error,
      req,
      resMock,
      vi.fn()
    );

    expect(resMock.status).toHaveBeenCalledWith(502);
    expect(resMock.json).toHaveBeenCalledOnce();
    const payload = (resMock.json as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(payload).toEqual({
      success: false,
      error: {
        code: "BANK_INTEGRATION_FAILED",
        message: TEST_BANK_ERROR_MESSAGE
      }
    });
  });
});

describe("exchangePlaidToken controller", () => {
  beforeEach(() => {
    Object.values(plaidServiceMocks).forEach((mock) => mock.mockReset());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 201 with the saved connection on the success path", async () => {
    const connection = { id: TEST_CONNECTION_ID, institution_name: TEST_INSTITUTION_NAME };
    plaidServiceMocks.exchangePublicToken.mockResolvedValueOnce(connection);
    const resMock = buildResMock();
    const { req, next } = buildReqResNext({
      body: {
        public_token: TEST_PUBLIC_TOKEN,
        institution: { id: TEST_INSTITUTION_ID, name: TEST_INSTITUTION_NAME }
      }
    });

    await exchangePlaidToken(req, resMock, next);

    expect(plaidServiceMocks.exchangePublicToken).toHaveBeenCalledWith(
      TEST_USER_ID,
      TEST_PUBLIC_TOKEN,
      TEST_INSTITUTION_ID,
      TEST_INSTITUTION_NAME
    );
    expect(resMock.status).toHaveBeenCalledWith(201);
    expect(resMock.json).toHaveBeenCalledWith({ success: true, data: { connection } });
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards a ZodError unchanged (not wrapped in BANK_INTEGRATION_FAILED) when the body is invalid", async () => {
    const { req, res, next } = buildReqResNext({ body: { public_token: "" } });

    await exchangePlaidToken(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const forwarded = next.mock.calls[0]?.[0];
    expect(forwarded).not.toBeInstanceOf(AppError);
    expect(plaidServiceMocks.exchangePublicToken).not.toHaveBeenCalled();
  });

  it("forwards an AppError 502 BANK_INTEGRATION_FAILED when exchangePublicToken rejects", async () => {
    plaidServiceMocks.exchangePublicToken.mockRejectedValueOnce(new Error("Plaid exchange failed"));
    const { req, res, next } = buildReqResNext({
      body: {
        public_token: TEST_PUBLIC_TOKEN,
        institution: { id: TEST_INSTITUTION_ID, name: TEST_INSTITUTION_NAME }
      }
    });

    await exchangePlaidToken(req, res, next);

    expectBankIntegrationFailed(next);
  });
});

describe("syncPlaidTransactions controller", () => {
  beforeEach(() => {
    Object.values(plaidServiceMocks).forEach((mock) => mock.mockReset());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the sync result on the success path", async () => {
    plaidServiceMocks.syncTransactions.mockResolvedValueOnce(TEST_SYNC_RESULT);
    const resMock = buildResMock();
    const { req, next } = buildReqResNext({ body: { connection_id: TEST_CONNECTION_ID } });

    await syncPlaidTransactions(req, resMock, next);

    expect(plaidServiceMocks.syncTransactions).toHaveBeenCalledWith(TEST_USER_ID, TEST_CONNECTION_ID);
    expect(resMock.status).toHaveBeenCalledWith(200);
    expect(resMock.json).toHaveBeenCalledWith({ success: true, data: TEST_SYNC_RESULT });
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards a ZodError when connection_id is not a valid UUID", async () => {
    const { req, res, next } = buildReqResNext({ body: { connection_id: "not-a-uuid" } });

    await syncPlaidTransactions(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const forwarded = next.mock.calls[0]?.[0];
    expect(forwarded).not.toBeInstanceOf(AppError);
    expect(plaidServiceMocks.syncTransactions).not.toHaveBeenCalled();
  });

  it("forwards an AppError 502 BANK_INTEGRATION_FAILED when syncTransactions rejects", async () => {
    plaidServiceMocks.syncTransactions.mockRejectedValueOnce(new Error("Plaid sync failed"));
    const { req, res, next } = buildReqResNext({ body: { connection_id: TEST_CONNECTION_ID } });

    await syncPlaidTransactions(req, res, next);

    expectBankIntegrationFailed(next);
  });
});

describe("disconnectPlaidBank controller", () => {
  beforeEach(() => {
    Object.values(plaidServiceMocks).forEach((mock) => mock.mockReset());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the disconnected connection on the success path", async () => {
    plaidServiceMocks.disconnectBank.mockResolvedValueOnce(TEST_DISCONNECTED_CONNECTION);
    const resMock = buildResMock();
    const { req, next } = buildReqResNext({ params: { connectionId: TEST_CONNECTION_ID } });

    await disconnectPlaidBank(req, resMock, next);

    expect(plaidServiceMocks.disconnectBank).toHaveBeenCalledWith(TEST_USER_ID, TEST_CONNECTION_ID);
    expect(resMock.status).toHaveBeenCalledWith(200);
    expect(resMock.json).toHaveBeenCalledWith({ success: true, data: { connection: TEST_DISCONNECTED_CONNECTION } });
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards a ZodError when connectionId param is not a valid UUID", async () => {
    const { req, res, next } = buildReqResNext({ params: { connectionId: "bad" } });

    await disconnectPlaidBank(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    const forwarded = next.mock.calls[0]?.[0];
    expect(forwarded).not.toBeInstanceOf(AppError);
    expect(plaidServiceMocks.disconnectBank).not.toHaveBeenCalled();
  });

  it("forwards an AppError 502 BANK_INTEGRATION_FAILED when disconnectBank rejects", async () => {
    plaidServiceMocks.disconnectBank.mockRejectedValueOnce(new Error("Plaid remove failed"));
    const { req, res, next } = buildReqResNext({ params: { connectionId: TEST_CONNECTION_ID } });

    await disconnectPlaidBank(req, res, next);

    expectBankIntegrationFailed(next);
  });
});

describe("plaidWebhook controller", () => {
  beforeEach(() => {
    Object.values(plaidServiceMocks).forEach((mock) => mock.mockReset());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the webhook result on the success path", async () => {
    plaidServiceMocks.handlePlaidWebhook.mockResolvedValueOnce(TEST_WEBHOOK_RESULT);
    const resMock = buildResMock();
    const { req, next } = buildReqResNext({
      body: { webhook_type: "TRANSACTIONS", webhook_code: "SYNC_UPDATES_AVAILABLE", item_id: "item-1" }
    });

    await plaidWebhook(req, resMock, next);

    expect(resMock.status).toHaveBeenCalledWith(200);
    expect(resMock.json).toHaveBeenCalledWith({ success: true, data: TEST_WEBHOOK_RESULT });
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards an AppError 502 BANK_INTEGRATION_FAILED when handlePlaidWebhook rejects", async () => {
    plaidServiceMocks.handlePlaidWebhook.mockRejectedValueOnce(new Error("Webhook processing failed"));
    const { req, res, next } = buildReqResNext({ body: {} });

    await plaidWebhook(req, res, next);

    expectBankIntegrationFailed(next);
  });
});

describe("requireUserId auth guard", () => {
  beforeEach(() => {
    Object.values(plaidServiceMocks).forEach((mock) => mock.mockReset());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("wraps the missing-user 401 into 502 BANK_INTEGRATION_FAILED through the catch path", async () => {
    plaidServiceMocks.createLinkToken.mockResolvedValueOnce(TEST_LINK_TOKEN);
    const { req, res, next } = buildReqResNext({ user: undefined });

    await createPlaidLinkToken(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expectBankIntegrationFailed(next);
    expect(plaidServiceMocks.createLinkToken).not.toHaveBeenCalled();
  });
});
