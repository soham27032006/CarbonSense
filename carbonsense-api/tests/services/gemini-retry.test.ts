import { describe, expect, it, vi } from "vitest";
import {
  GEMINI_MAX_RETRIES,
  GeminiRateLimitError,
  withGeminiRetry
} from "../../src/services/gemini-retry";

function gemini429(): Error {
  return Object.assign(new Error("429 TooManyRequests: Resource exhausted"), {
    status: 429
  });
}

describe("withGeminiRetry", () => {
  it("retries transient Gemini 429 errors before succeeding", async () => {
    const work = vi
      .fn()
      .mockRejectedValueOnce(gemini429())
      .mockResolvedValueOnce("ok");

    await expect(withGeminiRetry(work, { sleep: async () => undefined })).resolves.toBe("ok");
    expect(work).toHaveBeenCalledTimes(2);
  });

  it("throws GeminiRateLimitError after exhausting 429 retries", async () => {
    const work = vi.fn().mockRejectedValue(gemini429());

    await expect(withGeminiRetry(work, { sleep: async () => undefined })).rejects.toBeInstanceOf(
      GeminiRateLimitError
    );
    expect(work).toHaveBeenCalledTimes(GEMINI_MAX_RETRIES + 1);
  });
});
