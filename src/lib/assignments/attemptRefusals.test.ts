import { describe, expect, it } from "vitest";
import { ATTEMPT_REFUSALS, FINAL_REFUSALS, asAttemptRefusal } from "./attemptRefusals";

describe("asAttemptRefusal", () => {
  it("reads no refusal as null", () => {
    expect(asAttemptRefusal(null)).toBeNull();
    expect(asAttemptRefusal(undefined)).toBeNull();
    expect(asAttemptRefusal("")).toBeNull();
  });

  it("passes a known code through", () => {
    expect(asAttemptRefusal("closed")).toBe("closed");
    expect(asAttemptRefusal("no_attempts_left")).toBe("no_attempts_left");
  });

  it("turns an unknown code or a non-string into a fault, never into a blank message", () => {
    expect(asAttemptRefusal("something_new")).toBe("failed");
    expect(asAttemptRefusal(42)).toBe("failed");
  });

  it("has a sentence for every code, final or not", () => {
    for (const code of FINAL_REFUSALS) expect(ATTEMPT_REFUSALS[code]).toMatch(/\.$/);
    expect(FINAL_REFUSALS.has("rate_limited")).toBe(false);
    expect(FINAL_REFUSALS.has("failed")).toBe(false);
  });
});
