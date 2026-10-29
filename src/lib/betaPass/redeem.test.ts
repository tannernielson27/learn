import { describe, expect, it, vi } from "vitest";
import { BETA_PASS_RATE_LIMITED, BETA_PASS_UNAVAILABLE } from "./link";
import { type RedeemDeps, redeemAsSignedIn } from "./redeem";

const TOKEN = "AbC_-0123456789abcdefghijklmnopq";
const USER = "00000000-0000-4000-8000-0000000000a1";

function deps(overrides: Partial<RedeemDeps> = {}): RedeemDeps {
  return {
    allow: vi.fn(async () => ({ ok: true }) as const),
    currentUser: vi.fn(async () => USER),
    redeem: vi.fn(async () => "redeemed" as const),
    ...overrides,
  };
}

describe("redeemAsSignedIn", () => {
  it("redeems for the verified account", async () => {
    const d = deps();
    expect(await redeemAsSignedIn(TOKEN, d)).toEqual({ status: "redeemed" });
    expect(d.redeem).toHaveBeenCalledWith(USER, TOKEN);
  });

  it("answers every refusal from the database with the one neutral state", async () => {
    const d = deps({ redeem: vi.fn(async () => "refused" as const) });
    expect(await redeemAsSignedIn(TOKEN, d)).toEqual({ status: "unusable" });
  });

  it("checks the network's budget before anything else", async () => {
    const d = deps({ allow: vi.fn(async () => ({ ok: false, reason: "rate_limited" }) as const) });
    expect(await redeemAsSignedIn(TOKEN, d)).toEqual({
      status: "error",
      error: BETA_PASS_RATE_LIMITED,
    });
    expect(d.currentUser).not.toHaveBeenCalled();
    expect(d.redeem).not.toHaveBeenCalled();
  });

  it("refuses when the limiter cannot answer", async () => {
    const d = deps({ allow: vi.fn(async () => ({ ok: false, reason: "unavailable" }) as const) });
    expect(await redeemAsSignedIn(TOKEN, d)).toEqual({
      status: "error",
      error: BETA_PASS_UNAVAILABLE,
    });
    expect(d.redeem).not.toHaveBeenCalled();
  });

  it("sends someone signed out meanwhile back to the page", async () => {
    const d = deps({ currentUser: vi.fn(async () => null) });
    expect(await redeemAsSignedIn(TOKEN, d)).toEqual({ status: "signed_out" });
    expect(d.redeem).not.toHaveBeenCalled();
  });

  it("says the page is not working when the database does not answer", async () => {
    const d = deps({ redeem: vi.fn(async () => "unavailable" as const) });
    expect(await redeemAsSignedIn(TOKEN, d)).toEqual({
      status: "error",
      error: BETA_PASS_UNAVAILABLE,
    });
  });
});
