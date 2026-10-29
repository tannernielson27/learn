import { describe, expect, it } from "vitest";
import {
  betaPassPath,
  betaPassResponseHeaders,
  isBetaPassPath,
  signInToRedeemPath,
  signUpToRedeemPath,
} from "./link";

const TOKEN = "AbC_-0123456789abcdefghijklmnopq";
const NO_REFERRER = { "Referrer-Policy": "no-referrer" };

describe("betaPassPath", () => {
  it("is /b/<token>", () => {
    expect(betaPassPath(TOKEN)).toBe(`/b/${TOKEN}`);
  });

  it("escapes and clips anything that is not a token", () => {
    expect(betaPassPath("../x?y")).toBe("/b/..%2Fx%3Fy");
    expect(betaPassPath("a".repeat(5000)).length).toBeLessThan(5000);
  });

  it("is recognised, and nothing else is", () => {
    expect(isBetaPassPath(`/b/${TOKEN}`)).toBe(true);
    expect(isBetaPassPath("/b")).toBe(false);
    expect(isBetaPassPath("/bank")).toBe(false);
  });
});

describe("the pages that come back to it", () => {
  it("signs in and returns", () => {
    expect(signInToRedeemPath(TOKEN)).toBe(`/sign-in?next=${encodeURIComponent(`/b/${TOKEN}`)}`);
  });

  it("signs up as a teacher and returns", () => {
    expect(signUpToRedeemPath(TOKEN)).toBe(
      `/sign-up?role=teacher&next=${encodeURIComponent(`/b/${TOKEN}`)}`,
    );
  });
});

describe("betaPassResponseHeaders", () => {
  it("sends no Referer from the page", () => {
    expect(betaPassResponseHeaders(`/b/${TOKEN}`)).toEqual(NO_REFERRER);
  });

  it("nor from sign-in or sign-up while they carry the page in next, however deep", () => {
    const next = encodeURIComponent(`/b/${TOKEN}`);
    expect(betaPassResponseHeaders("/sign-in", `?next=${next}`)).toEqual(NO_REFERRER);
    expect(betaPassResponseHeaders("/sign-up", `?role=teacher&next=${next}`)).toEqual(NO_REFERRER);
    const nested = encodeURIComponent(`/sign-in?next=${next}`);
    expect(betaPassResponseHeaders("/sign-in/password", `?next=${nested}`)).toEqual(NO_REFERRER);
  });

  it("adds nothing anywhere else", () => {
    expect(betaPassResponseHeaders("/author")).toEqual({});
    expect(betaPassResponseHeaders("/sign-in", "?next=/author")).toEqual({});
    expect(betaPassResponseHeaders("/w/x")).toEqual({});
  });
});
