import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BANNER_FIXTURE_NAMES, bannerFixture } from "@/lib/billing/bannerFixtures";
import { BillingBanner } from "./BillingBanner";

const region = () => screen.getByRole("region", { name: "Billing notice" });

describe("BillingBanner", () => {
  it("draws nothing without a banner", () => {
    const { container } = render(<BillingBanner banner={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("a trial ending, for the person who started the workspace: the date and Manage billing", () => {
    render(<BillingBanner banner={bannerFixture("trial-ending")} />);
    expect(region()).toHaveTextContent("Your free trial ends on 5 November 2026.");
    const link = screen.getByRole("link", { name: "Manage billing" });
    expect(link).toHaveAttribute("href", "/author/workspace#billing-heading");
  });

  it("a payment failed, for another teacher: who manages billing, and no link", () => {
    render(<BillingBanner banner={bannerFixture("payment-failed-colleague")} />);
    expect(region()).toHaveTextContent("Your last payment did not go through.");
    expect(region()).toHaveTextContent("The person who started your workspace manages billing.");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("free access ended, for the person who started the workspace: the way to start again", () => {
    render(<BillingBanner banner={bannerFixture("access-ended")} />);
    expect(region()).toHaveTextContent("Your free access has ended.");
    expect(screen.getByRole("link", { name: "Start a free trial or subscribe" })).toBeVisible();
  });

  it.each(BANNER_FIXTURE_NAMES)("%s: plain words, nothing the glossary rules out", (name) => {
    render(<BillingBanner banner={bannerFixture(name)} />);
    expect(region()).not.toHaveTextContent(
      /\b(org|organi[sz]ation|founder|member|seat|paywall|beta|grandfather\w*|pass|plan)\b/i,
    );
    // No emoji: every character is plain text.
    expect(region().textContent ?? "").not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
