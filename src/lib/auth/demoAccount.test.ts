import { describe, expect, it, vi } from "vitest";
import {
  DEMO_FAILED,
  DEMO_UNAVAILABLE,
  readDemoAccount,
  signInToDemo,
  type DemoAccount,
} from "./demoAccount";

const ACCOUNT: DemoAccount = { email: "demo@learn.test", password: "a-long-password" };

describe("readDemoAccount", () => {
  it("returns the account when both values are set", () => {
    expect(readDemoAccount({ email: " Demo@Learn.test ", password: "a-long-password" })).toEqual(
      ACCOUNT,
    );
  });

  it("is off when either value is missing", () => {
    expect(readDemoAccount({ email: undefined, password: "a-long-password" })).toBeNull();
    expect(readDemoAccount({ email: "demo@learn.test", password: undefined })).toBeNull();
    expect(readDemoAccount({ email: "", password: "" })).toBeNull();
  });

  it("is off when the email is not an address", () => {
    expect(readDemoAccount({ email: "demo", password: "a-long-password" })).toBeNull();
  });

  it("is off when the password is too short to be real", () => {
    expect(readDemoAccount({ email: "demo@learn.test", password: "short" })).toBeNull();
  });

  it("reads the server-only environment by default", () => {
    vi.stubEnv("DEMO_ACCOUNT_EMAIL", "demo@learn.test");
    vi.stubEnv("DEMO_ACCOUNT_PASSWORD", "a-long-password");
    try {
      expect(readDemoAccount()).toEqual(ACCOUNT);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("signInToDemo", () => {
  it("signs in with the configured account and returns the safe next path", async () => {
    const signIn = vi.fn(async () => ({ error: null }));
    const result = await signInToDemo(ACCOUNT, "/author/banks/1", signIn);
    expect(signIn).toHaveBeenCalledWith({ email: ACCOUNT.email, password: ACCOUNT.password });
    expect(result).toEqual({ ok: true, next: "/author/banks/1" });
  });

  it("never follows an unsafe next path", async () => {
    const signIn = vi.fn(async () => ({ error: null }));
    expect(await signInToDemo(ACCOUNT, "//evil.example", signIn)).toEqual({
      ok: true,
      next: "/author",
    });
    expect(await signInToDemo(ACCOUNT, null, signIn)).toEqual({ ok: true, next: "/author" });
  });

  it("refuses without calling Supabase when the demo is not configured", async () => {
    const signIn = vi.fn(async () => ({ error: null }));
    expect(await signInToDemo(null, "/author", signIn)).toEqual({
      ok: false,
      error: DEMO_UNAVAILABLE,
    });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("gives a generic reason when Supabase refuses, never its own message", async () => {
    const signIn = vi.fn(async () => ({ error: new Error("Invalid login credentials") }));
    expect(await signInToDemo(ACCOUNT, "/author", signIn)).toEqual({
      ok: false,
      error: DEMO_FAILED,
    });
  });

  it("gives the same reason when the call throws", async () => {
    const signIn = vi.fn(async () => {
      throw new Error("network down");
    });
    expect(await signInToDemo(ACCOUNT, "/author", signIn)).toEqual({
      ok: false,
      error: DEMO_FAILED,
    });
  });
});
