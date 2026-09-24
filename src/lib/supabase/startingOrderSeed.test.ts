import { afterEach, describe, expect, it, vi } from "vitest";
import { startingOrderSeed } from "@/lib/ngn/startingOrder";
import { secretStartingOrderSeed } from "./startingOrderSeed";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("secretStartingOrderSeed (#219)", () => {
  it("is a keyed digest a student cannot compute from the ids they can see", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_one");
    const seed = secretStartingOrderSeed("session-1", "item-1");
    expect(seed).toMatch(/^[0-9a-f]{64}$/);
    expect(seed).not.toContain("session-1");
    expect(seed).not.toBe(startingOrderSeed("session-1", "item-1"));
  });

  it("is stable for one scope and item, and differs across scopes, items and secrets", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_one");
    const seed = secretStartingOrderSeed("session-1", "item-1");
    expect(secretStartingOrderSeed("session-1", "item-1")).toBe(seed);
    expect(secretStartingOrderSeed("session-2", "item-1")).not.toBe(seed);
    expect(secretStartingOrderSeed("session-1", "item-2")).not.toBe(seed);
    // The separator cannot be forged by moving characters between the two ids.
    expect(secretStartingOrderSeed("a:b", "c")).not.toBe(secretStartingOrderSeed("a", "b:c"));
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_test_two");
    expect(secretStartingOrderSeed("session-1", "item-1")).not.toBe(seed);
  });

  it("falls back to the public seed only where there is no server secret at all", () => {
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    expect(secretStartingOrderSeed("session-1", "item-1")).toBe(
      startingOrderSeed("session-1", "item-1"),
    );
  });
});
