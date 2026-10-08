import { describe, expect, it, vi } from "vitest";
import { confirmLink, readConfirmLink } from "./confirm";

const ok = vi.fn(async () => ({ error: null }));

const FAILED = "/sign-in?error=link&next=%2Fauthor";

describe("readConfirmLink", () => {
  it("accepts a token hash of type email and keeps the safe next", () => {
    expect(readConfirmLink({ token_hash: "abc", type: "email", next: "/learn" })).toEqual({
      ok: true,
      tokenHash: "abc",
      next: "/learn",
    });
  });

  it("never keeps an unsafe next, even with a valid link", () => {
    const read = readConfirmLink({ token_hash: "abc", type: "email", next: "//evil.example" });
    expect(read).toEqual({ ok: true, tokenHash: "abc", next: "/author" });
  });

  it.each([
    ["missing token", { type: "email", next: "/author" }],
    ["empty token", { token_hash: "", type: "email", next: "/author" }],
    ["missing type", { token_hash: "abc", next: "/author" }],
    ["unexpected type", { token_hash: "abc", type: "recovery", next: "/author" }],
    ["oversized token", { token_hash: "a".repeat(513), type: "email", next: "/author" }],
    ["repeated token", { token_hash: ["a", "b"], type: "email", next: "/author" }],
  ])("refuses a %s, sending the person to sign-in with next kept", (_name, params) => {
    expect(readConfirmLink(params)).toEqual({ ok: false, failed: FAILED });
  });
});

describe("confirmLink", () => {
  it("verifies the token hash and answers the safe next path", async () => {
    const verify = vi.fn(async () => ({ error: null }));
    const target = await confirmLink(
      { token_hash: "abc", type: "email", next: "/author/banks/1" },
      verify,
    );
    expect(verify).toHaveBeenCalledWith({ token_hash: "abc", type: "email" });
    expect(target).toBe("/author/banks/1");
  });

  it("answers sign-in with a generic reason when verification fails, keeping next", async () => {
    const verify = vi.fn(async () => ({ error: new Error("Token has expired or is invalid") }));
    const target = await confirmLink({ token_hash: "old", type: "email", next: "/author" }, verify);
    expect(target).toBe(FAILED);
    expect(target).not.toContain("expired");
  });

  it("treats a thrown verification as a failed link", async () => {
    const verify = vi.fn(async () => {
      throw new Error("network");
    });
    expect(await confirmLink({ token_hash: "abc", type: "email", next: "/author" }, verify)).toBe(
      FAILED,
    );
  });

  it("never calls Supabase for a link that does not read", async () => {
    const verify = vi.fn(async () => ({ error: null }));
    const target = await confirmLink({ token_hash: null, type: "email", next: "/author" }, verify);
    expect(verify).not.toHaveBeenCalled();
    expect(target).toBe(FAILED);
  });

  it("reads form values as they arrive, ignoring anything that is not a string", async () => {
    const form = new FormData();
    form.set("token_hash", new File(["abc"], "x.txt"));
    form.set("type", "email");
    expect(
      await confirmLink(
        { token_hash: form.get("token_hash"), type: form.get("type"), next: form.get("next") },
        ok,
      ),
    ).toBe(FAILED);
  });
});
