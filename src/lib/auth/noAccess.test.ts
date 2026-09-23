import { describe, expect, it } from "vitest";
import { NO_ACCESS_PATH, noAccessRedirect } from "./noAccess";

describe("noAccessRedirect", () => {
  it("keeps an account with no role on the page", () => {
    expect(noAccessRedirect("forbidden")).toBeNull();
  });

  it("sends an author home, since the page is not about them", () => {
    expect(noAccessRedirect("ok")).toBe("/author");
  });

  it("sends a signed-out visitor to sign in, back to authoring after", () => {
    expect(noAccessRedirect("signed_out")).toBe("/sign-in?next=%2Fauthor");
  });

  it("names the page requireAuthor sends people to", () => {
    expect(NO_ACCESS_PATH).toBe("/author/no-access");
  });
});
