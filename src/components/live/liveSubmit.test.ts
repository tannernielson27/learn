import { describe, expect, it } from "vitest";
import { LiveSessionError } from "@/lib/live/errors";
import { liveSubmitFailure } from "./liveSubmit";

describe("liveSubmitFailure", () => {
  it("gives the room's own sentence for a refusal", () => {
    expect(liveSubmitFailure(new LiveSessionError("wrong_item"))).toBe(
      "The session has moved on to another item.",
    );
    expect(liveSubmitFailure(new LiveSessionError("rate_limited"))).toBe(
      "Too many requests from this device. Wait a moment and try again.",
    );
  });

  it("says the answer was not sent when the request itself failed", () => {
    expect(liveSubmitFailure(new TypeError("Failed to fetch"))).toBe(
      "Your answer was not sent. Try again.",
    );
  });
});
