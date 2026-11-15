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
    // The refusal is the only live alert: the state above it is not a live region.
    expect(await screen.findByText(/^Too many tries\./)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Too many tries.");
    expect(screen.getByRole("button", { name: "Start your free trial" })).toBeEnabled();
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
    expect(section().querySelector("[data-notice]")).toHaveTextContent(
      "Thank you. Your free trial has started.",
    );
  });

  it("does not thank anyone when the page shows no subscription", () => {
    setup("start-trial", { confirmed: true });
    expect(section()).not.toHaveTextContent("Thank you");
  });

  describe("one notice per state, and one main action (#563)", () => {
    const notice = () => section().querySelector("[data-notice]");
    const fill = (name: string) =>
      screen.getByRole("button", { name }).className.split(/\s+/).includes("bg-accent");

    it("a failed payment is an alert, with Manage billing as the main action", () => {
      setup("payment-failed");
      expect(notice()).toHaveAttribute("data-notice", "alert");
      expect(notice()).toHaveTextContent("A payment did not go through.");
      expect(fill("Manage billing")).toBe(true);
    });

    it("a workspace with no subscription is an alert, with the trial as the main action", () => {
      setup("start-trial");
      expect(notice()).toHaveAttribute("data-notice", "alert");
      expect(fill("Start your free trial")).toBe(true);
    });

    it("Subscribe is the main action once a trial was had", () => {
      setup("subscribe");
      expect(fill("Subscribe")).toBe(true);
    });

    it.each(["trial", "trial-cancelled", "active", "ending"] as const)(
      "%s is a calm status, with Manage billing as a secondary button",
      (name) => {
        setup(name);
        expect(notice()).toHaveAttribute("data-notice", "status");
        expect(screen.queryByRole("alert")).toBeNull();
        expect(fill("Manage billing")).toBe(false);
      },
    );

    it("free access is a status with no button", () => {
      setup("free");
      expect(notice()).toHaveAttribute("data-notice", "status");
      expect(screen.queryByRole("button")).toBeNull();
    });

    it.each(["payment-failed", "start-trial", "trial", "free"] as const)(
      "%s is on the page when it loads, so it is not a live region",
      (name) => {
        setup(name);
        expect(notice()).not.toHaveAttribute("role");
        expect(screen.queryByRole("alert")).toBeNull();
        expect(screen.queryByRole("status")).toBeNull();
      },
    );

    it("the first sentence is the notice's title", () => {
      setup("payment-failed");
      expect(screen.getByText("A payment did not go through.")).toHaveClass("font-semibold");
    });

    it("dates read as the rest of billing does, in Mountain time", () => {
      setup("trial");
      expect(section()).toHaveTextContent(/ends on \d{1,2} [A-Z][a-z]+ \d{4}\./);
    });

    it("stays busy, not disabled, with its label, while Stripe opens", async () => {
      const fixture = BILLING_FIXTURES.active;
      let finish: (state: BillingActionState) => void = () => {};
      const portalAction = vi.fn(
        () => new Promise<BillingActionState>((resolve) => (finish = resolve)),
      );
      render(
        <BillingSection
          access={fixture.access}
          configured
          trialAvailable={false}
          checkoutAction={vi.fn()}
          portalAction={portalAction}
        />,
      );
      await userEvent.setup().click(screen.getByRole("button", { name: "Manage billing" }));
      const button = screen.getByRole("button", { name: "Manage billing" });
      expect(button).toHaveAttribute("aria-busy", "true");
      expect(button).not.toBeDisabled();
      finish({ status: "idle" });
    });
  });
});
