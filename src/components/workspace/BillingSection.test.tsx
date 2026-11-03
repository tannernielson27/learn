import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BILLING_FIXTURES, type BillingFixtureName } from "@/lib/billing/billingFixtures";
import { BillingSection, type BillingActionState } from "./BillingSection";

function setup(
  name: BillingFixtureName,
  overrides: { canManage?: boolean; configured?: boolean; confirmed?: boolean } = {},
  answer: BillingActionState = { status: "idle" },
) {
  const fixture = BILLING_FIXTURES[name];
  const checkoutAction = vi.fn(async () => answer);
  const portalAction = vi.fn(async () => answer);
  render(
    <BillingSection
      access={{ ...fixture.access, canManage: overrides.canManage ?? fixture.access.canManage }}
      configured={overrides.configured ?? fixture.configured}
      trialAvailable={fixture.trialAvailable}
      confirmed={overrides.confirmed}
      checkoutAction={checkoutAction}
      portalAction={portalAction}
    />,
  );
  return { checkoutAction, portalAction, user: userEvent.setup() };
}

const section = () => screen.getByRole("region", { name: "Billing" });

describe("BillingSection", () => {
  it("free access: one sentence, no price and no button", () => {
    setup("free");
    expect(section()).toHaveTextContent("This workspace has free access. There is nothing to pay.");
    expect(section()).not.toHaveTextContent(/\$|beta|grandfather|pass/i);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("a trial: when it ends, and Manage billing", () => {
    setup("trial");
    expect(section()).toHaveTextContent("Your free trial ends on 3 November 2026.");
    expect(screen.getByRole("button", { name: "Manage billing" })).toBeEnabled();
  });

  it("a subscription renews, or ends once cancelled", () => {
    setup("active");
    expect(section()).toHaveTextContent("Your subscription renews on 3 December 2026.");
  });

  it("a subscription cancelled at the period's end says when it ends", () => {
    setup("ending");
    expect(section()).toHaveTextContent("Your subscription ends on 3 December 2026.");
    expect(screen.getByRole("button", { name: "Manage billing" })).toBeInTheDocument();
  });

  it("a failed payment asks for the card", () => {
    setup("payment-failed");
    expect(section()).toHaveTextContent("A payment did not go through.");
    expect(section()).toHaveTextContent("Update the card to keep your subscription.");
  });

  it("no subscription: the free trial, or Subscribe once a trial was had", () => {
    setup("start-trial");
    expect(section()).toHaveTextContent("Start a 7-day free trial, then $39.99 a month");
    expect(screen.getByRole("button", { name: "Start your free trial" })).toBeInTheDocument();
  });

  it("offers Subscribe when a trial is no longer available", () => {
    setup("subscribe");
    expect(section()).toHaveTextContent("Your subscription has ended.");
    expect(section()).toHaveTextContent("Subscribe for $39.99 a month, for up to 10 teachers.");
    expect(screen.getByRole("button", { name: "Subscribe" })).toBeInTheDocument();
  });

  it("another teacher sees the status and who to ask, and no button", () => {
    setup("start-trial", { canManage: false });
    expect(section()).toHaveTextContent("The person who started this workspace manages billing.");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("without Stripe set up, shows where things stand and no button", () => {
    setup("not-configured");
    expect(section()).toHaveTextContent("This workspace does not have a subscription.");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("presses Start your free trial through the checkout action, and shows a refusal", async () => {
    const { checkoutAction, portalAction, user } = setup(
      "start-trial",
      {},
      { status: "error", error: "Too many tries. Wait a few minutes, then try again." },
    );
    await user.click(screen.getByRole("button", { name: "Start your free trial" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many tries.");
    expect(checkoutAction).toHaveBeenCalledTimes(1);
    expect(portalAction).not.toHaveBeenCalled();
  });

  it("presses Manage billing through the portal action", async () => {
    const { checkoutAction, portalAction, user } = setup("active");
    await user.click(screen.getByRole("button", { name: "Manage billing" }));
    expect(portalAction).toHaveBeenCalledTimes(1);
    expect(checkoutAction).not.toHaveBeenCalled();
  });

  it("thanks the teacher after a confirmed Checkout, once the trial shows", () => {
    setup("trial", { confirmed: true });
    expect(screen.getByRole("status")).toHaveTextContent("Thank you. Your free trial has started.");
  });

  it("does not thank anyone when the page shows no subscription", () => {
    setup("start-trial", { confirmed: true });
    expect(screen.queryByRole("status")).toBeNull();
  });
});
