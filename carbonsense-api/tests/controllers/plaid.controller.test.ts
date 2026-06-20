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
import { createPlaidLinkToken } from "../../src/controllers/plaid.controller";

type ControllerArgs = Parameters<typeof createPlaidLinkToken>;

const plaidServiceMocks = vi.hoisted(() => ({
  createLinkToken: vi.fn()
}));

vi.mock("../../src/services/plaid.service", () => ({
  createLinkToken: plaidServiceMocks.createLinkToken,
  exchangePublicToken: vi.fn(),
  handlePlaidWebhook: vi.fn(),
  syncTransactions: vi.fn(),
  disconnectBank: vi.fn()
}));

function buildReqResNext(reqOverrides: Partial<ControllerArgs[0]> = {}): {
  req: ControllerArgs[0];
  res: ControllerArgs[1];
  next: ReturnType<typeof vi.fn>;
} {
  const req = {
    user: { id: "user-1" },
    body: {},
    ...reqOverrides
  } as unknown as ControllerArgs[0];
  const res = {} as ControllerArgs[1];
  const next = vi.fn();
  return { req, res, next };
}

function getAppError(next: ReturnType<typeof vi.fn>): AppError {
  expect(next).toHaveBeenCalledOnce();
  const forwarded = next.mock.calls[0]?.[0];
  expect(forwarded).toBeInstanceOf(AppError);
  return forwarded as AppError;
}

describe("createPlaidLinkToken controller — error contract", () => {
  beforeEach(() => {
    plaidServiceMocks.createLinkToken.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with the link_token on the success path", async () => {
    plaidServiceMocks.createLinkToken.mockResolvedValueOnce("link-sandbox-abc");
    const resMock = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    } as unknown as ControllerArgs[1];
    const { req, res: _res, next } = buildReqResNext();

    await createPlaidLinkToken(req, resMock, next);

    expect(resMock.status).toHaveBeenCalledWith(200);
    expect(resMock.json).toHaveBeenCalledWith({
      success: true,
      data: { link_token: "link-sandbox-abc" }
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

    const appError = getAppError(next);
    expect(appError.statusCode).toBe(502);
    expect(appError.code).toBe("BANK_INTEGRATION_FAILED");
  });

  it("forwards an AppError 502 BANK_INTEGRATION_FAILED when createLinkToken throws a plain Error (e.g. 'Bank connection is temporarily unavailable')", async () => {
    plaidServiceMocks.createLinkToken.mockRejectedValueOnce(
      new Error("Bank connection is temporarily unavailable")
    );
    const { req, res, next } = buildReqResNext();

    await createPlaidLinkToken(req, res, next);

    const appError = getAppError(next);
    expect(appError.statusCode).toBe(502);
    expect(appError.code).toBe("BANK_INTEGRATION_FAILED");
  });

  it("forwards an AppError 502 BANK_INTEGRATION_FAILED when createLinkToken rejects with a non-Error value (string)", async () => {
    plaidServiceMocks.createLinkToken.mockRejectedValueOnce("plaid upstream exploded");
    const { req, res, next } = buildReqResNext();

    await createPlaidLinkToken(req, res, next);

    const appError = getAppError(next);
    expect(appError.statusCode).toBe(502);
    expect(appError.code).toBe("BANK_INTEGRATION_FAILED");
  });

  it("forwards an AppError 502 BANK_INTEGRATION_FAILED when createLinkToken throws synchronously", async () => {
    plaidServiceMocks.createLinkToken.mockImplementationOnce(() => {
      throw new Error("sync construction failure");
    });
    const { req, res, next } = buildReqResNext();

    await createPlaidLinkToken(req, res, next);

    const appError = getAppError(next);
    expect(appError.statusCode).toBe(502);
    expect(appError.code).toBe("BANK_INTEGRATION_FAILED");
  });

  it("errorHandler always returns a JSON 502 envelope for the forwarded AppError — never an empty body or raw status", async () => {
    plaidServiceMocks.createLinkToken.mockRejectedValueOnce(new Error("upstream timeout"));
    const { req, res, next } = buildReqResNext();
    const resMock = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    } as unknown as ControllerArgs[1];

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
        message: "We could not complete the bank connection request. Please try again."
      }
    });
  });
});
