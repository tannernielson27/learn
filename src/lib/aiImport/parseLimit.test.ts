import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import { RateLimitUnavailableError, type RateLimitStore } from "@/lib/rateLimit/store";
import { AI_IMPORT_PARSE_LIMIT, takeParseCall } from "./parseLimit";

afterEach(() => vi.restoreAllMocks());

describe("takeParseCall", () => {
  it("allows a teacher's calls up to the limit, then refuses, per teacher", async () => {
    const store = createMemoryRateLimitStore();
    for (let i = 0; i < AI_IMPORT_PARSE_LIMIT.attempts; i += 1) {
      expect(await takeParseCall("teacher-a", store)).toBe("ok");
    }
    expect(await takeParseCall("teacher-a", store)).toBe("rate_limited");
    expect(await takeParseCall("teacher-b", store)).toBe("ok");
  });

  it("fails closed when the store cannot answer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const store: RateLimitStore = {
      hit: async () => {
        throw new RateLimitUnavailableError("down");
      },
    };
    expect(await takeParseCall("teacher-a", store)).toBe("unavailable");
    const odd: RateLimitStore = {
      hit: async () => {
        throw "not an error";
      },
    };
    expect(await takeParseCall("teacher-a", odd)).toBe("unavailable");
  });
});
