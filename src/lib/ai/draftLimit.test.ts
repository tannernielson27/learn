import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import {
  RATE_LIMIT_BUCKETS,
  RateLimitUnavailableError,
  type RateLimitStore,
} from "@/lib/rateLimit/store";
import { AI_DRAFT_LIMITS, takeDraftCall } from "./draftLimit";

afterEach(() => vi.restoreAllMocks());

const HOUR = 60 * 60 * 1000;

describe("takeDraftCall", () => {
  it("has two buckets, 30 an hour per teacher each (ADR 0018 decision 5)", () => {
    expect(AI_DRAFT_LIMITS).toEqual({
      draft_rationale: { bucket: "ai_draft_rationale", limit: { attempts: 30, windowMs: HOUR } },
      draft_variant: { bucket: "ai_draft_variant", limit: { attempts: 30, windowMs: HOUR } },
    });
    expect(RATE_LIMIT_BUCKETS).toContain("ai_draft_rationale");
    expect(RATE_LIMIT_BUCKETS).toContain("ai_draft_variant");
  });

  it.each(["draft_rationale", "draft_variant"] as const)(
    "allows a teacher 30 %s calls, then refuses, per teacher",
    async (kind) => {
      const store = createMemoryRateLimitStore();
      for (let i = 0; i < 30; i += 1) {
        expect(await takeDraftCall(kind, "teacher-a", store)).toBe("ok");
      }
      expect(await takeDraftCall(kind, "teacher-a", store)).toBe("rate_limited");
      expect(await takeDraftCall(kind, "teacher-b", store)).toBe("ok");
    },
  );

  it("counts rationales and variants apart, and apart from import", async () => {
    const store = createMemoryRateLimitStore();
    const hit = vi.spyOn(store, "hit");
    for (let i = 0; i < 30; i += 1) await takeDraftCall("draft_rationale", "teacher-a", store);
    expect(await takeDraftCall("draft_rationale", "teacher-a", store)).toBe("rate_limited");
    expect(await takeDraftCall("draft_variant", "teacher-a", store)).toBe("ok");
    expect(new Set(hit.mock.calls.map(([bucket]) => bucket))).toEqual(
      new Set(["ai_draft_rationale", "ai_draft_variant"]),
    );
    // The key is the account id, never an address; the store keeps a digest of it.
    expect(hit.mock.calls.every(([, key]) => key === "teacher-a")).toBe(true);
  });

  it("fails closed: a limiter that cannot answer refuses the call", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const down: RateLimitStore = {
      hit: async () => {
        throw new RateLimitUnavailableError("down");
      },
    };
    expect(await takeDraftCall("draft_rationale", "teacher-a", down)).toBe("unavailable");
    const odd: RateLimitStore = {
      hit: async () => {
        throw "not an error";
      },
    };
    expect(await takeDraftCall("draft_variant", "teacher-a", odd)).toBe("unavailable");
    // What is logged names the error's kind, never the teacher.
    expect(JSON.stringify(error.mock.calls)).not.toContain("teacher-a");
  });
});
