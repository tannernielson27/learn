import { describe, expect, it } from "vitest";
import { BILLING_PRICE, BILLING_TRIAL_DAYS } from "@/lib/billing/billingCopy";
import { WORKSPACE_MEMBER_CAP } from "@/lib/workspace/workspace";
import {
  OFFER_DESCRIPTION,
  OFFER_FACTS,
  OFFER_PRICE,
  OFFER_SUMMARY,
  OFFER_TEACHERS,
  OFFER_TRIAL,
  OFFER_TRIAL_DAYS,
  OFFER_TRIAL_TERMS,
} from "./offer";

describe("the public offer (#563)", () => {
  it("reads its numbers from billing and the workspace's limits", () => {
    expect(BILLING_PRICE).toBe(`${OFFER_PRICE} a month`);
    expect(OFFER_TRIAL_DAYS).toBe(BILLING_TRIAL_DAYS);
    expect(OFFER_TEACHERS).toBe(WORKSPACE_MEMBER_CAP);
  });

  it("says today's offer in the glossary's words", () => {
    expect(OFFER_PRICE).toBe("$39.99");
    expect(OFFER_TRIAL).toBe("7-day free trial");
    expect(OFFER_SUMMARY).toBe(
      "7-day free trial, then $39.99 a month per workspace. Free for students.",
    );
    expect(OFFER_FACTS).toEqual([
      "Up to 10 teachers in one workspace",
      "A 7-day free trial",
      "Free for students, who are never asked for a card",
    ]);
    expect(OFFER_DESCRIPTION).toBe(
      "One subscription per workspace: $39.99 a month for up to 10 teachers, with a 7-day free " +
        "trial. Free for students.",
    );
    expect(OFFER_TRIAL_TERMS).toMatch(/card at checkout.*trial ends unless you cancel/);
  });
});

// The page's price and what checkout charges are kept in two places: tie them together, so a
// change to one without the other fails here, not on a customer's card statement.
describe("the offer and the Stripe catalog", () => {
  it("shows the amount the catalog's monthly price charges", async () => {
    const { PRICE_TERMS } = await import("../../../scripts/stripe-catalog-lib.mjs");
    expect(OFFER_PRICE).toBe(`$${(PRICE_TERMS.unit_amount / 100).toFixed(2)}`);
  });
});
