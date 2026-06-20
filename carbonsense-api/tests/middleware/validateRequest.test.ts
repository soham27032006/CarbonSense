import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { validateRequest } from "../../src/middleware/validateRequest";

/**
 * Express 5 implements req.query as a getter. Reassigning the property on the
 * underlying object throws "TypeError: Cannot set property query of ... which
 * has only a getter". This helper mimics that shape so the test would fail if
 * validateRequest ever started writing back to req.query.
 */
function buildExpress5QueryRequest<TBody, TParams>(overrides: {
  body?: TBody;
  query?: Record<string, unknown>;
  params?: TParams;
} = {}) {
  const queryValue = overrides.query ?? {};
  const paramsValue = (overrides.params ?? {}) as TParams;
  return {
    body: overrides.body,
    get query() {
      return queryValue;
    },
    get params() {
      return paramsValue;
    }
  };
}

describe("validateRequest (Express 5)", () => {
  it("does not throw when validating a query against an Express 5 getter-backed req.query", () => {
    const middleware = validateRequest({
      query: z.object({ page: z.coerce.number().int().min(1).default(1) })
    });

    const req = buildExpress5QueryRequest({ query: { page: "7" } });
    const next = vi.fn();

    expect(() => middleware(req as never, {} as never, next)).not.toThrow();
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]).toHaveLength(0); // called with no error
  });

  it("forwards ZodError to next(error) when query is invalid", () => {
    const middleware = validateRequest({
      query: z.object({ page: z.coerce.number().int().min(1).max(100) })
    });

    const req = buildExpress5QueryRequest({ query: { page: "9999" } });
    const next = vi.fn();

    middleware(req as never, {} as never, next);

    expect(next).toHaveBeenCalledOnce();
    const forwarded = next.mock.calls[0]?.[0];
    expect(forwarded).toBeInstanceOf(z.ZodError);
  });

  it("does not throw when validating a body (req.body is body-parser-parsed, not Express 5 read-only)", () => {
    const middleware = validateRequest({
      body: z.object({ name: z.string().min(1) })
    });

    const req = { body: { name: "Soham" } };
    const next = vi.fn();

    expect(() => middleware(req as never, {} as never, next)).not.toThrow();
    expect(next.mock.calls[0]).toHaveLength(0);
  });

  it("does not throw when validating params against an Express 5 getter-backed req.params", () => {
    const middleware = validateRequest({
      params: z.object({ id: z.string().uuid() })
    });

    const req = buildExpress5QueryRequest({ params: { id: "550e8400-e29b-41d4-a716-446655440000" } });
    const next = vi.fn();

    expect(() => middleware(req as never, {} as never, next)).not.toThrow();
    expect(next.mock.calls[0]).toHaveLength(0);
  });
});
