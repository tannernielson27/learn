import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteHeader } from "./SiteHeader";
import { Wordmark } from "./Wordmark";

describe("Wordmark (#563)", () => {
  it("reads as LeaRN, one word, and goes home", () => {
    render(<Wordmark />);
    const link = screen.getByRole("link", { name: "LeaRN" });
    expect(link).toHaveAttribute("href", "/");
    // One spoken name, whatever the layout does to the drawn parts (a flex box spaces them, #576).
    expect(link.querySelector(".sr-only")?.textContent).toBe("LeaRN");
    for (const part of link.querySelectorAll("span:not(.sr-only)")) {
      expect(part).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("sets RN apart, for the registered nurse in the name", () => {
    render(<Wordmark />);
    const rn = screen.getByText("RN");
    expect(rn.className).toContain("border");
    expect(screen.getByText("Lea")).not.toHaveClass("border");
  });
});

describe("SiteHeader (#563)", () => {
  it("is a banner with the wordmark home, then Pricing and Sign in", () => {
    render(<SiteHeader />);
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("link", { name: "LeaRN" })).toHaveAttribute("href", "/");
    const site = within(header).getByRole("navigation", { name: "Site" });
    expect(
      within(site)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Pricing", "/pricing"],
      ["Sign in", "/sign-in"],
    ]);
  });

  it("leaves Sign in out when asked, for someone already signed in", () => {
    render(<SiteHeader signIn={false} />);
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
    expect(screen.getByRole("link", { name: "Pricing" })).toBeInTheDocument();
  });
});
