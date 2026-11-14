import { render, screen } from "@testing-library/react";
import { WifiOff } from "lucide-react";
import { describe, expect, it } from "vitest";
import { Notice } from "./Notice";

describe("Notice", () => {
  it("is a neutral status with an icon and words", () => {
    render(<Notice title="Reconnecting">Stay on this page. Your answer is kept.</Notice>);
    const notice = screen.getByRole("status");
    expect(notice).toHaveTextContent("ReconnectingStay on this page. Your answer is kept.");
    expect(notice).toHaveClass("bg-notice-soft", "text-notice");
    expect(notice.className).not.toMatch(/incorrect|correct/);
    expect(notice.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("interrupts only when asked, and takes another icon", () => {
    const { container } = render(
      <Notice role="alert" icon={WifiOff}>
        Your changes were not saved.
      </Notice>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Your changes were not saved.");
    expect(container.querySelector("svg")).toHaveClass("lucide-wifi-off");
  });
});

describe("Notice status and alert (#563)", () => {
  it("draws an alert apart from a status: the strong rule and an alert mark", () => {
    render(
      <>
        <Notice>Saved.</Notice>
        <Notice role="alert" title="Payment failed">
          Your card was declined.
        </Notice>
      </>,
    );
    const status = screen.getByRole("status");
    const alert = screen.getByRole("alert");
    expect(status).not.toHaveClass("border-rule-strong");
    expect(status.querySelector("svg")).toHaveClass("lucide-info");
    expect(alert).toHaveClass("border-rule-strong", "border-l-4");
    expect(alert.querySelector("svg")).toHaveClass("lucide-circle-alert");
    // Still neutral: never the feedback colours.
    expect(alert.className).not.toMatch(/incorrect|correct|flag/);
    expect(alert).toHaveClass("bg-notice-soft", "text-notice");
  });

  it("takes one action under its words", () => {
    render(
      <Notice role="alert" title="Payment failed" action={<a href="/account">Update card</a>}>
        Your card was declined.
      </Notice>,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toContainElement(screen.getByRole("link", { name: "Update card" }));
    expect(alert).toHaveTextContent("Payment failedYour card was declined.Update card");
  });

  it("has no action row without an action, and no title line without a title", () => {
    render(<Notice>Reconnecting.</Notice>);
    const status = screen.getByRole("status");
    expect(status.querySelector(".font-semibold")).toBeNull();
    expect(status.querySelector(".mt-2")).toBeNull();
  });
});
