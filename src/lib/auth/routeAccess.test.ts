import { describe, expect, it } from "vitest";
import { redirectForAccess } from "./routeAccess";

const at = (pathAndQuery: string) => new URL(`https://learn.example${pathAndQuery}`);

describe("redirectForAccess", () => {
  it.each([["/author"], ["/author/banks/1"], ["/author/items/9?mode=preview"]])(
    "sends a signed-out visit to %s through sign-in, then back",
    (path) => {
      const target = redirectForAccess(at(path), false);
      expect(target?.pathname).toBe("/sign-in");
      expect(target?.searchParams.get("next")).toBe(path);
    },
  );

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
  ])("leaves a signed-out visit to %s alone", (path) => {
    expect(redirectForAccess(at(path), false)).toBeNull();
  });
});
