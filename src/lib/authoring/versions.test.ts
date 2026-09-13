import { describe, expect, it } from "vitest";
import { nextPublishedVersion } from "./versions";

describe("nextPublishedVersion", () => {
  it("starts at 1 when the item has never been published", () => {
    expect(nextPublishedVersion(null)).toBe(1);
  });

  it("follows the latest recorded version", () => {
    expect(nextPublishedVersion(1)).toBe(2);
    expect(nextPublishedVersion(41)).toBe(42);
  });

  it.each([[0], [-3], [1.5], [Number.NaN]])(
    "starts again at 1 rather than trusting a malformed latest version %s",
    (latest) => {
      expect(nextPublishedVersion(latest)).toBe(1);
    },
  );
});
