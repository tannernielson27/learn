import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./Badge";

describe("Badge", () => {
  it("says its word in a neutral pill by default", () => {
    render(<Badge>Draft</Badge>);
    expect(screen.getByText("Draft")).toHaveClass("bg-surface-2", "rounded-full");
  });

  it("is accent for something new, and a live badge adds a hidden dot to the word", () => {
    const { container } = render(
      <>
        <Badge tone="accent">New</Badge>
        <Badge live>Live</Badge>
      </>,
    );
    expect(screen.getByText("New")).toHaveClass("bg-accent-soft", "text-accent-ink");
    const dot = container.querySelector("[data-live-dot]")!;
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot).toHaveClass("bg-correct");
    expect(screen.getByText("Live")).toContainElement(dot as HTMLElement);
  });
});
