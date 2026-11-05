import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LegalLinks, SiteFooter } from "./SiteFooter";

describe("SiteFooter (#522)", () => {
  it("links to pricing, help, terms, privacy and support", () => {
    render(<SiteFooter />);
    const nav = within(screen.getByRole("contentinfo")).getByRole("navigation", {
      name: "Footer",
    });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Pricing", "/pricing"],
      ["Help", "/help"],
      ["Terms", "/terms"],
      ["Privacy", "/privacy"],
      ["Contact", "mailto:support@learnursing.app"],
    ]);
  });

  it("says every patient is fictional and carries this year's copyright", () => {
    render(<SiteFooter />);
    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent("Every patient shown in LeaRN is fictional.");
    expect(footer).toHaveTextContent(`© ${new Date().getFullYear()} LeaRN`);
  });
});

describe("LegalLinks (#522)", () => {
  it("is one short line of terms, privacy and contact, and nothing else", () => {
    render(<LegalLinks />);
    const nav = screen.getByRole("navigation", { name: "Legal" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Terms", "/terms"],
      ["Privacy", "/privacy"],
      ["Contact", "mailto:support@learnursing.app"],
    ]);
  });
});
