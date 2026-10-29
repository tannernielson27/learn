import { describe, expect, it, vi } from "vitest";
import { RateLimitUnavailableError } from "@/lib/rateLimit/store";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import { BETA_PASS_REDEEM_LIMIT, takeBetaPassAttempt } from "./redeemLimit";

const from = (ip: string, extra: Record<string, string> = {}) =>
  new Headers({ "x-vercel-id": "iad1::test", "x-vercel-forwarded-for": ip, ...extra });

describe("takeBetaPassAttempt", () => {
  it("lets a caller through until its budget is spent, then refuses", async () => {
    const store = createMemoryRateLimitStore();
    for (let i = 0; i < BETA_PASS_REDEEM_LIMIT.attempts; i += 1) {
      expect(await takeBetaPassAttempt(from("203.0.113.1"), store)).toEqual({ ok: true });
    }
    expect(await takeBetaPassAttempt(from("203.0.113.1"), store)).toEqual({
      ok: false,
      reason: "rate_limited",
    });
    expect(await takeBetaPassAttempt(from("203.0.113.2"), store)).toEqual({ ok: true });
  });

  it("keys on the address the platform reports, never one the caller sends", async () => {
    const store = createMemoryRateLimitStore();
    await takeBetaPassAttempt(from("203.0.113.9", { "x-forwarded-for": "198.51.100.1" }), store);
    expect(store.hits()).toEqual([{ bucket: "beta_pass_redeem", key: "203.0.113.9" }]);
  });

  it("counts nothing off the platform, where no address can be trusted", async () => {
    const store = createMemoryRateLimitStore();
    expect(
      await takeBetaPassAttempt(new Headers({ "x-forwarded-for": "127.0.0.1" }), store),
    ).toEqual({ ok: true });
    expect(store.hits()).toEqual([]);
  });

  it("fails closed when the store cannot answer, and logs no address", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = createMemoryRateLimitStore();
    store.failWith(new RateLimitUnavailableError("08006"));
    expect(await takeBetaPassAttempt(from("203.0.113.3"), store)).toEqual({
      ok: false,
      reason: "unavailable",
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("203.0.113.3");
    logged.mockRestore();
  });
});
