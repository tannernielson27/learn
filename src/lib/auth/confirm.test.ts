import { describe, expect, it, vi } from "vitest";
import { confirmRedirect } from "./confirm";

const ORIGIN = "https://learn.example";
const ok = vi.fn(async () => ({ error: null }));

function url(query: string): URL {
  return new URL(`${ORIGIN}/auth/confirm?${query}`);
}

describe("confirmRedirect", () => {
  it("verifies the token hash and sends the person to their safe next path", async () => {
    const verify = vi.fn(async () => ({ error: null }));
    const target = await confirmRedirect(
      url("next=/author/banks/1&token_hash=abc&type=email"),
      verify,
    );
    expect(verify).toHaveBeenCalledWith({ token_hash: "abc", type: "email" });
    expect(target.toString()).toBe(`${ORIGIN}/author/banks/1`);
  });

  it("never follows an unsafe next, even with a valid link", async () => {
    const target = await confirmRedirect(url("next=//evil.example&token_hash=abc&type=email"), ok);
    expect(target.toString()).toBe(`${ORIGIN}/author`);
  });

  it("sends a failed verification back to sign-in with a reason, keeping next", async () => {
    const verify = vi.fn(async () => ({ error: new Error("Token has expired or is invalid") }));
    const target = await confirmRedirect(url("next=/author&token_hash=old&type=email"), verify);
    expect(target.pathname).toBe("/sign-in");
    expect(target.searchParams.get("error")).toBe("link");
    expect(target.searchParams.get("next")).toBe("/author");
    expect(target.toString()).not.toContain("expired");
  });

  it.each([
    ["missing token", "next=/author&type=email"],
    ["missing type", "next=/author&token_hash=abc"],
    ["unexpected type", "next=/author&token_hash=abc&type=recovery"],
  ])("rejects a %s without calling Supabase", async (_name, query) => {
    const verify = vi.fn(async () => ({ error: null }));
    const target = await confirmRedirect(url(query), verify);
    expect(verify).not.toHaveBeenCalled();
    expect(target.pathname).toBe("/sign-in");
    expect(target.searchParams.get("error")).toBe("link");
  });

  it("treats a thrown verification as a failed link", async () => {
    const verify = vi.fn(async () => {
      throw new Error("network");
    });
    const target = await confirmRedirect(url("token_hash=abc&type=email"), verify);
    expect(target.pathname).toBe("/sign-in");
  });
});
