import { describe, expect, it, vi } from "vitest";
import { RateLimitUnavailableError } from "@/lib/rateLimit/store";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import { BILLING_SESSION_LIMIT, takeBillingSession } from "./sessionLimit";

const USER = "c4a1e8b2-3f6d-4a90-8c71-5b2e9d0f6a34";
const OTHER = "0b9f3c1e-7a52-4d0c-9a51-2f6c1d8e4b10";

describe("takeBillingSession", () => {
  it("lets a teacher through until their budget is spent, then refuses only them", async () => {
    const store = createMemoryRateLimitStore();
    for (let i = 0; i < BILLING_SESSION_LIMIT.attempts; i += 1) {
      expect(await takeBillingSession(USER, store)).toBe("ok");
    }
    expect(await takeBillingSession(USER, store)).toBe("rate_limited");
    expect(await takeBillingSession(OTHER, store)).toBe("ok");
    expect(store.hits()[0]).toEqual({ bucket: "billing_session", key: USER });
  });

  it("fails closed when the store cannot answer", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = createMemoryRateLimitStore();
    store.failWith(new RateLimitUnavailableError("08006"));
    expect(await takeBillingSession(USER, store)).toBe("unavailable");
    expect(JSON.stringify(logged.mock.calls)).not.toContain(USER);
    logged.mockRestore();
  });
});
