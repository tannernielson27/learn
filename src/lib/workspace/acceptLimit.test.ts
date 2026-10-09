import { describe, expect, it, vi } from "vitest";
import { RateLimitUnavailableError } from "@/lib/rateLimit/store";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import {
  INVITE_ACCEPT_LIMIT,
  INVITE_ACCEPT_RATE_LIMITED,
  INVITE_ACCEPT_UNAVAILABLE,
  takeInviteAcceptAttempt,
} from "./acceptLimit";

const from = (ip: string, extra: Record<string, string> = {}) =>
  new Headers({ "x-vercel-id": "iad1::test", "x-vercel-forwarded-for": ip, ...extra });

describe("takeInviteAcceptAttempt", () => {
  it("lets a caller through until its budget is spent, then refuses", async () => {
    const store = createMemoryRateLimitStore();
    for (let i = 0; i < INVITE_ACCEPT_LIMIT.attempts; i += 1) {
      expect(await takeInviteAcceptAttempt(from("203.0.113.1"), store)).toEqual({ ok: true });
    }
    expect(await takeInviteAcceptAttempt(from("203.0.113.1"), store)).toEqual({
      ok: false,
      error: INVITE_ACCEPT_RATE_LIMITED,
    });
    // Another caller has its own budget.
    expect(await takeInviteAcceptAttempt(from("203.0.113.2"), store)).toEqual({ ok: true });
  });

  it("keys on the address the platform reports, never one the caller sends", async () => {
    const store = createMemoryRateLimitStore();
    await takeInviteAcceptAttempt(
      from("203.0.113.9", { "x-forwarded-for": "198.51.100.1" }),
      store,
    );
    expect(store.hits()).toEqual([{ bucket: "workspace_invite_accept", key: "203.0.113.9" }]);
  });

  it("counts nothing off the platform, where no address can be trusted", async () => {
    const store = createMemoryRateLimitStore();
    const local = new Headers({ "x-forwarded-for": "127.0.0.1" });
    expect(await takeInviteAcceptAttempt(local, store)).toEqual({ ok: true });
    expect(store.hits()).toEqual([]);
  });

  it("fails closed when the store cannot answer", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const store = createMemoryRateLimitStore();
    store.failWith(new RateLimitUnavailableError("08006"));
    expect(await takeInviteAcceptAttempt(from("203.0.113.3"), store)).toEqual({
      ok: false,
      error: INVITE_ACCEPT_UNAVAILABLE,
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("203.0.113.3");
    logged.mockRestore();
  });
});
