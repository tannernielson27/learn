import { describe, expect, it } from "vitest";
import {
  BANNER_FIXTURE_NAMES,
  bannerFixture,
  bannerFixtureLabel,
  parseBannerFixture,
} from "./bannerFixtures";

describe("banner fixtures", () => {
  it.each(BANNER_FIXTURE_NAMES)("%s draws a banner with a label", (name) => {
    expect(bannerFixture(name).message).not.toBe("");
    expect(bannerFixtureLabel(name)).not.toBe("");
  });

  it("covers every kind, for both the founder and another teacher", () => {
    const banners = BANNER_FIXTURE_NAMES.map(bannerFixture);
    expect(new Set(banners.map((b) => b.kind))).toEqual(
      new Set(["trial_ending", "payment_failed", "subscription_ending", "access_ended"]),
    );
    expect(banners.some((b) => b.link === null)).toBe(true);
  });

  it("falls back to the trial for an unknown name", () => {
    expect(parseBannerFixture("payment-failed")).toBe("payment-failed");
    expect(parseBannerFixture("nope")).toBe("trial-ending");
    expect(parseBannerFixture(undefined)).toBe("trial-ending");
  });
});
