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
