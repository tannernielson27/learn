import { describe, expect, it, vi } from "vitest";
import {
  isEmailUnconfirmed,
  markEmailConfirmed,
  type MarkConfirmedDeps,
} from "./emailConfirmation";

const UNCONFIRMED = { sub: "user-1", app_metadata: { learn_email_unconfirmed: true } };

describe("isEmailUnconfirmed", () => {
  it("is true only for the key set to true in app_metadata", () => {
    expect(isEmailUnconfirmed(UNCONFIRMED)).toBe(true);
    expect(isEmailUnconfirmed({ app_metadata: { learn_email_unconfirmed: "true" } })).toBe(false);
    expect(isEmailUnconfirmed({ app_metadata: { learn_invite: {} } })).toBe(false);
    expect(isEmailUnconfirmed({ app_metadata: null })).toBe(false);
    expect(isEmailUnconfirmed({})).toBe(false);
    expect(isEmailUnconfirmed(null)).toBe(false);
  });

  it("never reads user_metadata, which the account itself can write", () => {
    const claims = { user_metadata: { learn_email_unconfirmed: true } };
    expect(isEmailUnconfirmed(claims)).toBe(false);
  });
});

function deps(overrides: Partial<MarkConfirmedDeps> = {}): MarkConfirmedDeps {
  return {
    claims: vi.fn(async () => UNCONFIRMED),
    clear: vi.fn(async () => ({ error: null })),
    refresh: vi.fn(async () => ({ error: null })),
    ...overrides,
  };
}

describe("markEmailConfirmed", () => {
  it("removes the key for that account, then refreshes this browser's token", async () => {
    const d = deps();
    await markEmailConfirmed(d);
    expect(d.clear).toHaveBeenCalledWith("user-1");
    expect(d.refresh).toHaveBeenCalledTimes(1);
  });

  it("does nothing for an account that was never marked", async () => {
    const d = deps({ claims: vi.fn(async () => ({ sub: "user-2", app_metadata: {} })) });
    await markEmailConfirmed(d);
    expect(d.clear).not.toHaveBeenCalled();
    expect(d.refresh).not.toHaveBeenCalled();
  });

  it("never throws, and leaves the token alone when the key could not be removed", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const failing = deps({ clear: vi.fn(async () => ({ error: { status: 500 } })) });
    await markEmailConfirmed(failing);
    expect(failing.refresh).not.toHaveBeenCalled();
    const throwing = deps({
      claims: vi.fn(async () => {
        throw new Error("network");
      }),
    });
    await expect(markEmailConfirmed(throwing)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });
});
