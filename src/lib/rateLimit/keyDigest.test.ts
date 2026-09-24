import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RATE_LIMIT_KEY_LABEL, deriveRateLimitKey, digestRateLimitKey } from "./keyDigest";

describe("deriveRateLimitKey", () => {
  it("is an HMAC of a fixed label under the server secret, not the secret itself", () => {
    const derived = deriveRateLimitKey("sb_secret_abc");
    expect(derived.equals(Buffer.from("sb_secret_abc"))).toBe(false);
    expect(derived.toString("hex")).toBe(
      createHmac("sha256", "sb_secret_abc").update(RATE_LIMIT_KEY_LABEL).digest("hex"),
    );
  });

  it("refuses an empty secret rather than hashing under a known key", () => {
    expect(() => deriveRateLimitKey("")).toThrow();
    expect(() => deriveRateLimitKey("   ")).toThrow();
  });
});

describe("digestRateLimitKey", () => {
  const key = deriveRateLimitKey("sb_secret_abc");

  it("is 64 lower-case hex digits", () => {
    expect(digestRateLimitKey(key, "sign_in_email", "203.0.113.7")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not let the bucket and key run together", () => {
    // "a" + "b\nc" and "a\nb" + "c" must not collide.
    expect(digestRateLimitKey(key, "a", "b\nc")).not.toBe(digestRateLimitKey(key, "a\nb", "c"));
  });
});
