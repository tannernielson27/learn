import { describe, expect, it, vi } from "vitest";
import { RateLimitUnavailableError } from "@/lib/rateLimit/store";
import { createMemoryRateLimitStore } from "@/lib/rateLimit/testing/memoryStore";
import { WELCOME_EMAIL_CEILING, takeWelcomeEmail } from "./welcomeLimit";

const logged = vi.spyOn(console, "error").mockImplementation(() => {});
const warned = vi.spyOn(console, "warn").mockImplementation(() => {});

describe("takeWelcomeEmail", () => {
  it("allows the deployment's ceiling of welcome emails in a window, then refuses, out loud", async () => {
    const store = createMemoryRateLimitStore();
    for (let i = 0; i < WELCOME_EMAIL_CEILING.attempts; i += 1) {
      expect(await takeWelcomeEmail(store)).toBe(true);
    }
    expect(await takeWelcomeEmail(store)).toBe(false);
    expect(warned).toHaveBeenCalledTimes(1);
    // One bucket, one key: the whole deployment, never an address.
    expect(new Set(store.hits().map((hit) => `${hit.bucket}:${hit.key}`))).toEqual(
      new Set(["welcome_email:deployment"]),
    );
  });

  it("stands in for Supabase's Auth email limit, which this email no longer passes through", () => {
    expect(WELCOME_EMAIL_CEILING).toEqual({ attempts: 150, windowMs: 60 * 60 * 1000 });
  });

  it("sends nothing when the shared store cannot answer", async () => {
    const store = createMemoryRateLimitStore();
    store.failWith(new RateLimitUnavailableError("PGRST301"));
    expect(await takeWelcomeEmail(store)).toBe(false);
    expect(logged).toHaveBeenCalledTimes(1);
  });
});
