import { describe, expect, it } from "vitest";
import { redirectForAccess } from "./routeAccess";

const at = (pathAndQuery: string) => new URL(`https://learn.example${pathAndQuery}`);

describe("redirectForAccess", () => {
  it.each([
    ["/author"],
    ["/author/banks/1"],
    ["/author/items/9?mode=preview"],
    ["/learn"],
    ["/account/password?next=%2Flearn"],
    ["/welcome"],
    ["/welcome?code=ABCD2345"],
  ])("sends a signed-out visit to %s through sign-in, then back", (path) => {
    const target = redirectForAccess(at(path), false);
    expect(target?.pathname).toBe("/sign-in");
    expect(target?.searchParams.get("next")).toBe(path);
  });

  it("lets a signed-in author through", () => {
    expect(redirectForAccess(at("/author/banks/1"), true)).toBeNull();
  });

  it("moves a signed-in visit to sign-in on to where they were going", () => {
    expect(redirectForAccess(at("/sign-in?next=/author/banks/2"), true)?.toString()).toBe(
      "https://learn.example/author/banks/2",
    );
    expect(redirectForAccess(at("/sign-in?next=https://evil.example"), true)?.pathname).toBe(
      "/author",
    );
  });

  it.each([
    ["/"],
    ["/gallery"],
    ["/gallery/items/bowtie"],
    ["/sign-in"],
    ["/auth/confirm"],
    ["/authors"],
    ["/learning"],
    ["/accounts"],
    // Sign-up (#361) is for people who have no account yet, as the invite page is.
    ["/sign-up"],
    ["/sign-up?role=teacher"],
    ["/welcomes"],
    // The invite page is for people who have no account yet.
    ["/c/AbC_-0123456789abcdefghijklmnopq"],
    // A workspace invitation is too: the colleague may have no account.
    ["/w/AbC_-0123456789abcdefghijklmnopq"],
  ])("leaves a signed-out visit to %s alone", (path) => {
    expect(redirectForAccess(at(path), false)).toBeNull();
  });

  it("leaves a signed-in visit to a workspace invitation alone, whoever it is", () => {
    expect(redirectForAccess(at("/w/AbC_-0123456789abcdefghijklmnopq"), true)).toBeNull();
  });

  it("sends someone who signed in to accept an invitation back to it", () => {
    const next = encodeURIComponent("/w/AbC_-0123456789abcdefghijklmnopq");
    expect(redirectForAccess(at(`/sign-in?next=${next}`), true)?.toString()).toBe(
      "https://learn.example/w/AbC_-0123456789abcdefghijklmnopq",
    );
  });
});
