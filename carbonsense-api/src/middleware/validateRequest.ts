/**
 * Request-validation middleware. Runs Zod schemas against req.body, req.query,
 * and/or req.params before the request reaches controller logic. Does NOT
 * rewrite parsed values back onto the request; every controller re-parses
 * its own copy. Validation failures are forwarded to the shared error handler.
 */
import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";

type RequestSchemas = {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
};

/**
 * Validates selected request containers before controller business logic runs.
 *
 * Calls each provided schema's {@link ZodTypeAny.parse} for its validation side-effect only;
 * the parsed value is intentionally discarded. Express 5 exposes `req.query`, `req.params`,
 * and `req.body` as read-only getters / body-parsed objects that must not be reassigned,
 * so the middleware must not write parsed values back onto the request. Every controller
 * in this codebase re-parses its own copy of the schema against `req.query`, `req.params`,
 * or `req.body` directly, so the request never needs to carry pre-coerced values.
 *
 * Zod failures are forwarded to the shared error handler unchanged, so the response
 * remains 400 with code `VALIDATION_ERROR`.
 *
 * @returns Express middleware that validates and forwards errors without mutating the request.
 * @throws Forwards Zod validation failures to the shared error handler via `next(error)`.
 */
export function validateRequest(schemas: RequestSchemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        schemas.body.parse(req.body);
      }

      if (schemas.query) {
        schemas.query.parse(req.query);
      }

      if (schemas.params) {
        schemas.params.parse(req.params);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}
